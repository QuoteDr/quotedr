-- Add Stripe subscription fields to user_data table
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '14 days');