-- Version matches the migration recorded by the production migration API.
create table public.quote_design_links (
  document_id uuid primary key references public.quotes(id) on delete cascade,
  design_id uuid not null references public.portal_designs(id) on delete cascade,
  require_review boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.quote_design_reviews (
  document_id uuid not null references public.quotes(id) on delete cascade,
  viewer_id uuid not null,
  revision text not null,
  opened_at timestamptz,
  unlocked_at timestamptz,
  outcome text check (outcome in ('continued','viewing_problem')),
  primary key(document_id, viewer_id, revision)
);
alter table public.quote_design_links enable row level security;
alter table public.quote_design_reviews enable row level security;
revoke all on public.quote_design_links, public.quote_design_reviews from public, anon, authenticated;
grant all on public.quote_design_links, public.quote_design_reviews to service_role;
alter table public.portal_document_events drop constraint portal_document_events_event_type_check;
alter table public.portal_document_events add constraint portal_document_events_event_type_check check (event_type in (
  'document_opened','document_view_duration','pdf_opened','payment_clicked','signature_started','document_signed','document_rejected',
  'design_opened','design_view_duration','design_continued','design_viewing_problem'
));
