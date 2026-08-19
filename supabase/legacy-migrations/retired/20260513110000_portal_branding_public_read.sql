-- Allow the client portal to read contractor visual branding without exposing private settings.
-- Business profile/contact details stay private; the portal can still use the logo and theme.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_data'
      and policyname = 'Public portal branding read'
  ) then
    create policy "Public portal branding read"
    on public.user_data
    for select
    to anon, authenticated
    using (key in ('company_logo', 'portal_theme'));
  end if;
end $$;
