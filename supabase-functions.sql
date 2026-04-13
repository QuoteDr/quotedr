-- Run this in Supabase SQL Editor after the main schema

-- Function to increment quote counter atomically
create or replace function increment_quote_counter(p_user_id uuid, p_year int)
returns int
language plpgsql
security definer
as $$
declare
  new_counter int;
begin
  insert into quote_meta (user_id, year, counter)
  values (p_user_id, p_year, 1)
  on conflict (user_id, year)
  do update set counter = quote_meta.counter + 1
  returning counter into new_counter;
  
  return new_counter;
end;
$$;
