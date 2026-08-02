# QuoteDr Site Traffic and Visitor Alerts

PostHog remains the long-term source of truth for marketing traffic. Supabase stores
only privacy-safe, deduplicated high-intent alert summaries for the administrator
feed.

## Required Supabase secrets

Set these before deploying the Edge Functions:

```text
POSTHOG_PERSONAL_API_KEY=<PostHog personal API key with query access>
POSTHOG_PROJECT_ID=411455
POSTHOG_HOST=https://us.posthog.com
POSTHOG_VISITOR_WEBHOOK_SECRET=<long random secret>
RESEND_API_KEY=<existing QuoteDr Resend key>
VISITOR_ALERT_EMAIL=admin@quotedr.io
VISITOR_LABEL_SALT=<long random stable value>
```

Use the same `VISITOR_LABEL_SALT` for both functions. It lets the dashboard and
alert feed use stable labels such as `Visitor 8F2A` without exposing PostHog
identifiers.

## Database and Edge Functions

Apply:

```text
supabase/migrations/20260801004920_visitor_traffic_alerts.sql
```

Deploy:

```text
analytics-traffic
visitor-alert
```

The migration enables RLS, grants alert reads only to QuoteDr administrators, and
purges alert summaries after 90 days when `pg_cron` is available.

## PostHog webhook destination

Create a PostHog webhook destination for:

```text
https://axmoffknvblluibuitrq.supabase.co/functions/v1/visitor-alert
```

Send the secret as:

```text
x-quotedr-webhook-secret: <POSTHOG_VISITOR_WEBHOOK_SECRET>
```

Filter the destination to these events only:

- `pricing_opened`
- `signup_gate_opened`
- `newsletter_signup_completed`
- `contact_opened`

Also require `site_area = marketing` and `audience = visitor`. Ordinary
`page_viewed` events belong in PostHog and must not call this webhook.

## Verification

1. Open one high-intent marketing page on the production domain.
2. Confirm one privacy-safe row appears in `public.visitor_alerts`.
3. Confirm one alert email arrives.
4. Trigger another high-intent event in the same browser session within 30 minutes.
5. Confirm the activity is logged but no second email is sent.
6. Sign in as a non-admin user and confirm Site Traffic and the alert table are
   inaccessible.

No native mobile rebuild is required for this feature.
