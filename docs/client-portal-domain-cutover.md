# Client portal domain cutover

Status: purchased and configured in source. DNS, Cloudflare Pages attachment, deployment, and production verification are still pending. The configured primary client portal origin is `https://myprojectview.ca`.

## Permanent compatibility contract

- Existing `https://quotedr.io/p/<token>` links remain valid indefinitely.
- Existing tokens, PINs, portal IDs, saved quotes, invoices, payments, and email links are not rotated or migrated.
- The new hostname is added to the same allowlisted Cloudflare Pages project; `quotedr.io` stays attached.
- New links use `https://myprojectview.ca/p/<company-slug>/<token>`. The company slug is cosmetic. Only the token and existing portal/PIN checks authorize access.
- A later company-name change does not invalidate either the old or new link.

## Activation values

The purchased domain is recorded in both reviewed locations:

1. `QUOTEDR_PRIMARY_CLIENT_PORTAL_ORIGIN` in `supabase-v2.js` is `https://myprojectview.ca` and controls newly copied/generated browser links.
2. `CLIENT_PORTAL_PRODUCTION_HOSTS` in `supabase/functions/_shared/client-portal-url.mjs` explicitly includes `myprojectview.ca` plus both permanent legacy QuoteDr hosts.

## One-at-a-time release sequence

1. Confirm whether any Namecheap email/DNS records were added after purchase. Preserve every existing DNS/email record.
2. Add the domain to the existing QuoteDr Cloudflare account and existing Pages project. Do not create a Worker or another application project.
3. Point the domain using the exact Cloudflare-provided DNS/nameserver values and wait for an active certificate.
4. Confirm the two activation values above and audit the exact diff against latest `origin/main`.
5. Run portal URL, portal/PIN, quote/invoice viewer, email-link, payment-return, service-worker, RBAC/privacy, artifact, desktop, and mobile-browser tests with synthetic data only.
6. Deploy only the named changed Edge Functions (`client-document`, `send-quote-email`, and `document-payment`) through the established Supabase protocol.
7. Build the allowlisted Pages artifact and deploy it through the established Cloudflare Pages protocol.
8. Verify both formats publicly with synthetic/no-data links:
   - legacy: `https://quotedr.io/p/<token>`
   - new: `https://myprojectview.ca/p/<company-slug>/<same-token>`
9. Verify the exact Pages asset version, PIN gate, client quote/invoice navigation, email validation, and payment return URL before announcing the domain live.

No database migration, customer-record edit, token rotation, mobile-native build, Stripe charge, or email send is required for this cutover.
