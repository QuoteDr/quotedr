begin;
alter table public.portal_designs drop constraint portal_designs_size_bytes_check;
alter table public.portal_designs add constraint portal_designs_size_bytes_check check (size_bytes between 0 and 30000000);
update storage.buckets set file_size_limit=30000000 where id='portal-designs';

-- Owner/account scope, not individual teammate or portal. Only successful file
-- versions count. The ledger survives withdrawal, replacement and design deletion.
create table public.portal_render_upload_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  uploads integer not null check (uploads between 0 and 3),
  primary key(user_id, month_start)
);
alter table public.portal_render_upload_months enable row level security;
revoke all on public.portal_render_upload_months from public, anon, authenticated;
grant all on public.portal_render_upload_months to service_role;

create function public.count_portal_render_upload() returns trigger
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; used integer;
begin
  if new.storage_path is null then return new; end if;
  if TG_OP='UPDATE' then
    if new.storage_path is not distinct from old.storage_path then return new; end if;
  end if;
  select user_id into strict owner_id from public.portal_design_libraries where id=new.library_id;
  -- Atomic conditional upsert serializes concurrent saves for this owner/month.
  -- A failed transaction rolls back its allowance increment too.
  insert into public.portal_render_upload_months as usage(user_id,month_start,uploads)
    values(owner_id,date_trunc('month',now() at time zone 'UTC')::date,1)
  on conflict(user_id,month_start) do update set uploads=usage.uploads+1
    where usage.uploads<3
  returning uploads into used;
  if used is null then raise exception 'render_upload_quota_exceeded' using errcode='P0001'; end if;
  return new;
end;
$$;
revoke all on function public.count_portal_render_upload() from public,anon,authenticated;
grant execute on function public.count_portal_render_upload() to service_role;
create trigger portal_render_upload_allowance before insert or update of storage_path on public.portal_designs
for each row execute function public.count_portal_render_upload();
commit;
