-- Account-owned Voice To Quote transcript history.
-- Audio is never stored. Browser clients can only read/delete their own
-- transcripts; capture/status updates and support review use the authenticated
-- Edge Function so account email and audit fields are server-authored.

create table if not exists public.ai_voice_transcript_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notice_version text not null check (char_length(notice_version) between 1 and 40),
  acknowledged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_voice_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_email text not null default '' check (char_length(account_email) <= 320),
  transcript text not null check (char_length(btrim(transcript)) between 1 and 12000),
  source text not null default 'web_speech_recognition'
    check (source in ('web_speech_recognition')),
  notice_version text not null check (char_length(notice_version) between 1 and 40),
  status text not null default 'parsing'
    check (status in ('parsing', 'review_ready', 'added_to_quote', 'parse_failed')),
  parser_audit_status text not null default 'pending'
    check (parser_audit_status in ('pending', 'verified', 'corrected', 'blocked', 'failed')),
  parser_audit_passes integer not null default 0
    check (parser_audit_passes between 0 and 3),
  quote_id uuid references public.quotes(id) on delete set null,
  quote_number text not null default '' check (char_length(quote_number) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  added_to_quote_at timestamptz
);

create index if not exists ai_voice_transcripts_user_created_idx
  on public.ai_voice_transcripts(user_id, created_at desc);

create index if not exists ai_voice_transcripts_email_created_idx
  on public.ai_voice_transcripts(account_email, created_at desc);

create index if not exists ai_voice_transcripts_quote_idx
  on public.ai_voice_transcripts(quote_id)
  where quote_id is not null;

create table if not exists public.ai_voice_transcript_support_access (
  id bigint generated always as identity primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text not null,
  target_email text not null,
  target_user_ids uuid[] not null default '{}',
  case_reference text not null check (char_length(case_reference) between 5 and 300),
  transcript_ids uuid[] not null default '{}',
  result_count integer not null default 0 check (result_count between 0 and 100),
  result_offset integer not null default 0 check (result_offset >= 0),
  accessed_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 years')
);

create index if not exists ai_voice_transcript_support_accessed_idx
  on public.ai_voice_transcript_support_access(accessed_at desc);

alter table public.ai_voice_transcript_preferences enable row level security;
alter table public.ai_voice_transcripts enable row level security;
alter table public.ai_voice_transcript_support_access enable row level security;

revoke all on table public.ai_voice_transcript_preferences from public, anon, authenticated;
revoke all on table public.ai_voice_transcripts from public, anon, authenticated;
revoke all on table public.ai_voice_transcript_support_access from public, anon, authenticated;

grant select, insert, update, delete on table public.ai_voice_transcript_preferences to authenticated;
grant select, delete on table public.ai_voice_transcripts to authenticated;

grant select, insert, update, delete on table public.ai_voice_transcript_preferences to service_role;
grant select, insert, update, delete on table public.ai_voice_transcripts to service_role;
grant select, insert, update, delete on table public.ai_voice_transcript_support_access to service_role;
grant usage, select on sequence public.ai_voice_transcript_support_access_id_seq to service_role;

drop policy if exists "Users can read own voice transcript preference" on public.ai_voice_transcript_preferences;
create policy "Users can read own voice transcript preference"
  on public.ai_voice_transcript_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can acknowledge own voice transcript notice" on public.ai_voice_transcript_preferences;
create policy "Users can acknowledge own voice transcript notice"
  on public.ai_voice_transcript_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own voice transcript preference" on public.ai_voice_transcript_preferences;
create policy "Users can update own voice transcript preference"
  on public.ai_voice_transcript_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own voice transcript preference" on public.ai_voice_transcript_preferences;
create policy "Users can delete own voice transcript preference"
  on public.ai_voice_transcript_preferences
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own voice transcripts" on public.ai_voice_transcripts;
create policy "Users can read own voice transcripts"
  on public.ai_voice_transcripts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own voice transcripts" on public.ai_voice_transcripts;
create policy "Users can delete own voice transcripts"
  on public.ai_voice_transcripts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.ai_voice_transcripts is
  'User-visible Voice To Quote text transcripts. No audio recordings are stored.';
comment on table public.ai_voice_transcript_support_access is
  'Audit trail for administrator transcript access tied to a customer support case.';

do $do$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for existing_job_id in execute
      'select jobid from cron.job where jobname = ''purge-ai-voice-transcript-support-access'''
    loop
      execute 'select cron.unschedule($1)' using existing_job_id;
    end loop;

    execute $schedule$
      select cron.schedule(
        'purge-ai-voice-transcript-support-access',
        '29 4 * * *',
        $command$
          delete from public.ai_voice_transcript_support_access
          where expires_at <= now();
        $command$
      )
    $schedule$;
  end if;
end
$do$;
