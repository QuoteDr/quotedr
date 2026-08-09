-- MANUAL DEPLOYMENT STEP - DO NOT RUN UNTIL THE voice-audio FUNCTION IS LIVE.
--
-- Before running, create these Vault secrets and configure the Edge Function
-- secret VOICE_AUDIO_CLEANUP_TOKEN with the same random cleanup-token value:
--   project_url              https://<project-ref>.supabase.co
--   publishable_key          the project's publishable key
--   voice_audio_cleanup_token a dedicated high-entropy random token
--
-- This is intentionally not a timestamped migration. Retention scheduling must
-- only be activated after the schema and function are deployed and verified.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $do$
declare
  missing_names text;
begin
  select string_agg(required.name, ', ' order by required.name)
  into missing_names
  from (values
    ('project_url'),
    ('publishable_key'),
    ('voice_audio_cleanup_token')
  ) as required(name)
  where not exists (
    select 1 from vault.decrypted_secrets secret where secret.name = required.name
  );

  if missing_names is not null then
    raise exception 'Missing required Vault secrets: %', missing_names;
  end if;

  if exists (select 1 from cron.job where jobname = 'purge-ai-voice-audio-evidence-hourly') then
    perform cron.unschedule('purge-ai-voice-audio-evidence-hourly');
  end if;
end
$do$;

select cron.schedule(
  'purge-ai-voice-audio-evidence-hourly',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/voice-audio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-quotedr-cleanup-token', (select decrypted_secret from vault.decrypted_secrets where name = 'voice_audio_cleanup_token'),
      'User-Agent', 'QuoteDr Voice Audio Retention'
    ),
    body := jsonb_build_object(
      'action', 'cleanup_expired',
      'source', 'pg_cron',
      'scheduled_at', now()
    )
  ) as request_id;
  $cron$
);

commit;
