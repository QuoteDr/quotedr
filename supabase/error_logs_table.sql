CREATE TABLE IF NOT EXISTS error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message text,
  source text,
  stack text,
  page text,
  user_email text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Allow anonymous inserts (so errors get logged even when not logged in)
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert errors" ON error_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Only service role can read (for admin/AI monitoring)
CREATE POLICY "Service role reads errors" ON error_logs FOR SELECT USING (false);