# Photos and pricing release

Integration base: `82bdfe4b98909bda63f7886347ddd6edc92e4326`. Existing production Pages deployment matched that commit. No newer remote commits required merging at final fetch.

Scope: Add/Edit Line Item supports three photos with individual replace/remove, preserves legacy first-photo aliases, and retains untouched full-resolution metadata. Existing shared media upload and client gallery support arrays. The mobile rate sign button and per-unit discounts are included. The daily work-log and optional reminder setup web UI are included, but push activation stays paused.

Backend: `client-document` version 53 and `team-account` version 24 were deployed with all current relative dependencies and unchanged JWT configuration. Their pre-release bundles matched origin/main except the intended three shared pricing modules. No database migration, reminder function, cron, push keys or native build was deployed.

Checks: photo draft/upload/stale-editor tests, existing multi-photo/media tests, mobile sign tests, per-unit discount and client/team/accounting policy regressions, handbook tests and exact-base release check, public artifact allowlist and HTTP smoke checks passed. A disposable localhost browser harness decoded three real generated PNG files, blocked a fourth, removed one, and saved/reopened two with the legacy first-photo alias intact. This is not an authenticated cloud round trip.

Hosting: existing Cloudflare Pages project `quotedr`, account `cdde37c559d18054b85b8c97dd01f581`, connected repository QuoteDr/quotedr, production branch main, automatic deployment enabled, build `npm run build:public`, output `dist`. Do not confuse it with the old Worker also named quotedr. Never deploy repository root.

Remaining verification: authenticated disposable quote photo upload/cloud save/reopen/client gallery, phone file picker and minus button, authenticated chatbot answers, and real-device reminder delivery. Never modify customer records or send client messages for these checks. Silver door-edge rendering from the separate design screenshot is not part of this QuoteDr release.
