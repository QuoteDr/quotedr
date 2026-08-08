-- Privacy-minimized, administrator-only trend intelligence for QuoteDr Assistant.
-- No chat text, email address, client data, conversation id, or reusable user id is stored.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists quotedr_private;
revoke all on schema quotedr_private from public, anon, authenticated;

create table if not exists quotedr_private.chatbot_feedback_secret (
  singleton boolean primary key default true check (singleton),
  hmac_key bytea not null check (octet_length(hmac_key) >= 32),
  created_at timestamptz not null default now()
);

revoke all on table quotedr_private.chatbot_feedback_secret from public, anon, authenticated;

insert into quotedr_private.chatbot_feedback_secret (singleton, hmac_key)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

create table if not exists public.chatbot_feedback_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  distinct_user_threshold integer not null default 3
    check (distinct_user_threshold between 2 and 20),
  window_days integer not null default 14
    check (window_days between 1 and 90),
  cooldown_days integer not null default 14
    check (cooldown_days between 1 and 90),
  retention_days integer not null default 90
    check (retention_days between 30 and 180),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.chatbot_feedback_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.chatbot_feedback_themes (
  topic_key text primary key check (topic_key in (
    'ai_voice_to_quote',
    'choice_groups',
    'invoices_payments',
    'quotes_approvals',
    'quote_builder',
    'saved_items_pricing',
    'client_portal',
    'clients_contacts',
    'dashboard_sync',
    'templates',
    'ai_quote_copilot',
    'smart_import',
    'floor_plan_scanner',
    'quickbooks',
    'job_tracking_expenses',
    'change_orders',
    'photos_media',
    'notifications_followups',
    'account_plan',
    'assistant_help',
    'support_feedback'
  )),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_question_count bigint not null default 0 check (total_question_count >= 0),
  alerted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  snoozed_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_feedback_observations (
  id bigint generated always as identity primary key,
  topic_key text not null references public.chatbot_feedback_themes(topic_key) on delete cascade,
  user_fingerprint text not null check (user_fingerprint ~ '^[a-f0-9]{64}$'),
  observed_on date not null default current_date,
  intent_key text not null check (intent_key in (
    'problem', 'feature_request', 'how_to', 'clarification', 'other'
  )),
  surface_key text not null check (surface_key in (
    'quote_builder', 'dashboard', 'settings', 'help', 'other'
  )),
  question_count integer not null default 1 check (question_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (topic_key, user_fingerprint, observed_on, intent_key, surface_key)
);

create index if not exists chatbot_feedback_observations_topic_window_idx
  on public.chatbot_feedback_observations(topic_key, last_seen_at desc);

create index if not exists chatbot_feedback_observations_retention_idx
  on public.chatbot_feedback_observations(last_seen_at);

alter table public.chatbot_feedback_settings enable row level security;
alter table public.chatbot_feedback_themes enable row level security;
alter table public.chatbot_feedback_observations enable row level security;

-- Contractors and browser clients have no direct table access. The authenticated
-- Edge Function is the only entry point and never returns fingerprints.
revoke all on table public.chatbot_feedback_settings from public, anon, authenticated;
revoke all on table public.chatbot_feedback_themes from public, anon, authenticated;
revoke all on table public.chatbot_feedback_observations from public, anon, authenticated;

grant select, insert, update, delete on table public.chatbot_feedback_settings to service_role;
grant select, insert, update, delete on table public.chatbot_feedback_themes to service_role;
grant select, insert, update, delete on table public.chatbot_feedback_observations to service_role;
grant usage, select on sequence public.chatbot_feedback_observations_id_seq to service_role;

create or replace function public.record_chatbot_feedback_observation(
  p_user_id uuid,
  p_topic_key text,
  p_intent_key text,
  p_surface_key text
)
returns table(recorded boolean, alert_created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.chatbot_feedback_settings%rowtype;
  v_theme public.chatbot_feedback_themes%rowtype;
  v_hmac_key bytea;
  v_user_fingerprint text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count_from timestamptz;
  v_distinct_users integer := 0;
  v_alert_created boolean := false;
begin
  if p_user_id is null then
    raise exception 'authenticated user is required' using errcode = '22023';
  end if;

  if p_topic_key not in (
    'ai_voice_to_quote', 'choice_groups', 'invoices_payments', 'quotes_approvals',
    'quote_builder', 'saved_items_pricing', 'client_portal', 'clients_contacts',
    'dashboard_sync', 'templates', 'ai_quote_copilot', 'smart_import',
    'floor_plan_scanner', 'quickbooks', 'job_tracking_expenses', 'change_orders',
    'photos_media', 'notifications_followups', 'account_plan', 'assistant_help',
    'support_feedback'
  ) then
    raise exception 'unsupported chatbot feedback topic' using errcode = '22023';
  end if;

  if p_intent_key not in ('problem', 'feature_request', 'how_to', 'clarification', 'other') then
    raise exception 'unsupported chatbot feedback intent' using errcode = '22023';
  end if;

  if p_surface_key not in ('quote_builder', 'dashboard', 'settings', 'help', 'other') then
    raise exception 'unsupported chatbot feedback surface' using errcode = '22023';
  end if;

  select * into v_settings
    from public.chatbot_feedback_settings
   where singleton = true
   for update;

  if not found or not v_settings.enabled then
    return query select false, false;
    return;
  end if;

  select hmac_key into v_hmac_key
    from quotedr_private.chatbot_feedback_secret
   where singleton = true;

  if v_hmac_key is null then
    raise exception 'chatbot feedback privacy key is unavailable';
  end if;

  -- Including the topic in the HMAC prevents linking one user's activity across themes.
  v_user_fingerprint := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(p_user_id::text || ':' || p_topic_key, 'UTF8'),
      v_hmac_key,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chatbot-feedback:' || p_topic_key, 0));

  insert into public.chatbot_feedback_themes (
    topic_key, first_seen_at, last_seen_at, total_question_count, updated_at
  ) values (
    p_topic_key, v_now, v_now, 1, v_now
  )
  on conflict (topic_key) do update
    set last_seen_at = excluded.last_seen_at,
        total_question_count = public.chatbot_feedback_themes.total_question_count + 1,
        updated_at = excluded.updated_at;

  insert into public.chatbot_feedback_observations (
    topic_key,
    user_fingerprint,
    observed_on,
    intent_key,
    surface_key,
    question_count,
    first_seen_at,
    last_seen_at
  ) values (
    p_topic_key,
    v_user_fingerprint,
    v_now::date,
    p_intent_key,
    p_surface_key,
    1,
    v_now,
    v_now
  )
  on conflict (topic_key, user_fingerprint, observed_on, intent_key, surface_key) do update
    set question_count = public.chatbot_feedback_observations.question_count + 1,
        last_seen_at = excluded.last_seen_at;

  select * into v_theme
    from public.chatbot_feedback_themes
   where topic_key = p_topic_key
   for update;

  v_count_from := v_now - pg_catalog.make_interval(days => v_settings.window_days);
  if v_theme.reviewed_at is not null
     and (v_theme.alerted_at is null or v_theme.reviewed_at >= v_theme.alerted_at) then
    v_count_from := greatest(v_count_from, v_theme.reviewed_at);
  end if;

  select count(distinct observation.user_fingerprint)::integer
    into v_distinct_users
    from public.chatbot_feedback_observations observation
   where observation.topic_key = p_topic_key
     and observation.last_seen_at >= v_count_from;

  if v_distinct_users >= v_settings.distinct_user_threshold
     and (v_theme.snoozed_until is null or v_theme.snoozed_until <= v_now)
     and (
       v_theme.alerted_at is null
       or (
         v_theme.reviewed_at is not null
         and v_theme.reviewed_at >= v_theme.alerted_at
         and v_theme.reviewed_at <= v_now - pg_catalog.make_interval(days => v_settings.cooldown_days)
       )
     ) then
    update public.chatbot_feedback_themes
       set alerted_at = v_now,
           snoozed_until = null,
           updated_at = v_now
     where topic_key = p_topic_key;
    v_alert_created := true;
  end if;

  return query select true, v_alert_created;
end;
$function$;

revoke all on function public.record_chatbot_feedback_observation(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_chatbot_feedback_observation(uuid, text, text, text)
  to service_role;

do $do$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for existing_job_id in execute
      'select jobid from cron.job where jobname = ''purge-chatbot-feedback-intelligence'''
    loop
      execute 'select cron.unschedule($1)' using existing_job_id;
    end loop;

    execute $schedule$
      select cron.schedule(
        'purge-chatbot-feedback-intelligence',
        '41 4 * * *',
        $command$
          delete from public.chatbot_feedback_observations observation
          using public.chatbot_feedback_settings settings
          where settings.singleton = true
            and observation.last_seen_at < now() - make_interval(days => settings.retention_days);

          delete from public.chatbot_feedback_themes theme
          using public.chatbot_feedback_settings settings
          where settings.singleton = true
            and theme.last_seen_at < now() - make_interval(days => settings.retention_days);
        $command$
      )
    $schedule$;
  end if;
end
$do$;
