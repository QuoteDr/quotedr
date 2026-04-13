# Supabase Migration Plan — ALD Quote Builder

## localStorage Keys → Database Tables

| localStorage Key | Type | → Supabase Table |
|---|---|---|
| `ald_recent_quotes` | JSON array | `quotes` |
| `ald_current_draft` | JSON object | `quotes` (is_draft=true) |
| `ald_clients` | JSON object | `clients` |
| `ald_custom_items` | JSON object | `items` |
| `ald_item_overrides` | JSON object | `items` (merged) |
| `ald_quote_templates` | JSON object | `templates` |
| `ald_quote_counter_YYYY` | number | `quote_meta` |
| `quote_*` (sent snapshots) | JSON object | `quote_snapshots` |
| `invoice_*` (sent snapshots) | JSON object | `invoice_snapshots` |

---

## Database Schema (SQL)

```sql
-- Users are handled by Supabase Auth (built-in)
-- Every table has user_id linking to auth.users

-- Business profile (replaces hardcoded ALD Direct info)
create table business_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  business_name text not null,
  address text,
  city text,
  province text,
  postal_code text,
  phone text,
  hst_number text,
  logo_url text,
  formspree_endpoint text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Quotes (drafts + saved)
create table quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  quote_number text,
  client_name text,
  client_email text,
  client_phone text,
  project_address text,
  rooms jsonb not null default '[]',
  grand_total numeric(10,2) default 0,
  terms jsonb default '[]',
  is_draft boolean default true,
  status text default 'draft', -- draft | sent | approved | invoiced
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clients database
create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz default now()
);

-- Pricing items (custom + overrides merged)
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  unit_type text,
  rate numeric(10,2),
  material_cost numeric(10,2),
  supplier_url text,
  item_description text,
  upgrade jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, category, name)
);

-- Quote templates
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  rooms jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Snapshots sent to clients (read-only record)
create table quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  snapshot_key text unique, -- e.g. quote_1712800000000
  data jsonb not null,
  sent_at timestamptz default now()
);

create table invoice_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  snapshot_key text unique,
  data jsonb not null,
  sent_at timestamptz default now()
);

-- Quote number counter per year
create table quote_meta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  year int not null,
  counter int default 0,
  unique(user_id, year)
);
```

---

## Row Level Security (RLS)

Every table needs RLS so users can only see their own data:

```sql
-- Enable RLS on all tables
alter table business_profile enable row level security;
alter table quotes enable row level security;
alter table clients enable row level security;
alter table items enable row level security;
alter table templates enable row level security;
alter table quote_snapshots enable row level security;
alter table invoice_snapshots enable row level security;
alter table quote_meta enable row level security;

-- Policy template (repeat for each table):
create policy "Users can only access own data" on quotes
  for all using (auth.uid() = user_id);
-- (same pattern for all other tables)
```

---

## Migration Strategy

### Phase 1 — Auth layer
- Add Supabase JS client to all HTML files
- Add login/signup page (`login.html`)
- Redirect unauthenticated users to login
- On login, load all data from Supabase instead of localStorage

### Phase 2 — Data sync
- Replace each `localStorage.setItem` call with a Supabase upsert
- Replace each `localStorage.getItem` call with a Supabase select
- Keep localStorage as a local cache for speed (write to both, read from Supabase on load)

### Phase 3 — Business profile
- Build first-run setup wizard (business name, address, phone, HST, logo upload)
- Replace all hardcoded "ALD Direct Inc." references with dynamic profile data
- Store logo in Supabase Storage

### Phase 4 — Billing (Stripe)
- Add Stripe Checkout for subscription signup
- Add a `subscription_status` check on login — redirect to billing if lapsed
- Webhook updates subscription status in Supabase

---

## Files to Create
- `login.html` — email/password auth
- `supabase.js` — shared client init + auth helpers
- Update: `quote-builder.html`, `dashboard.html`, `invoice-viewer.html`, `interactive-quote-viewer.html`

## What You Need From Supabase
Once your account is set up, you need:
1. **Project URL** — looks like `https://xyzabc.supabase.co`
2. **Anon public key** — found in Settings → API
Share these and we start building immediately.
