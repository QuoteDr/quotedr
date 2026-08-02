-- Keep the new QuoteDr administrator mailbox and both legacy owner accounts
-- authorized while logins and forwarding rules are migrated.

drop policy if exists "Admin can manage broadcast messages" on public.app_broadcast_messages;
create policy "Admin can manage broadcast messages"
  on public.app_broadcast_messages
  for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
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
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );

drop policy if exists "Users can read own save recovery records" on public.save_recovery_records;
create policy "Users can read own save recovery records"
  on public.save_recovery_records
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );

drop policy if exists "Users can update own save recovery records" on public.save_recovery_records;
create policy "Users can update own save recovery records"
  on public.save_recovery_records
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  )
  with check (
    auth.uid() = user_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );

drop policy if exists "visitor_alerts_admin_read" on public.visitor_alerts;
create policy "visitor_alerts_admin_read"
  on public.visitor_alerts
  for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@quotedr.io',
      'info@alddirect.ca',
      'ald.direct.contracting@gmail.com'
    )
  );
