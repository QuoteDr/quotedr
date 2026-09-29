-- Server-verified coarse location only; existing service-role-only access stays intact.
alter table public.portal_design_activity
  add column if not exists metadata jsonb not null default '{}'::jsonb;
comment on column public.portal_design_activity.metadata is 'Verified approximate city, region and country; no raw IP or device data. Older rows remain empty.';
