create table if not exists public.save_recovery_records (
  operation_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default '',
  revision text not null,
  payload_hash text not null default '',
  entity_type text not null,
  entity_id text not null default '',
  entity_label text not null default '',
  save_action text not null default 'upsert'
    check (save_action in ('upsert', 'insert', 'update', 'delete')),
  payload jsonb not null default '{}'::jsonb,
  recovery_target jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'retry_requested', 'resolved', 'discarded')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error jsonb,
  source_page text not null default '',
  app_version text not null default '',
  local_saved_at timestamptz,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  alert_sent_at timestamptz,
  retry_requested_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists save_recovery_records_user_status_idx
  on public.save_recovery_records(user_id, status, last_failed_at desc);

create index if not exists save_recovery_records_status_age_idx
  on public.save_recovery_records(status, last_failed_at desc);

create table if not exists public.external_operation_receipts (
  idempotency_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null,
  payload_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  response jsonb,
  last_error text not null default '',
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.external_operation_receipts enable row level security;
revoke all on table public.external_operation_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.external_operation_receipts to service_role;

alter table public.payment_records add column if not exists idempotency_key text;
create unique index if not exists payment_records_idempotency_key_idx
  on public.payment_records(idempotency_key)
  where idempotency_key is not null;

alter table public.save_recovery_records enable row level security;

grant select, update on table public.save_recovery_records to authenticated;
grant select, insert, update, delete on table public.save_recovery_records to service_role;

drop policy if exists "Users can read own save recovery records" on public.save_recovery_records;
create policy "Users can read own save recovery records"
  on public.save_recovery_records
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca'
  );

drop policy if exists "Users can update own save recovery records" on public.save_recovery_records;
create policy "Users can update own save recovery records"
  on public.save_recovery_records
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca'
  )
  with check (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca'
  );

create or replace function public.purge_expired_save_recovery_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.save_recovery_records
  where (status in ('resolved', 'discarded') and coalesce(resolved_at, updated_at) < now() - interval '30 days')
     or (status in ('pending', 'retry_requested') and last_failed_at < now() - interval '90 days');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_save_recovery_records() from public, anon, authenticated;
grant execute on function public.purge_expired_save_recovery_records() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for existing_job_id in execute 'select jobid from cron.job where jobname = ''purge-save-recovery-records'''
    loop
      execute 'select cron.unschedule($1)' using existing_job_id;
    end loop;
    execute $schedule$
      select cron.schedule(
        'purge-save-recovery-records',
        '17 3 * * *',
        'select public.purge_expired_save_recovery_records();'
      )
    $schedule$;
  end if;
end
$$;
