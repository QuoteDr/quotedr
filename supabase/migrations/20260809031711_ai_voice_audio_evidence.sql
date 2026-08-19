-- Optional, short-lived Voice To Quote audio evidence.
--
-- Audio bytes live only in the private Storage bucket. Postgres contains
-- lifecycle and audit metadata, never an audio blob. Browser clients cannot
-- read or write either the bucket or these metadata tables directly; the
-- authenticated voice-audio Edge Function issues path-bound upload tokens and
-- short-lived playback URLs after enforcing ownership, consent, quota, holds,
-- and access auditing.

begin;

alter table public.ai_voice_transcript_preferences
  add column if not exists save_audio_for_support boolean not null default false,
  add column if not exists audio_consent_version text,
  add column if not exists audio_consent_at timestamptz;

alter table public.ai_voice_transcript_preferences
  drop constraint if exists ai_voice_transcript_preferences_audio_consent_check;
alter table public.ai_voice_transcript_preferences
  add constraint ai_voice_transcript_preferences_audio_consent_check
  check (
    save_audio_for_support = false
    or (
      char_length(coalesce(audio_consent_version, '')) between 1 and 40
      and audio_consent_at is not null
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-voice-audio-evidence',
  'ai-voice-audio-evidence',
  false,
  6291456,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ai_voice_audio_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_id uuid references public.ai_voice_transcripts(id) on delete set null,
  object_path text not null unique check (char_length(object_path) between 20 and 500),
  mime_type text not null check (
    split_part(lower(mime_type), ';', 1) in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac')
  ),
  duration_ms integer not null check (duration_ms between 250 and 300000),
  byte_size bigint not null check (byte_size between 1 and 6291456),
  upload_status text not null default 'upload_pending'
    check (upload_status in ('upload_pending', 'ready', 'deletion_pending', 'failed', 'deleted', 'expired')),
  idempotency_key uuid not null,
  notice_version text not null check (char_length(notice_version) between 1 and 40),
  upload_deadline timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  support_hold_state text not null default 'none'
    check (support_hold_state in ('none', 'active', 'closed')),
  support_case_reference text check (support_case_reference is null or char_length(support_case_reference) between 5 and 120),
  support_case_reason text check (support_case_reason is null or char_length(support_case_reason) between 10 and 500),
  support_authorized_at timestamptz,
  support_authorized_by uuid references auth.users(id) on delete set null,
  support_case_closed_at timestamptz,
  post_case_delete_at timestamptz,
  last_accessed_at timestamptz,
  deleted_at timestamptz,
  deletion_reason text check (deletion_reason is null or char_length(deletion_reason) <= 160),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (transcript_id),
  check (
    support_hold_state = 'none'
    or (
      support_case_reference is not null
      and support_case_reason is not null
      and support_authorized_at is not null
    )
  ),
  check (
    support_hold_state <> 'closed'
    or (
      support_case_closed_at is not null
      and post_case_delete_at is not null
    )
  )
);

create index if not exists ai_voice_audio_recordings_owner_created_idx
  on public.ai_voice_audio_recordings(user_id, created_at desc);
create index if not exists ai_voice_audio_recordings_expiry_idx
  on public.ai_voice_audio_recordings(upload_status, expires_at)
  where deleted_at is null;
create index if not exists ai_voice_audio_recordings_upload_deadline_idx
  on public.ai_voice_audio_recordings(upload_deadline)
  where upload_status = 'upload_pending' and deleted_at is null;
create index if not exists ai_voice_audio_recordings_case_delete_idx
  on public.ai_voice_audio_recordings(post_case_delete_at)
  where support_hold_state = 'closed' and deleted_at is null;
create index if not exists ai_voice_audio_recordings_support_case_idx
  on public.ai_voice_audio_recordings(user_id, support_case_reference)
  where support_hold_state = 'active' and deleted_at is null;
create index if not exists ai_voice_audio_recordings_support_authorizer_idx
  on public.ai_voice_audio_recordings(support_authorized_by)
  where support_authorized_by is not null;
create index if not exists ai_voice_audio_recordings_deletion_retry_idx
  on public.ai_voice_audio_recordings(updated_at)
  where upload_status = 'deletion_pending' and deleted_at is null;

create table if not exists public.ai_voice_audio_access_audit (
  id bigint generated always as identity primary key,
  recording_id uuid references public.ai_voice_audio_recordings(id) on delete set null,
  transcript_id uuid references public.ai_voice_transcripts(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '' check (char_length(actor_email) <= 320),
  actor_role text not null check (actor_role in ('owner', 'support', 'system')),
  action text not null check (action in (
    'upload_prepare',
    'upload_finalize',
    'owner_playback',
    'owner_delete',
    'transcript_delete',
    'preserve_authorized',
    'hold_closed_owner',
    'support_list',
    'support_playback',
    'hold_closed_support',
    'expiry_delete',
    'orphan_delete'
  )),
  case_reference text check (case_reference is null or char_length(case_reference) between 5 and 120),
  reason text check (reason is null or char_length(reason) <= 500),
  outcome text not null default 'started' check (outcome in ('started', 'completed', 'denied', 'failed')),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  signed_url_expires_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 years')
);

create index if not exists ai_voice_audio_access_recording_idx
  on public.ai_voice_audio_access_audit(recording_id, requested_at desc);
create index if not exists ai_voice_audio_access_owner_idx
  on public.ai_voice_audio_access_audit(owner_user_id, requested_at desc);
create index if not exists ai_voice_audio_access_transcript_idx
  on public.ai_voice_audio_access_audit(transcript_id)
  where transcript_id is not null;
create index if not exists ai_voice_audio_access_actor_idx
  on public.ai_voice_audio_access_audit(actor_user_id)
  where actor_user_id is not null;
create index if not exists ai_voice_audio_access_expiry_idx
  on public.ai_voice_audio_access_audit(expires_at);

alter table public.ai_voice_audio_recordings enable row level security;
alter table public.ai_voice_audio_access_audit enable row level security;

revoke all on table public.ai_voice_audio_recordings from public, anon, authenticated;
revoke all on table public.ai_voice_audio_access_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_voice_audio_recordings to service_role;
grant select, insert, update, delete on table public.ai_voice_audio_access_audit to service_role;
grant usage, select on sequence public.ai_voice_audio_access_audit_id_seq to service_role;

-- Text remains owner-readable, but deletion now goes through the Edge Function
-- so Storage cleanup and active support holds cannot be bypassed.
revoke delete on table public.ai_voice_transcripts from authenticated;
drop policy if exists "Users can delete own voice transcripts" on public.ai_voice_transcripts;

-- No authenticated Storage policies are created for this bucket. A private
-- bucket with no client policies is deny-by-default. The Edge Function uses the
-- service role to create a path-bound signed upload token and a 60-second
-- playback URL only after authorization and audit checks.
drop policy if exists "ai_voice_audio_owner_select" on storage.objects;
drop policy if exists "ai_voice_audio_owner_insert" on storage.objects;
drop policy if exists "ai_voice_audio_owner_update" on storage.objects;
drop policy if exists "ai_voice_audio_owner_delete" on storage.objects;

create or replace function public.quotedr_reserve_ai_voice_audio_recording(
  p_user_id uuid,
  p_transcript_id uuid,
  p_mime_type text,
  p_duration_ms integer,
  p_byte_size bigint,
  p_idempotency_key uuid,
  p_notice_version text
)
returns setof public.ai_voice_audio_recordings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_record public.ai_voice_audio_recordings%rowtype;
  preference public.ai_voice_transcript_preferences%rowtype;
  recording_id uuid;
  storage_extension text;
  used_bytes bigint;
begin
  if p_user_id is null or p_transcript_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'voice_audio_invalid_request';
  end if;
  if p_duration_ms < 250 or p_duration_ms > 300000 then
    raise exception using errcode = 'P0001', message = 'voice_audio_duration_limit';
  end if;
  if p_byte_size < 1 or p_byte_size > 6291456 then
    raise exception using errcode = 'P0001', message = 'voice_audio_size_limit';
  end if;
  if split_part(lower(p_mime_type), ';', 1) not in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac') then
    raise exception using errcode = 'P0001', message = 'voice_audio_mime_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into preference
  from public.ai_voice_transcript_preferences
  where user_id = p_user_id
  for update;

  if not found
    or preference.notice_version <> p_notice_version
    or preference.save_audio_for_support is not true
    or preference.audio_consent_version <> p_notice_version
    or preference.audio_consent_at is null
  then
    raise exception using errcode = 'P0001', message = 'voice_audio_consent_required';
  end if;

  perform 1
  from public.ai_voice_transcripts
  where id = p_transcript_id and user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'voice_audio_transcript_not_found';
  end if;

  select * into existing_record
  from public.ai_voice_audio_recordings
  where user_id = p_user_id
    and (idempotency_key = p_idempotency_key or transcript_id = p_transcript_id)
  order by created_at asc
  limit 1;
  if found then
    return next existing_record;
    return;
  end if;

  select coalesce(sum(byte_size), 0)::bigint into used_bytes
  from public.ai_voice_audio_recordings
  where user_id = p_user_id
    and deleted_at is null
    and (
      (upload_status = 'upload_pending' and upload_deadline > now())
      or (
        upload_status = 'ready'
        and (
          support_hold_state = 'active'
          or (support_hold_state = 'none' and expires_at > now())
          or (support_hold_state = 'closed' and post_case_delete_at > now())
        )
      )
    );
  if used_bytes + p_byte_size > 104857600 then
    raise exception using errcode = 'P0001', message = 'voice_audio_quota_exceeded';
  end if;

  recording_id := gen_random_uuid();
  storage_extension := case split_part(lower(p_mime_type), ';', 1)
    when 'audio/webm' then 'webm'
    when 'audio/ogg' then 'ogg'
    when 'audio/mp4' then 'm4a'
    when 'audio/aac' then 'aac'
  end;

  insert into public.ai_voice_audio_recordings (
    id,
    user_id,
    transcript_id,
    object_path,
    mime_type,
    duration_ms,
    byte_size,
    idempotency_key,
    notice_version
  ) values (
    recording_id,
    p_user_id,
    p_transcript_id,
    p_user_id::text || '/' || p_transcript_id::text || '/' || recording_id::text || '.' || storage_extension,
    lower(p_mime_type),
    p_duration_ms,
    p_byte_size,
    p_idempotency_key,
    p_notice_version
  )
  returning * into existing_record;

  return next existing_record;
end
$function$;

revoke all on function public.quotedr_reserve_ai_voice_audio_recording(uuid, uuid, text, integer, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.quotedr_reserve_ai_voice_audio_recording(uuid, uuid, text, integer, bigint, uuid, text) to service_role;

create or replace function public.quotedr_finalize_ai_voice_audio_recording(
  p_user_id uuid,
  p_recording_id uuid,
  p_actual_mime_type text,
  p_actual_byte_size bigint
)
returns setof public.ai_voice_audio_recordings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recording public.ai_voice_audio_recordings%rowtype;
  used_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into recording
  from public.ai_voice_audio_recordings
  where id = p_recording_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'voice_audio_recording_not_found';
  end if;
  if recording.upload_status = 'ready' then
    return next recording;
    return;
  end if;
  if recording.upload_status <> 'upload_pending' or recording.deleted_at is not null or recording.upload_deadline <= now() then
    raise exception using errcode = 'P0001', message = 'voice_audio_upload_expired';
  end if;
  if p_actual_byte_size < 1 or p_actual_byte_size > 6291456 then
    raise exception using errcode = 'P0001', message = 'voice_audio_size_limit';
  end if;
  if split_part(lower(p_actual_mime_type), ';', 1) <> split_part(lower(recording.mime_type), ';', 1) then
    raise exception using errcode = 'P0001', message = 'voice_audio_mime_mismatch';
  end if;

  select coalesce(sum(byte_size), 0)::bigint into used_bytes
  from public.ai_voice_audio_recordings
  where user_id = p_user_id
    and id <> p_recording_id
    and deleted_at is null
    and (
      (upload_status = 'upload_pending' and upload_deadline > now())
      or (
        upload_status = 'ready'
        and (
          support_hold_state = 'active'
          or (support_hold_state = 'none' and expires_at > now())
          or (support_hold_state = 'closed' and post_case_delete_at > now())
        )
      )
    );
  if used_bytes + p_actual_byte_size > 104857600 then
    raise exception using errcode = 'P0001', message = 'voice_audio_quota_exceeded';
  end if;

  update public.ai_voice_audio_recordings
  set mime_type = lower(p_actual_mime_type),
      byte_size = p_actual_byte_size,
      upload_status = 'ready',
      finalized_at = now(),
      updated_at = now(),
      failure_reason = null
  where id = p_recording_id
  returning * into recording;

  return next recording;
end
$function$;

revoke all on function public.quotedr_finalize_ai_voice_audio_recording(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.quotedr_finalize_ai_voice_audio_recording(uuid, uuid, text, bigint) to service_role;

comment on table public.ai_voice_audio_recordings is
  'Lifecycle metadata for optional Voice To Quote support audio. Audio bytes are stored only in the private Storage bucket.';
comment on table public.ai_voice_audio_access_audit is
  'Service-only audit trail for Voice To Quote audio upload, playback, hold, deletion, and cleanup actions.';
comment on table public.ai_voice_transcripts is
  'User-visible Voice To Quote text transcripts. Optional audio is stored separately in a private Storage bucket and expires independently.';

notify pgrst, 'reload schema';

commit;
