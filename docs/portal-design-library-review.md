# Portal Designs & Renderings — release and review

Status: deployed September 6, 2026 (September 7 UTC), with owner-approved manual
authenticated testing remaining. No DNS or existing customer records changed.

## Released

- Feature commit `f48d8f9`, fast-forwarded onto freshly fetched origin/main.
- Migration `20260907021911_portal_design_library.sql` applied and recorded.
- `portal-designs` ACTIVE v1; `verify-portal-pin` ACTIVE v35, existing JWT setting
  retained. Live design management without authentication returns 401; an unknown
  design link returns 404. This is not an authenticated upload test.
- All three tables have RLS enabled and deny direct anon/authenticated reads;
  service-role reads are granted. Storage bucket is private, 8 MB maximum.
  Advisor's three informational no-policy entries are intentional: browser
  roles cannot access these tables, all authorization is through the function.
- Exact portal page and module bytes matched the built artifact on
  quotedr.pages.dev, quotedr.io and myprojectview.ca. Policy/CSS/PDF runtime bytes
  also matched on myprojectview.ca. The production PIN page rendered in browser.
- Portal noindex/nofollow/noarchive headers verified. Private model, backend
  source and review-document paths return 404.
- Artifact tree `73859640d3e7fc4c021341280526a7a686e1c8574e6d99190918968eab5f188a`.
- No native mobile build required. Client closet upload has not been performed;
  the private local model is not part of the public web deployment.

### Deployment attempt — September 6, 2026

Owner approved deployment. Fetched origin/main; HEAD and origin/main both at
`4c51cd0`, with no divergence. Focused function, migration-permission, Deno,
artifact and existing portal checks passed again. Production verifier source was
read for comparison; no newer verifier changes were found. No staging branches
are configured. Docker Desktop was started for a full local round-trip but exited
while initializing its Inference manager (local socket access error). Deployment
is held pending authenticated end-to-end verification, not failed application tests.
No push, migration application, Edge deployment, DNS change, or customer test
record was made. Current candidate artifact tree:
`052d5a1613b0fbdccffd98a80f4d63c6b5d82789cac1fef4e6bef27302c04d63`.

Owner subsequently approved deployment with hands-on testing after release,
without requiring Docker or staging first. The read-only production compatibility
check found ten portals, ten valid PINs and zero conflicting legacy PIN values.
The migration dry run contains only this feature's additive migration. Full
authenticated upload testing remains owner verification, not a claimed result.

## Owner review

Run `node scripts/serve-portal-design-review.mjs`, then open
http://127.0.0.1:8877/review.html.
This uses the real browser component with synthetic, in-memory records. Reload resets
the test library. It is not an authenticated live portal or an upload to Supabase.
The closet file is local and intentionally excluded from the public artifact.

Once released, open a portal's **Admin Preview** from the dashboard. The
**Designs & Renderings** section supports a project/room label, title, note,
version, HTTPS provider links, PNG/JPEG/WebP renderings, PDFs, and self-contained
interactive HTML (8 MB/file). The portal can be an empty dashboard portal; a
quote is not required. Its design projects are independent of quote-backed job folders.

Use **Copy client design link** to share a design-focused view with a random
192-bit identifier and no client name in the URL. The ordinary portal link also
shows the library next to quotes/invoices. Both use the same portal PIN. A
design-focused link deliberately shows designs, not the financial-document panels.

**Replace / edit** updates the version/details or file. No new file is required
for metadata-only edits. **Withdraw** hides a design and denies further reads;
already downloaded/opened copies cannot be recalled. External destinations retain
their provider's privacy rules. Sharing a design is not quote acceptance or design approval.

## Security boundary

- New tables and storage bucket deny direct anonymous/authenticated API access.
  The Edge Function authorizes owner/team permissions or a signed PIN grant first.
- PIN grants last eight hours, bind to contractor + portal + current PIN, and
  invalidate after a PIN change. Session tokens are held in sessionStorage, never
  URLs, viewer HTML, or postMessage payloads. No raw PIN or reusable PIN hash is in the grant.
- PIN checks are throttled atomically to ten attempts per portal per 15-minute
  window, shared across Edge instances. Legacy name/email verification consumes
  the same canonical portal counter, so it cannot bypass the new throttle.
- Files are delivered as authenticated response bytes, not public or signed
  download URLs. Every read rechecks visibility and portal ownership. No provider
  URLs are fetched by the server.
- Interactive HTML is parsed only in an opaque-origin `sandbox="allow-scripts"`
  iframe. A leading CSP blocks network, nested frames, forms, objects and workers.
  No same-origin permission, popups, or top-navigation permissions are granted.
  The parent never parses or inserts uploaded markup into its own DOM.
- PDF.js 6.3.289 is pinned locally with license and source hashes. PDFs are drawn
  to canvas without enabling embedded scripts, XFA, forms, or document actions.
- Portal responses/pages are no-store/noindex; indexing directives alone are not
  treated as access control.

This change protects the new design library. It does not claim to retrofit every
legacy quote/photo/document endpoint with PIN-grant enforcement.

## Verification completed locally

- `node tests/portal-designs.test.mjs`: actual function code with injected database
  and auth adapters; session tamper/expiry/PIN reset, cross-account/portal denial,
  private bytes not read before PIN, hidden/withdrawn denial, permissions, conflict
  cleanup, uploads, metadata edits, links, design-only registry, and PIN issuance/throttle.
- `tests/portal-designs-migration.test.mjs`: migration executed in temporary
  PGlite Postgres; RLS, grants, private bucket, SQL permission denial, atomic
  attempt limit and time-window reset. Docker was unavailable. This is not a
  full local Supabase Storage/PostgREST stack test.
- Deno type-check: `portal-designs` and `verify-portal-pin`.
- Public artifact build/test/smoke, existing portal job assets, empty portal
  retention, empty registry and job-folder tests.
- Browser: desktop closet/mirror/both sliding doors/both adjustable shelves;
  mobile viewport controls; synthetic inline PDF and image; add a design link;
  client mode excludes management buttons.
- Browser security probe: parent DOM blocked, storage blocked, network blocked
  by CSP. The local test is at `/security.html` on port 8877 only.

Before production: run a real authenticated staging round-trip for owner/team
upload, client PIN entry, second browser, failed PIN throttle, PIN reset,
withdrawal, mobile device PDFs/HTML, and a quote-backed and quote-free portal.
Complex/encrypted PDFs and HTML exports needing external libraries may need an
export adjustment. The closet's prepared single-file package needs no network.
Prior private file objects are retained for recovery; automated retention cleanup
and a full version-history interface are not part of this first release.

## Separate deployment units (released)

1. Migration: `20260907021911_portal_design_library.sql`.
2. Edge Functions: `portal-designs` (new), `verify-portal-pin` (updated).
   Deploy the migration before the verifier, because it now depends on the PIN
   throttle RPC. Shared session module and dependency lock must be bundled.
3. Web: `client-portal.html`, `portal-designs.js`, `portal-designs.css`,
   `portal-design-policy.mjs`, pinned PDF vendor files and `_headers`;
   rebuild the exact allowlisted artifact after integrating latest main.

No existing QuoteDr redirects were modified. No mobile native files, Capacitor
configuration, or package.json were changed; no new native mobile build is required
by these changes. Bundled-web mobile releases still need the normal fresh-web sync
when separately authorized.

The original `review/closet-hosting` package is an offline reference, not an
instruction to publish its HTML/model as public static files. Do not add that
private design path or `review/` to the production allowlist.
