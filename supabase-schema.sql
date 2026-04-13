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
