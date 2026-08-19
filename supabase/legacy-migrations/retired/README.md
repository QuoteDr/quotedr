# Retired migrations

These historical files are retained for audit purposes but are intentionally
excluded from the active Supabase migration chain.

- `20260420_feedback_table.sql` describes an unused legacy feedback table that
  is absent from production and has no application callers. QuoteDr's current
  feedback and support flows use their dedicated, access-controlled tables and
  Edge Functions.
- `20260513110000_portal_branding_public_read.sql` and
  `20260513113000_portal_business_profile_public_read.sql` describe a broad
  anonymous `user_data` read policy that is absent from production. Client
  branding is now returned through the authorized client-document path, while
  `quotedr_user_data_owner_boundary` keeps direct table access account-bound.

Do not move these files back into `supabase/migrations`. Any future version of
either capability must be introduced by a new, security-reviewed migration.
