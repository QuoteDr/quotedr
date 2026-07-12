begin;

insert into storage.buckets (id, name, public)
values ('item-full-res-photos', 'item-full-res-photos', true)
on conflict (id) do update set public = true;

create or replace function public.quotedr_item_full_res_photo_usage_bytes(owner_id text, excluding_name text default null)
returns bigint
language sql
stable
security definer
set search_path = storage, public
as $$
  select coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)::bigint
  from storage.objects
  where bucket_id = 'item-full-res-photos'
    and (storage.foldername(name))[1] = owner_id
    and (excluding_name is null or name <> excluding_name);
$$;

revoke all on function public.quotedr_item_full_res_photo_usage_bytes(text, text) from public;
grant execute on function public.quotedr_item_full_res_photo_usage_bytes(text, text) to authenticated;

drop policy if exists "item_full_res_photos_public_read" on storage.objects;
create policy "item_full_res_photos_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'item-full-res-photos');

drop policy if exists "item_full_res_photos_insert_own" on storage.objects;
create policy "item_full_res_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'item-full-res-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.quotedr_item_full_res_photo_usage_bytes(auth.uid()::text) + coalesce((metadata->>'size')::bigint, 0) <= 10737418240
  );

drop policy if exists "item_full_res_photos_update_own" on storage.objects;
create policy "item_full_res_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'item-full-res-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'item-full-res-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.quotedr_item_full_res_photo_usage_bytes(auth.uid()::text, name) + coalesce((metadata->>'size')::bigint, 0) <= 10737418240
  );

drop policy if exists "item_full_res_photos_delete_own" on storage.objects;
create policy "item_full_res_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'item-full-res-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

notify pgrst, 'reload schema';

commit;
