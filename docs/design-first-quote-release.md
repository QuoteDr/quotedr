# Design-first quotes — local implementation

Owners can attach a published portal design to a quote and optionally require design review before pricing. Clients explicitly continue to the quote, or use the viewing-problem fallback. This is a presentation flow, not approval of the design or a DRM system. Previously delivered copies cannot be recalled.

Activity records design title/version, opens, foreground visible-time increments, continuation and viewing problems. Owner previews are excluded. External links record opens but not duration. Duration is approximate: interrupted connections or closing the browser can lose the final increment.

## Release order

1. Apply `20260908000650_quote_design_review.sql` separately. The new private tables have RLS and service-role-only access. Local handler tests use database mocks, not PostgreSQL.
2. Deploy Edge Functions `portal-designs`, `client-document`, `document-payment`, and `send-quote-email` together with `_shared/quote-design-review.mjs`. Functions depend on the migration.
3. Deploy the allowlisted web artifact after integrating latest main and reviewing the release diff.
4. Verify an authenticated owner attachment and a separate client browser: portal card hides pricing, direct quote/PDF access prompts review, continuation/fallback unlock, owner previews do not log, activity records visible time, ordinary quotes/invoices still work.

No mobile native/config/package changes; no new mobile build required by this change. No source rendering files are changed.

Local checks include handler/access/receipt tests, browser flow with mocked API on desktop and mobile, timer visibility tests, existing portal design/payment/activity tests, syntax checks and public artifact checks.

## Release verification — September 7, 2026 (Toronto)

Feature commit `ab3a073` fast-forwarded main after a fresh fetch and rebase. Migration applied and RLS/role privileges verified. Active function versions: portal-designs 2, client-document 50, document-payment 31, send-quote-email 41; source matches local files and JWT settings are unchanged. The four changed JS/CSS assets match the built artifact on quotedr.pages.dev, quotedr.io and myprojectview.ca.

The authenticated owner portal loads its existing design and correct quote total, and the attachment dialog lists the quote and review checkbox. No attachment was saved and no client settings were changed. The full live client continuation/activity walkthrough remains owner testing; desktop/mobile behaviour was verified locally with mocked API. Migration filename is aligned to the version assigned by the production migration API to avoid a duplicate future push.
