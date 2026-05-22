begin;

alter table public.quotes enable row level security;

drop policy if exists "Public quote viewing" on public.quotes;
drop policy if exists "Public quote status update" on public.quotes;
drop policy if exists "Users manage own quotes" on public.quotes;
drop policy if exists "own data only" on public.quotes;

drop policy if exists "quotes_select_own" on public.quotes;
drop policy if exists "quotes_insert_own" on public.quotes;
drop policy if exists "quotes_update_own" on public.quotes;
drop policy if exists "quotes_delete_own" on public.quotes;

revoke all privileges on table public.quotes from anon;
revoke all privileges on table public.quotes from public;

grant select, insert, update, delete on table public.quotes to authenticated;
grant select, insert, update, delete on table public.quotes to service_role;

create policy "quotes_select_own"
  on public.quotes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "quotes_insert_own"
  on public.quotes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "quotes_update_own"
  on public.quotes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "quotes_delete_own"
  on public.quotes
  for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
