begin;

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('portal-job-assets', 'portal-job-assets', false)
on conflict (id) do update set public = false;

create table if not exists public.portal_job_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portal_id text not null,
  job_folder_id text not null,
  quote_id uuid null references public.quotes(id) on delete set null,
  kind text not null check (kind in ('photo', 'file')),
  title text not null,
  storage_path text not null,
  thumbnail_path text,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  original_size_bytes bigint not null default 0 check (original_size_bytes >= 0),
  visible_to_client boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_job_assets_user_portal_folder
  on public.portal_job_assets(user_id, portal_id, job_folder_id, created_at desc);

create index if not exists idx_portal_job_assets_quote
  on public.portal_job_assets(quote_id) where quote_id is not null;

alter table public.portal_job_assets enable row level security;

revoke all privileges on table public.portal_job_assets from anon;
revoke all privileges on table public.portal_job_assets from public;
grant select, insert, update, delete on table public.portal_job_assets to authenticated;
grant select, insert, update, delete on table public.portal_job_assets to service_role;

drop policy if exists "portal_job_assets_select_own" on public.portal_job_assets;
create policy "portal_job_assets_select_own"
  on public.portal_job_assets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "portal_job_assets_insert_own" on public.portal_job_assets;
create policy "portal_job_assets_insert_own"
  on public.portal_job_assets
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "portal_job_assets_update_own" on public.portal_job_assets;
create policy "portal_job_assets_update_own"
  on public.portal_job_assets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "portal_job_assets_delete_own" on public.portal_job_assets;
create policy "portal_job_assets_delete_own"
  on public.portal_job_assets
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "portal_job_assets_storage_select_own" on storage.objects;
create policy "portal_job_assets_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-job-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "portal_job_assets_storage_insert_own" on storage.objects;
create policy "portal_job_assets_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-job-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "portal_job_assets_storage_update_own" on storage.objects;
create policy "portal_job_assets_storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'portal-job-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'portal-job-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "portal_job_assets_storage_delete_own" on storage.objects;
create policy "portal_job_assets_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portal-job-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

commit;
