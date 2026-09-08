-- Keep one atomic, revision-checked attachment list per quote.
alter table public.quote_design_links add column design_ids uuid[];
update public.quote_design_links set design_ids = array[design_id];
alter table public.quote_design_links add constraint quote_design_sequence_size
  check (design_ids is null or cardinality(design_ids) between 1 and 20);
-- Optional private card artwork. The Edge Function returns these bytes only
-- after the same portal/owner authorization check used for the design itself.
alter table public.portal_designs
  add column thumbnail_path text,
  add column thumbnail_mime text
    check (thumbnail_mime is null or thumbnail_mime in ('image/png', 'image/jpeg', 'image/webp')),
  add column thumbnail_size_bytes integer
    check (thumbnail_size_bytes is null or thumbnail_size_bytes between 1 and 1572864);
-- Removing the first design must not cascade away the other attachments.
alter table public.quote_design_links drop constraint quote_design_links_design_id_fkey;
-- This compatibility field remains the first ID; reads validate every design's
-- existence, visibility, owner and portal before serving it. RLS is unchanged.
