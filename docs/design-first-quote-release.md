# Design-first quotes — local implementation

Owners can attach a published portal design to a quote and optionally require design review before pricing. Clients explicitly continue to the quote, or use the viewing-problem fallback. This is a presentation flow, not approval of the design or a DRM system. Previously delivered copies cannot be recalled.

Activity records design title/version, opens, foreground visible-time increments, continuation and viewing problems. Owner previews are excluded. External links record opens but not duration. Duration is approximate: interrupted connections or closing the browser can lose the final increment.

## Release order (not deployed)

1. Apply `20260907234232_quote_design_review.sql` separately. The new private tables have RLS and service-role-only access. Validate the migration in a test database first; local handler tests use database mocks, not PostgreSQL.
2. Deploy Edge Functions `portal-designs`, `client-document`, `document-payment`, and `send-quote-email` together with `_shared/quote-design-review.mjs`. Functions depend on the migration.
3. Deploy the allowlisted web artifact after integrating latest main and reviewing the release diff.
4. Verify an authenticated owner attachment and a separate client browser: portal card hides pricing, direct quote/PDF access prompts review, continuation/fallback unlock, owner previews do not log, activity records visible time, ordinary quotes/invoices still work.

No mobile native/config/package changes; no new mobile build required by this change. No source rendering files are changed.

Local checks include handler/access/receipt tests, browser flow with mocked API on desktop and mobile, timer visibility tests, existing portal design/payment/activity tests, syntax checks and public artifact checks. Live database migration and authenticated production walkthrough remain pending.
