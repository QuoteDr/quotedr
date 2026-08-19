create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('bug', 'feature')),
  description text not null,
  page text,
  severity text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  status text default 'new',
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "Anyone can submit feedback" on public.feedback
  for insert with check (true);

create policy "Authenticated users can read feedback" on public.feedback
  for select using (auth.role() = 'authenticated');
