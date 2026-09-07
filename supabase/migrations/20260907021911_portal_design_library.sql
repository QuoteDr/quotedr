begin;

-- Only the authorized Edge Function can read/write these rows and private files.
create table public.portal_design_libraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portal_id text not null,
  share_token text not null unique,
  unique(user_id, portal_id)
);
create table public.portal_designs (
  id uuid primary key,
  library_id uuid not null references public.portal_design_libraries(id) on delete cascade,
  project text not null default 'Project designs',
  title text not null check (length(title) between 1 and 160),
  note text not null default '',
  version text not null default '1',
  kind text not null check (kind in ('link','image','pdf','interactive')),
  external_url text,
  storage_path text,
  mime_type text,
  size_bytes integer not null default 0 check (size_bytes between 0 and 8388608),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_designs_library on public.portal_designs(library_id, created_at desc);
create table public.portal_design_pin_attempts (
  scope text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.portal_design_libraries enable row level security;
alter table public.portal_designs enable row level security;
alter table public.portal_design_pin_attempts enable row level security;
revoke all on public.portal_design_libraries, public.portal_designs, public.portal_design_pin_attempts from public, anon, authenticated;
grant all on public.portal_design_libraries, public.portal_designs, public.portal_design_pin_attempts to service_role;

-- Atomic, shared across Edge instances. No caller-controlled role or auth metadata.
create function public.portal_design_pin_attempt(p_scope text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.portal_design_pin_attempts(scope) values (p_scope)
  on conflict (scope) do update set
    attempts = case when portal_design_pin_attempts.window_start < now() - interval '15 minutes' then 1 else portal_design_pin_attempts.attempts + 1 end,
    window_start = case when portal_design_pin_attempts.window_start < now() - interval '15 minutes' then now() else portal_design_pin_attempts.window_start end
  returning attempts into n;
  return n <= 10;
end;
$$;
revoke all on function public.portal_design_pin_attempt(text) from public, anon, authenticated;
grant execute on function public.portal_design_pin_attempt(text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values ('portal-designs','portal-designs',false,8388608)
on conflict(id) do update set public=false,file_size_limit=8388608;
-- Intentionally no browser Storage policies or signed upload/download URLs.
commit;
