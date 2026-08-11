# QDA-001 Public Artifact Containment

Status: owner-approved QDA-001 production correction in progress. The authorization is limited to this artifact-only change, the existing QuoteDr Pages project, production verification, and one temporary host-exact cache-bypass rule described below. It does not authorize Supabase changes, key rotation, customer-data access, or another release.

## Release boundary

- Source baseline for this follow-up candidate: `8214120fc1c6222c2c4dcef19f80036c5c659254` (exact `origin/main` after the approved QDA-001 artifact deployment).
- Dedicated branch: `codex/qda-001-public-artifact-containment`.
- Verified pre-follow-up Pages production: deployment `9c7a6e19-5c19-404e-98de-4f53c8045abf`, source `8214120`.
- The Save & Recovery commit/branch is not integrated or modified.
- The QBO and Canadian Tax ID compatibility code already present in `8214120` is preserved byte-for-byte. This follow-up changes only the allowlisted 404 document, artifact verification, deterministic manifest ordering, and release evidence.
- No database, Supabase Function, migration, scheduler, DNS record, Worker/route, customer record, key, or unrelated provider configuration is changed. The only approved Cloudflare configuration change is the reversible, host-exact temporary Cache Rule below.

## Current deployment mechanism and failure mode

Before QDA-001, the repository had Cloudflare Pages control files (`_headers` and `_redirects`) at repository root but no top-level build command, package manifest, Wrangler Pages output setting, or dedicated publish directory. The site consisted of static HTML/JavaScript/CSS and media beside tests, Supabase source/migrations, native projects, internal documents, work files, and tracked backups. The audit confirmed that direct public requests could retrieve representative repository-only files.

Cloudflare Pages supports a build command and a distinct build output directory. QDA-001 adds `npm run build:public`, which creates `dist/` from a file-exact allowlist. Only `dist/` is a production candidate. See [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) and [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/).

The builder:

1. Rejects duplicate, missing, symlinked, absolute, or repository-escaping allowlist entries.
2. Verifies that the only directory it may clean is this repository's exact `dist/` child.
3. copies only the explicit files in `config/public-artifact.mjs`;
4. verifies the output contains no extra files; and
5. normalizes text output to LF so Windows and Cloudflare builds are byte-identical; and
6. writes a deterministic SHA-256 manifest to `artifacts/qda-001-public-artifact-manifest.json` (outside `dist/`).

No directory globs are accepted. A future file added under `blog/`, `icons/`, `videos/`, or any other location remains private until its exact path is reviewed and added. The allowlisted top-level `404.html` makes missing Pages origin paths genuine 404 responses instead of invoking Pages' default single-page application fallback.

## Candidate artifact

The authoritative exact allowlist is `config/public-artifact.mjs`. The candidate manifest records every output path, byte count, and SHA-256 without exposing key values. It contains 104 files, 22,461,919 bytes, no source maps, and tree SHA-256 `2d5e1c5aa2a97e76f35c18a016ef6fcb3fbccb903aaf689b3470271792760f80`. These values match the Cloudflare build log for deployment `54bb6ecc-0ccf-4191-be64-64c213576bd8`.

Included categories:

- active public, authenticated, portal, document-viewer, integration callback, legal, help, and marketing HTML routes;
- browser JavaScript and CSS referenced by those routes;
- `_headers`, `_redirects`, and `404.html` so CSP, cache, service-worker, `/p/*`, and genuine not-found behaviour remain available to Pages;
- PWA manifest, service worker, approved icons/logos, product update JSON, blog pages, and tutorial videos.

Excluded categories:

- `.git`, environment files, package/build configuration, and all non-runtime repository metadata;
- `tests/`, `supabase/functions/`, `supabase/migrations/`, SQL/schema files, and Supabase local configuration;
- Markdown, handoff, roadmap, TODO, newsletter draft, and other internal/work documents;
- Android/native/mobile projects, Flask templates/server source, developer scripts, mockups, and tutorial-video source projects;
- customer-reference development files, demo data, backups, `.tmp`/`.old`/`.bak`, source maps, and obsolete root scripts;
- every repository file not named in the allowlist, even if it has a normally web-servable extension.

## Unusual runtime inclusions and evidence

These are intentionally retained for compatibility and need special attention during owner review:

| Inclusion | Evidence / reason |
|---|---|
| `interactive-quote-viewer.html`, `invoice-viewer.html` | Canonical shared-document routes; Cloudflare serves extensionless forms while `.html` requests can canonicalize. Query strings must survive. |
| `client-portal.html` and `_redirects` | `_redirects` maps `/p/*` to the existing portal page with `p=:splat`. |
| `qb-callback.html` | Settings currently registers the exact QuickBooks callback URL; callback query parameters must survive canonicalization. |
| `team-invite.html` | Login constructs the team-invite route from an invite token. |
| `ai-operations.html` and its two modules | Settings links to the owner-gated AI Operations dashboard. Inclusion does not activate polling or deployment execution. |
| `qbo-invoice-export-ui.js` | Referenced by current Settings. Inclusion preserves the terminal QBO release already present at `3c5a9e3`. |
| `home-depot-tracker.html`, `labor-tracker.html` | Dashboard links directly to both operational tools. |
| `home-depot-price-sync.html` | Existing hidden operator route documented in repository work notes; retained as a compatibility route. |
| calculator/estimator standalone pages | Retained as compatibility/bookmark routes even though current navigation is mostly modal-driven. |
| `portal-theme-studio.html` | Settings links to the portal theme editor and the portal receives its preview messages. |
| `ald-logo.svg` | Still referenced by the renovation estimator and client-portal fallback/demo rendering. `ald-logo.jpg`, used only by an excluded concept page, is not published. |
| `data/whats-new.json` | Fetched at runtime by `whats-new.html`. |
| all 12 `videos/tutorials/*.mp4` files | Four are direct page media; the rest are referenced dynamically by help/tip modules. |
| PWA assets | `manifest.json`, both declared icons, `sw.js`, and its required header are retained and reference-tested. |
| blog pages | Intentionally public marketing resources; files are enumerated individually rather than copying the directory. |

## Automated acceptance checks

Run from repository root:

```text
npm run build:public
npm run test:artifact
npm run test:artifact:smoke
```

`test:artifact` rebuilds the candidate and proves:

- output equals the file-exact allowlist and the tracked manifest;
- every required route source is present;
- forbidden path categories and every sampled known exposure are absent;
- CSP, service-worker headers, and the portal redirect remain;
- HTML/CSS/manifest/service-worker/static-JavaScript references resolve inside the candidate;
- secret/service-role/private-key patterns are absent without printing matched values; and
- every allowed client-visible key occurrence is explicitly recorded by category and file.

`test:artifact:smoke` serves only `dist/` on an ephemeral loopback port and proves normal routes/assets return 200, existing `.html` files canonicalize with query strings, `/p/*` redirects, and forbidden/missing paths return the exact allowlisted `404.html` body with HTTP 404 rather than an app fallback.

Local verification completed for this candidate:

- artifact test: 104 exact files, 576 internal references resolved, 12 reviewed public-client key occurrences, zero forbidden credential patterns;
- static-server smoke: 20 required routes, 33 forbidden repository probes, and two arbitrary absent-path probes passed with exact 404-body matching;
- focused existing route regressions: 81 assertions covering portal/viewer routes, QBO import/export, Canadian Tax ID, Voice, RBAC/account policy, site traffic, and closed signup passed;
- syntax checks: all 46 allowlisted browser JavaScript files plus five artifact modules/tests passed `node --check`;
- rendered public pages: Landing, Login, Pricing, Privacy, Terms, Tutorials, About, Blog, and the new 404 document rendered at 1280 px and 390 px with expected headings/content and no horizontal overflow. Pages extensionless routing remains separately proven by the HTTP smoke test because the plain local file server does not emulate it.

Protected/account-specific pages were not rendered past their authenticated boundary. That is an explicit limitation, not a pass: this task forbids credentials and customer-data access. Their HTML/assets/references and route presence are proven statically; an approved preview plus synthetic account remains an owner release gate.

## Client-visible configuration review

The scan records categories and locations only; it never prints or copies values.

- Supabase: all static JWT-shaped keys in the candidate decoded to the legacy `anon` role. No `service_role`, `sb_secret_`, or non-anon static JWT pattern was found. Legacy anon keys are client-visible by design, but data safety still depends on correct grants and RLS. Supabase now recommends `sb_publishable_...` keys for public clients and documents legacy-key deprecation by the end of 2026: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys). This containment task does not change keys or database policy.
- Google Maps Platform: the same browser key is embedded in `quote-builder.html` and `labor-tracker.html`. The pages load Maps JavaScript API with Places; Quote Builder also requests drawing and geometry libraries and both use browser-side geocoding. Google recommends both application and API restrictions: [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices).
- PostHog: `analytics.js` contains one client project-ingestion key. No personal or secret PostHog credential pattern is in the candidate.

Owner-only provider checks before approval:

1. In Supabase Dashboard, confirm the identified legacy key is still the intended `anon` key, review Security Advisor/RLS for all exposed tables, and plan a separately tested migration to a publishable key. Do not rotate merely because an anon/publishable key is visible. Rotate only if the role/status is wrong or compromise evidence exists.
2. In Google Cloud Console, confirm the browser key has Website/HTTP-referrer restrictions for the exact production origins (`https://quotedr.io/*` and `https://www.quotedr.io/*` only if that host is supported). Add a Pages preview origin only for an explicitly approved preview and remove it afterward. Restrict APIs to the exact Maps JavaScript/Places usage shown by provider usage reports; do not guess or disable a used API. Check usage before restricting or rotating.
3. In PostHog, confirm the value is a project ingestion key rather than a personal/secret API key, review event-ingestion restrictions/allowed origins if the account supports them, and monitor unexpected origins or quota spikes. Rotate only if the key type is wrong or abuse evidence exists.
4. Record checks privately in the release evidence. Do not paste key values into issues, logs, commits, or chat.

## Separate owner cleanup candidates

No source or history is deleted by QDA-001. Baseline repository reference checks found no references to the following tracked files outside their own paths/configuration. They are excluded from `dist/` and should be handled in a separate cleanup decision:

- `onboarding.html.backup`
- `quote-builder.html.backup`
- `quote-builder.html.tmp`
- `quote-builder-backup.html`
- `supabase.js.backup`
- `temp_settings_end.html`
- `client_data.json`
- `client_autocomplete.js`

The last two are customer-reference development artifacts. Any removal/history decision needs a separate privacy and retention review; do not open, copy, or rewrite their contents during release work. Other excluded prototypes/tooling may have repository relationships and are not asserted to be unused.

## Production procedure (stop unless every gate is satisfied)

1. Confirm `origin/main` still equals the reviewed source, audit the exact diff, rebuild `dist/`, and rerun all artifact, smoke, regression, syntax, and render gates.
2. Fast-forward only the dedicated follow-up commit to `main`; do not integrate another branch or force-push.
3. Confirm the existing `quotedr` Pages project built `npm run build:public` and deployed `dist/`, and record the exact source SHA and Pages deployment ID. Never upload the repository root.
4. Create one temporary Cache Rule with name `QDA-001 temporary seven-day cache bypass`, description `Temporary seven-day containment for stale public repository artifacts. Remove after 2026-08-17 production recheck.`, expression `(http.host eq "quotedr.io")`, and cache action `Bypass cache`. Do not include `www`, another hostname, another zone, DNS, Workers, or routes.
5. Re-probe all seven historical exposures and the broader forbidden matrix. Every result must be a genuine 404 serving the allowlisted 404 document, not an application fallback or historical body.
6. Verify required routes/assets, canonical redirects, headers, service worker, QBO/Tax assets, protected synthetic-account boundary, and desktop/390 px rendering. Stop on any mismatch or privacy concern.
7. Keep the rule active only if all verification passes. If verification fails, remove only the newly created rule and stop; do not roll back to the broad repository deployment.

## Temporary cache-rule removal and recheck (2026-08-17)

The seven-day removal task must use the recorded exact Cache Rule ID from the production release report. It must first verify that current Pages production still contains top-level `404.html`, that the exact source/deployment is healthy, and that required routes work. Then disable or delete only `QDA-001 temporary seven-day cache bypass`; do not edit adjacent rules. Re-probe the seven known stale URLs and the broader forbidden matrix twice, once immediately and once after a fresh cache-busting request. Require genuine 404 responses with the allowlisted 404 body. If any stale body returns, restore only the same host-exact bypass rule and stop for owner review. If all probes remain clean, record removal time, final statuses, current deployment ID/source SHA, and leave the rule removed.

## Rollback plan

Cloudflare Pages can instantly roll back to a previously successful production deployment: [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/). However, the pre-QDA-001 broad-repository production artifact is known to expose repository material and is not an acceptable rollback.

If the temporary Cache Rule itself causes a problem, remove only that exact new rule. If application behaviour regresses, deploy/promote a containment-safe candidate that uses the same allowlist and top-level 404 with the last known-good application source. Never use the legacy root-published deployment, and never "fix" rollback by deleting source/history or production assets.

## Post-deploy probe matrix

Required routes/assets (expected 200 after following intended canonical redirects):

```text
/
/landing
/login
/dashboard
/quote-builder
/settings
/client-portal?p=synthetic
/interactive-quote-viewer?ref=synthetic
/invoice-viewer?ref=synthetic
/qb-callback?code=synthetic&state=synthetic
/team-invite?token=synthetic
/pricing
/privacy
/terms
/help
/tutorials
/whats-new
/blog/
/manifest.json
/sw.js
/icons/icon-192.png
/data/whats-new.json
/videos/tutorials/quote-builder-overview.mp4
```

Redirect preservation:

```text
/invoice-viewer.html?ref=synthetic        -> extensionless viewer, query retained
/qb-callback.html?code=synthetic&state=synthetic -> extensionless callback, query retained
/p/synthetic                             -> client portal with p=synthetic
```

Forbidden samples (expected true 404/403, never 200/redirect-to-app/fallback HTML):

```text
/.env.local
/.git/config
/.github/workflows/deploy.yml
/artifacts/qda-001-public-artifact-manifest.json
/config/public-artifact.mjs
/docs/QDA-001_PUBLIC_ARTIFACT_CONTAINMENT.md
/SESSION_HANDOFF.md
/OVERNIGHT_TASKS.md
/tests/ai-operations-core.test.js
/supabase/functions/ai-assistant/index.ts
/supabase/migrations/20260808152738_ai_operations_dashboard.sql
/android-app/package.json
/mobile-companion/package.json
/package.json
/client_data.json
/client_autocomplete.js
/onboarding.html.backup
/quote-builder.html.backup
/quote-builder.html.tmp
/quote-builder-backup
/quote-builder-backup.html
/supabase.js.backup
/temp_settings_end.html
/scripts/generate-newsletter-draft.js
/scripts/build-public-artifact.mjs
/sw.js.map
/templates/index.html
```

For each probe, record status, final URL, `Content-Type`, `Cache-Control`, `CF-Cache-Status`, deployment/source SHA where available, and whether the body is an actual asset or a fallback. Never print response content from any unexpectedly exposed file; stop and contain it.

## Render matrix

Preview/public visual checks should cover desktop and 390 px for `/landing`, `/login`, `/dashboard`, `/quote-builder`, `/settings`, `/client-portal?p=synthetic`, `/interactive-quote-viewer?ref=synthetic`, and `/invoice-viewer?ref=synthetic`. Authentication redirects are valid evidence only for the unauthenticated boundary; they do not prove protected UI behaviour. Record static HTTP proof separately from rendered proof if loopback or authentication blocks browser validation.
