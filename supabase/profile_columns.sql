-- Add business profile and logo columns to user_data table
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS business_profile jsonb;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS company_logo text;
