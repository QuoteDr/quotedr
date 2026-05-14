-- The client portal header displays contractor business contact details.
-- Keep this scoped to visual/public portal branding rows only.
alter policy "Public portal branding read"
on public.user_data
using (key in ('business_profile', 'company_logo', 'portal_theme'));
