create index if not exists account_audit_events_actor_user_idx
  on public.account_audit_events(actor_user_id);

create index if not exists account_fields_read_permission_idx
  on public.account_fields(read_permission_key);

create index if not exists account_fields_write_permission_idx
  on public.account_fields(write_permission_key);

create index if not exists account_invitations_accepted_by_user_idx
  on public.account_invitations(accepted_by_user_id);

create index if not exists account_invitations_invited_by_user_idx
  on public.account_invitations(invited_by_user_id);

create index if not exists account_invitations_role_idx
  on public.account_invitations(role_id);

create index if not exists account_memberships_invited_by_user_idx
  on public.account_memberships(invited_by_user_id);

create index if not exists account_memberships_role_idx
  on public.account_memberships(role_id);

create index if not exists clients_created_by_user_idx
  on public.clients(created_by_user_id);

create index if not exists clients_updated_by_user_idx
  on public.clients(updated_by_user_id);

create index if not exists items_created_by_user_idx
  on public.items(created_by_user_id);

create index if not exists items_updated_by_user_idx
  on public.items(updated_by_user_id);

create index if not exists quotes_created_by_user_idx
  on public.quotes(created_by_user_id);

create index if not exists quotes_updated_by_user_idx
  on public.quotes(updated_by_user_id);
