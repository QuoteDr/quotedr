drop policy if exists "Admin can manage broadcast messages" on public.app_broadcast_messages;
create policy "Admin can manage broadcast messages"
  on public.app_broadcast_messages
  for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );

drop policy if exists "Users can view own broadcast receipts" on public.app_broadcast_receipts;
create policy "Users can view own broadcast receipts"
  on public.app_broadcast_receipts
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );
