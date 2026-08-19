create table if not exists public.visitor_alerts (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  session_fingerprint text not null
    check (session_fingerprint ~ '^[a-f0-9]{64}$'),
  visitor_label text not null
    check (visitor_label ~ '^Visitor [A-F0-9]{4}$'),
  intent text not null
    check (intent in (
      'pricing_opened',
      'signup_gate_opened',
      'newsletter_signup_completed',
      'contact_opened'
    )),
  route text not null default '/unknown'
    check (char_length(route) between 1 and 160),
  city text not null default ''
    check (char_length(city) <= 120),
  region text not null default ''
    check (char_length(region) <= 120),
  country text not null default ''
    check (char_length(country) <= 120),
  referrer_domain text not null default 'direct'
    check (char_length(referrer_domain) between 1 and 160),
  device text not null default 'Unknown'
    check (char_length(device) between 1 and 120),
  event_at timestamptz not null default now(),
  email_reserved_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists visitor_alerts_event_at_idx
  on public.visitor_alerts(event_at desc);

create index if not exists visitor_alerts_session_notification_idx
  on public.visitor_alerts(session_fingerprint, email_reserved_at desc, emailed_at desc);

alter table public.visitor_alerts enable row level security;

revoke all on table public.visitor_alerts from public, anon, authenticated;
grant select on table public.visitor_alerts to authenticated;
grant select, insert, update, delete on table public.visitor_alerts to service_role;

drop policy if exists visitor_alerts_admin_read on public.visitor_alerts;
create policy visitor_alerts_admin_read
  on public.visitor_alerts
  for select
  to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );

create or replace function public.record_visitor_alert(
  p_provider_event_id text,
  p_session_fingerprint text,
  p_visitor_label text,
  p_intent text,
  p_route text,
  p_city text,
  p_region text,
  p_country text,
  p_referrer_domain text,
  p_device text,
  p_event_at timestamptz
)
returns table(alert_id uuid, should_email boolean)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_alert_id uuid;
  v_should_email boolean;
  v_existing_reserved_at timestamptz;
  v_existing_emailed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_fingerprint, 0));

  select va.id, va.email_reserved_at, va.emailed_at
    into v_alert_id, v_existing_reserved_at, v_existing_emailed_at
    from public.visitor_alerts va
   where va.provider_event_id = p_provider_event_id;

  if v_alert_id is not null then
    if coalesce(v_existing_emailed_at, v_existing_reserved_at) >= now() - interval '30 minutes' then
      return query select v_alert_id, false;
      return;
    end if;

    select not exists (
      select 1
        from public.visitor_alerts va
       where va.session_fingerprint = p_session_fingerprint
         and va.id <> v_alert_id
         and coalesce(va.emailed_at, va.email_reserved_at) >= now() - interval '30 minutes'
    )
    into v_should_email;

    if v_should_email then
      update public.visitor_alerts
         set email_reserved_at = now()
       where id = v_alert_id;
    end if;

    return query select v_alert_id, v_should_email;
    return;
  end if;

  select not exists (
    select 1
      from public.visitor_alerts va
     where va.session_fingerprint = p_session_fingerprint
       and coalesce(va.emailed_at, va.email_reserved_at) >= now() - interval '30 minutes'
  )
  into v_should_email;

  insert into public.visitor_alerts (
    provider_event_id,
    session_fingerprint,
    visitor_label,
    intent,
    route,
    city,
    region,
    country,
    referrer_domain,
    device,
    event_at,
    email_reserved_at
  )
  values (
    p_provider_event_id,
    p_session_fingerprint,
    p_visitor_label,
    p_intent,
    p_route,
    p_city,
    p_region,
    p_country,
    p_referrer_domain,
    p_device,
    coalesce(p_event_at, now()),
    case when v_should_email then now() else null end
  )
  returning id into v_alert_id;

  return query select v_alert_id, v_should_email;
end;
$function$;

revoke all on function public.record_visitor_alert(
  text, text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.record_visitor_alert(
  text, text, text, text, text, text, text, text, text, text, timestamptz
) to service_role;

do $do$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for existing_job_id in execute
      'select jobid from cron.job where jobname = ''purge-visitor-alerts'''
    loop
      execute 'select cron.unschedule($1)' using existing_job_id;
    end loop;

    execute $schedule$
      select cron.schedule(
        'purge-visitor-alerts',
        '23 4 * * *',
        $command$delete from public.visitor_alerts where created_at < now() - interval '90 days';$command$
      )
    $schedule$;
  end if;
end
$do$;
