-- QuoteDr.io Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── BUSINESS PROFILES ───────────────────────────────────────────────────────
create table if not exists business_profiles (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null unique,
    business_name text default '',
    owner_name text default '',
    address text default '',
    city text default '',
    province text default '',
    postal_code text default '',
    phone text default '',
    email text default '',
    hst_number text default '',
    logo_url text default '',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table business_profiles enable row level security;

create policy "Users can view own business profile"
    on business_profiles for select
    using (auth.uid() = user_id);

create policy "Users can insert own business profile"
    on business_profiles for insert
    with check (auth.uid() = user_id);

create policy "Users can update own business profile"
    on business_profiles for update
    using (auth.uid() = user_id);

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
create table if not exists clients (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    address text default '',
    city text default '',
    province text default 'Ontario',
    postal_code text default '',
    phone text default '',
    email text default '',
    notes text default '',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(user_id, name)
);

alter table clients enable row level security;

create policy "Users can view own clients"
    on clients for select
    using (auth.uid() = user_id);

create policy "Users can insert own clients"
    on clients for insert
    with check (auth.uid() = user_id);

create policy "Users can update own clients"
    on clients for update
    using (auth.uid() = user_id);

create policy "Users can delete own clients"
    on clients for delete
    using (auth.uid() = user_id);

-- ─── QUOTES ──────────────────────────────────────────────────────────────────
create table if not exists quotes (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    quote_number text default '',
    client_name text default '',
    client_address text default '',
    client_city text default '',
    client_phone text default '',
    client_email text default '',
    project_description text default '',
    quote_date date default current_date,
    valid_until date,
    subtotal numeric(10,2) default 0,
    tax_rate numeric(5,4) default 0.13,
    tax_amount numeric(10,2) default 0,
    total numeric(10,2) default 0,
    status text default 'draft' check (status in ('draft','sent','accepted','declined','invoiced')),
    notes text default '',
    data jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table quotes enable row level security;

create policy "Users can view own quotes"
    on quotes for select
    using (auth.uid() = user_id);

create policy "Users can insert own quotes"
    on quotes for insert
    with check (auth.uid() = user_id);

create policy "Users can update own quotes"
    on quotes for update
    using (auth.uid() = user_id);

create policy "Users can delete own quotes"
    on quotes for delete
    using (auth.uid() = user_id);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
create index if not exists quotes_user_id_idx on quotes(user_id);
create index if not exists quotes_updated_at_idx on quotes(updated_at desc);
create index if not exists clients_user_id_idx on clients(user_id);
create index if not exists clients_name_idx on clients(user_id, name);

-- ─── COMMUNITY TEMPLATE MARKETPLACE ──────────────────────────────────────────
create table if not exists community_templates (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    description text default '',
    trade text default '',
    region text default '',
    job_type text default '',
    creator_name text default '',
    include_pricing boolean default false,
    is_anonymous boolean default false,
    rooms jsonb not null default '[]'::jsonb,
    room_count integer default 0,
    download_count integer default 0,
    rating_sum integer default 0,
    rating_count integer default 0,
    status text default 'published' check (status in ('published','reported','hidden')),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table community_templates enable row level security;

create policy "Authenticated users can browse published community templates"
    on community_templates for select
    to authenticated
    using (status = 'published');

create policy "Users can publish own community templates"
    on community_templates for insert
    to authenticated
    with check (auth.uid() = user_id and status = 'published');

create policy "Users can update own community templates"
    on community_templates for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own community templates"
    on community_templates for delete
    to authenticated
    using (auth.uid() = user_id);

create index if not exists community_templates_status_idx on community_templates(status, created_at desc);
create index if not exists community_templates_filters_idx on community_templates(trade, region, job_type);

create table if not exists community_template_reports (
    id uuid default uuid_generate_v4() primary key,
    template_id uuid references community_templates(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    reason text default '',
    created_at timestamptz default now(),
    unique(template_id, user_id)
);

alter table community_template_reports enable row level security;

create policy "Users can report community templates"
    on community_template_reports for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can view own community template reports"
    on community_template_reports for select
    to authenticated
    using (auth.uid() = user_id);

create table if not exists community_template_ratings (
    id uuid default uuid_generate_v4() primary key,
    template_id uuid references community_templates(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    rating integer not null check (rating in (1, -1)),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(template_id, user_id)
);

alter table community_template_ratings enable row level security;

create policy "Users can rate community templates"
    on community_template_ratings for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update own community template ratings"
    on community_template_ratings for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can view own community template ratings"
    on community_template_ratings for select
    to authenticated
    using (auth.uid() = user_id);

-- LABOUR TRACKING ------------------------------------------------------------
create table if not exists labor_job_sites (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    quote_id uuid references quotes(id) on delete set null,
    quote_number text default '' not null,
    client_name text default '' not null,
    name text not null,
    address text default '' not null,
    latitude numeric(10, 7),
    longitude numeric(10, 7),
    geofence_radius_m integer default 75 not null check (geofence_radius_m between 25 and 1000),
    active boolean default true not null,
    notes text default '' not null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create table if not exists labor_time_sessions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    job_site_id uuid references labor_job_sites(id) on delete cascade not null,
    quote_id uuid references quotes(id) on delete set null,
    source text default 'manual' not null check (source in ('manual', 'gps', 'import', 'adjusted')),
    status text default 'pending_review' not null check (status in ('pending_review', 'approved', 'rejected')),
    started_at timestamptz not null,
    ended_at timestamptz,
    duration_minutes integer default 0 not null check (duration_minutes >= 0),
    break_minutes integer default 0 not null check (break_minutes >= 0),
    worker_name text default '' not null,
    notes text default '' not null,
    raw_location jsonb default '{}'::jsonb not null,
    review_notes text default '' not null,
    approved_at timestamptz,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    constraint labor_time_sessions_time_check check (ended_at is null or ended_at >= started_at)
);

alter table labor_job_sites enable row level security;
alter table labor_time_sessions enable row level security;

create policy "Users can manage own labor job sites"
    on labor_job_sites for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can manage own labor time sessions"
    on labor_time_sessions for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index if not exists labor_job_sites_user_active_idx on labor_job_sites(user_id, active, updated_at desc);
create index if not exists labor_job_sites_quote_idx on labor_job_sites(quote_id) where quote_id is not null;
create index if not exists labor_time_sessions_user_started_idx on labor_time_sessions(user_id, started_at desc);
create index if not exists labor_time_sessions_job_started_idx on labor_time_sessions(job_site_id, started_at desc);
create index if not exists labor_time_sessions_review_idx on labor_time_sessions(user_id, status, started_at desc);

create table if not exists labor_devices (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    device_key text not null,
    platform text default 'android' not null check (platform in ('android', 'ios', 'web')),
    device_name text default '' not null,
    push_token text,
    tracking_enabled boolean default false not null,
    last_sync_at timestamptz,
    last_event_at timestamptz,
    last_error text,
    app_version text default '' not null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    unique(user_id, device_key)
);

create table if not exists labor_location_events (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    device_id uuid references labor_devices(id) on delete set null,
    device_key text default '' not null,
    job_site_id uuid references labor_job_sites(id) on delete set null,
    quote_id uuid references quotes(id) on delete set null,
    event_type text not null check (event_type in ('enter', 'exit', 'dwell', 'permission', 'sync', 'error')),
    transition_source text default 'android_geofence' not null,
    occurred_at timestamptz not null,
    latitude numeric(10, 7),
    longitude numeric(10, 7),
    accuracy_m numeric(8, 2),
    raw_payload jsonb default '{}'::jsonb not null,
    processed_session_id uuid references labor_time_sessions(id) on delete set null,
    processed_at timestamptz,
    created_at timestamptz default now() not null
);

alter table labor_devices enable row level security;
alter table labor_location_events enable row level security;

create policy "Users can manage own labor devices"
    on labor_devices for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can manage own labor location events"
    on labor_location_events for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index if not exists labor_devices_user_updated_idx on labor_devices(user_id, updated_at desc);
create unique index if not exists labor_location_events_idempotency_idx on labor_location_events(user_id, device_key, job_site_id, event_type, occurred_at);
create index if not exists labor_location_events_user_occurred_idx on labor_location_events(user_id, occurred_at desc);
create index if not exists labor_location_events_site_occurred_idx on labor_location_events(job_site_id, occurred_at desc) where job_site_id is not null;
