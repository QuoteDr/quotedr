begin;
-- Existing library RLS and service-role-only grants remain unchanged.
alter table public.portal_design_libraries
  add column presentations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(presentations) = 'array'),
  add column presentation_revision uuid not null default gen_random_uuid();
commit;
