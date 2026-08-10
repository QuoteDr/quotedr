# QDA-001 Public Artifact Containment

Status: local release candidate only. Nothing in this task authorizes a push, merge, Cloudflare change, deployment, cache purge, credential use, key rotation, or production probe.

## Release boundary

- Source baseline for the production candidate: `3c5a9e3` (`origin/main` at release integration).
- Dedicated branch: `codex/qda-001-public-artifact-containment`.
- The Save & Recovery commit/branch is not integrated or modified.
- The QBO and Canadian Tax ID compatibility code already present in `3c5a9e3` is preserved byte-for-byte relative to current main. QDA-001 changes only artifact build/verification behaviour.
- No database, Supabase Function, migration, scheduler, Cloudflare setting, customer record, or provider configuration is changed.

## Current deployment mechanism and failure mode

Before QDA-001, the repository had Cloudflare Pages control files (`_headers` and `_redirects`) at repository root but no top-level build command, package manifest, Wrangler Pages output setting, or dedicated publish directory. The site consisted of static HTML/JavaScript/CSS and media beside tests, Supabase source/migrations, native projects, internal documents, work files, and tracked backups. The audit confirmed that direct public requests could retrieve representative repository-only files.

Cloudflare Pages supports a build command and a distinct build output directory. QDA-001 adds `npm run build:public`, which creates `dist/` from a file-exact allowlist. Only `dist/` is a production candidate. See [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) and [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/).

The builder:

1. Rejects duplicate, missing, symlinked, absolute, or repository-escaping allowlist entries.
2. Verifies that the only directory it may clean is this repository's exact `dist/` child.
3. copies only the explicit files in `config/public-artifact.mjs`;
4. verifies the output contains no extra files; and
5. writes a deterministic SHA-256 manifest to `artifacts/qda-001-public-artifact-manifest.json` (outside `dist/`).

No directory globs are accepted. A future file added under `blog/`, `icons/`, `videos/`, or any other location remains private until its exact path is reviewed and added.

## Candidate artifact

The authoritative exact allowlist is `config/public-artifact.mjs`. The candidate manifest records every output path, byte count, and SHA-256 without exposing key values. Rebuilt from `3c5a9e3`, it contains 103 files, 22,558,250 bytes, no source maps, and tree SHA-256 `dd9ba7a836221feb007da15205cb89b04b14f1bad805665431a58aa2faae9d17`.

Included categories:

- active public, authenticated, portal, document-viewer, integration callback, legal, help, and marketing HTML routes;
- browser JavaScript and CSS referenced by those routes;
- `_headers` and `_redirects` so CSP, cache, service-worker, and `/p/*` behaviour remain available to Pages;
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

`test:artifact:smoke` serves only `dist/` on an ephemeral loopback port and proves normal routes/assets return 200, existing `.html` files canonicalize with query strings, `/p/*` redirects, and forbidden/missing paths return a true plain 404 rather than an app fallback.

Local verification completed for this candidate:

- artifact test: 103 exact files, 575 internal references resolved, 12 reviewed public-client key occurrences, zero forbidden credential patterns;
- static-server smoke: 20 required routes and 26 forbidden probes passed;
- focused existing route regressions: portal short links, portal CSP, interactive viewer URL, invoice portal links, secure client viewer, site traffic, and closed-signup tests passed;
- rendered public pages: Landing, Login, Pricing, Privacy, Terms, Tutorials, About, and Blog rendered at 1280 px and 390 px with expected headings/content, no horizontal overflow, and no captured browser errors.

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

## Owner deployment procedure (stop unless every gate is satisfied)

1. Make the active QBO release terminal first, as required by the serialized release plan. Do not deploy QDA-001 while UI/server state is split.
2. Obtain explicit owner approval for this exact allowlist and provider-check record.
3. From the then-current `main`, integrate only the QDA-001 commit, audit the exact diff, and rerun all three commands above. Confirm the candidate manifest/tree hash matches the reviewed source.
4. Create a Cloudflare Pages preview using build command `npm run build:public`, root directory `/`, and build output directory `dist`. No build secrets are required. Do not select repository root as the output.
5. On the preview, run the required/forbidden URL probe matrix below and render the critical route matrix at desktop and 390 px. Use only synthetic, non-customer references; protected journey checks require an approved synthetic account.
6. Confirm `_headers` and `_redirects` were parsed, CSP/cache headers remain, the service worker/manifest load, and every forbidden probe returns 404/403 with no index/login fallback body.
7. Only after terminal preview evidence and a new explicit production approval, promote/deploy the reviewed candidate. QDA-001 must not be combined with migrations, Functions, storage, Save & Recovery, QBO changes, or feature work.
8. Repeat the probes against the custom domain, record cache headers and the exact deployment/source SHA, and stop the release if any internal path returns content or any required route/asset fails.

## Rollback plan

Cloudflare Pages can instantly roll back to a previously successful production deployment: [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/). However, the pre-QDA-001 production artifact is known to expose repository material, so rolling directly back to it reopens the security finding.

Before production approval, prepare and retain a rollback candidate that uses this same allowlist builder with the last known-good application source. If application behaviour regresses, deploy/promote that containment-safe candidate. Use a legacy root-published deployment only as an owner-approved emergency action with temporary deny controls for all sampled internal categories and immediate re-containment; document that exposure window. Never “fix” rollback by deleting source/history or production assets.

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
/SESSION_HANDOFF.md
/OVERNIGHT_TASKS.md
/tests/ai-operations-core.test.js
/supabase/functions/ai-assistant/index.ts
/supabase/migrations/20260808152738_ai_operations_dashboard.sql
/android-app/package.json
/mobile-companion/package.json
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
/templates/index.html
```

For each probe, record status, final URL, `Content-Type`, `Cache-Control`, `CF-Cache-Status`, deployment/source SHA where available, and whether the body is an actual asset or a fallback. Never print response content from any unexpectedly exposed file; stop and contain it.

## Render matrix

Preview/public visual checks should cover desktop and 390 px for `/landing`, `/login`, `/dashboard`, `/quote-builder`, `/settings`, `/client-portal?p=synthetic`, `/interactive-quote-viewer?ref=synthetic`, and `/invoice-viewer?ref=synthetic`. Authentication redirects are valid evidence only for the unauthenticated boundary; they do not prove protected UI behaviour. Record static HTTP proof separately from rendered proof if loopback or authentication blocks browser validation.
