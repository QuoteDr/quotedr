-- Schedule QuoteDr Pro trial follow-up emails.
--
-- Runs once daily and invokes the pro-trial-followup Edge Function, which:
-- - finds free/basic users with due Pro trial follow-ups
-- - skips users who have upgraded to Pro
-- - sends one Resend email
-- - marks the feature follow-up as sent

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'invoke-pro-trial-followup-daily'
  ) then
    perform cron.unschedule('invoke-pro-trial-followup-daily');
  end if;
end $$;

select cron.schedule(
  'invoke-pro-trial-followup-daily',
  '30 13 * * *', -- daily at 13:30 UTC
  $$
  select net.http_post(
    url := 'https://axmoffknvblluibuitrq.supabase.co/functions/v1/pro-trial-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'QuoteDr Supabase Cron'
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'job', 'invoke-pro-trial-followup-daily',
      'scheduled_at', now()
    )
  ) as request_id;
  $$
);
