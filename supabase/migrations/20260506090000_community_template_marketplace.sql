-- Community Template Marketplace
-- Public templates are visible to signed-in QuoteDr users.
-- Publishing always happens from the client with rates stripped before insert.

create extension if not exists "uuid-ossp";

create table if not exists public.community_templates (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    description text default '',
    trade text default '',
    region text default '',
    job_type text default '',
    creator_name text default '',
    rooms jsonb not null default '[]'::jsonb,
    room_count integer default 0,
    download_count integer default 0,
    rating_sum integer default 0,
    rating_count integer default 0,
    status text default 'published' check (status in ('published','reported','hidden')),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.community_templates enable row level security;

create policy "Authenticated users can browse published community templates"
    on public.community_templates for select
    to authenticated
    using (status = 'published');

create policy "Users can publish own community templates"
    on public.community_templates for insert
    to authenticated
    with check ((select auth.uid()) = user_id and status = 'published');

create policy "Users can update own community templates"
    on public.community_templates for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users can delete own community templates"
    on public.community_templates for delete
    to authenticated
    using ((select auth.uid()) = user_id);

create index if not exists community_templates_status_idx
    on public.community_templates(status, created_at desc);

create index if not exists community_templates_filters_idx
    on public.community_templates(trade, region, job_type);

create table if not exists public.community_template_reports (
    id uuid default uuid_generate_v4() primary key,
    template_id uuid references public.community_templates(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    reason text default '',
    created_at timestamptz default now(),
    unique(template_id, user_id)
);

alter table public.community_template_reports enable row level security;

create policy "Users can report community templates"
    on public.community_template_reports for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users can view own community template reports"
    on public.community_template_reports for select
    to authenticated
    using ((select auth.uid()) = user_id);

create table if not exists public.community_template_ratings (
    id uuid default uuid_generate_v4() primary key,
    template_id uuid references public.community_templates(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    rating integer not null check (rating in (1, -1)),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(template_id, user_id)
);

alter table public.community_template_ratings enable row level security;

create policy "Users can rate community templates"
    on public.community_template_ratings for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users can update own community template ratings"
    on public.community_template_ratings for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users can view own community template ratings"
    on public.community_template_ratings for select
    to authenticated
    using ((select auth.uid()) = user_id);
