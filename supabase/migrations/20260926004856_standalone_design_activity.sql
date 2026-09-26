-- Independent of quotes. Only the PIN-validating Edge Function records/reads events.
create table public.portal_design_activity (
  library_id uuid not null references public.portal_design_libraries(id) on delete cascade,
  session_hash text not null,
  minute_bucket bigint not null,
  event_type text not null check (event_type in ('portal_visited','design_opened','external_clicked','model_visible')),
  visit_id text not null default '',
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
  design_key text not null default '',
  title text not null default '',
  project text not null default '',
  created_at timestamptz not null default now(),
  primary key (library_id, session_hash, minute_bucket, event_type, design_key, visit_id)
);
create index portal_design_activity_recent on public.portal_design_activity(library_id, created_at desc);
alter table public.portal_design_activity enable row level security;
revoke all on public.portal_design_activity from public, anon, authenticated;
grant select, insert, update on public.portal_design_activity to service_role;
create function public.record_model_visible(p_library uuid,p_session text,p_design text,p_visit text,p_title text,p_project text,p_seconds integer)
returns void language sql security invoker set search_path = '' as $$
  insert into public.portal_design_activity(library_id,session_hash,minute_bucket,event_type,design_key,visit_id,title,project,duration_seconds)
  values(p_library,p_session,0,'model_visible',p_design,p_visit,p_title,p_project,p_seconds)
  on conflict(library_id,session_hash,minute_bucket,event_type,design_key,visit_id)
  do update set duration_seconds=greatest(public.portal_design_activity.duration_seconds,excluded.duration_seconds);
$$;
revoke all on function public.record_model_visible(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_model_visible(uuid,text,text,text,text,text,integer) to service_role;
comment on table public.portal_design_activity is 'Approximate client opens, deduplicated per PIN session/design/event/minute. No identity, playback or attention proof. Read only through owner-authorized portal-designs.';
