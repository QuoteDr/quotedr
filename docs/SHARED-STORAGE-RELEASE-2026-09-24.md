# Shared storage budget — release record

## September 25 release (supersedes the earlier attempt below)

- Owner explicitly authorized deployment without Docker. No Docker commands were used for this release.
- Fetched main is `ef3539aafa89220b66af18dfa798c905a22be55e`, identical to the worktree base; no newer code needed merging.
- Both schema migrations were applied and all six changed functions deployed with `--use-api`, including current shared dependencies. Verified ACTIVE versions: storage-budget 1, portal-designs 4, client-document 54, document-payment 33, voice-audio 4, optimize-photo-storage 26.
- Verified the render bucket is 30,000,000 bytes and the requested owner has warning_only=true. No customer documents, duplicate invoices, messages or model files were changed.
- All six functions pass Deno type-check. Minimal type declarations/narrowing repaired existing type errors without changing financial calculations. Financial, client-document, photo, storage, render, expiry, invoice and handbook regressions passed. Corrected a stale migration filename in the change-order payment test.
- Browser sandbox test passed parent/storage/network/eval isolation and embedded blob-module execution. The current 26,986,514-byte walkthrough loads locally unchanged.
- Web deployment and final upload-policy cutover follow the API rollout. See the final release report for exact completion verification.
- Authenticated QDR browser checks and chatbot answers remain unperformed: the available browser opens QDR's sign-in page. Cloudflare authentication is separate. Actual concurrent Storage transfers, teammate upload checks and payment/voice upload-finalize checks remain unperformed; automated tests are not proof of those live workflows.
- No native mobile files, package.json, plugins or Capacitor settings changed; no new native build required.

The following sections preserve earlier planning and failed-attempt evidence; their pending/failed statuses are historical where superseded above.

## What is implemented

- The verified owner's account is seeded in warning-only mode: shared retained and monthly thresholds still warn but do not reject uploads. Other accounts keep enforcement. This is pending deployment, not a live account update. It does not override technical/per-file restrictions or unrelated product quotas.

- Supabase remains the file host. No R2 migration, subscription upgrade, billing add-on, customer-file deletion or model transformation.
- New owners: 10,000,000,000 retained bytes and 2,000,000,000 uploaded bytes/month (UTC). Existing owners retain at least 20 GiB, preserving the two previous 10 GiB allowances, or existing usage plus 2 GB if higher.
- Shared managed budget: photos, portal files, designs and thumbnails, payment evidence and voice evidence. Old files count toward retained storage, not retroactive monthly uploads.
- Reservations serialize per owner in application-owned tables; Storage metadata is read only. Browser writes/removals use an authorized gateway. Service writers use the same reservation functions.
- Dashboard **Check storage**, 80%/95% warnings, explanatory errors. Limits never trigger deletion or automatic purchases.
- Failed uploads reserve capacity for up to three hours. Successful transfers count even if a later record save fails. Removal releases retained bytes, not monthly usage. Signed uploads reserve the bucket maximum to prevent falsified size declarations.
- Legacy signatures remain outside this cutover. Their paths are quote IDs rather than owner IDs. Embedded database images are not file-storage quota. This is not an absolute total-cost cap.

## Still required before release

### September 25 deployment attempt

- Fresh `git fetch origin` succeeded; `origin/main` and HEAD both equal `ef3539aafa89220b66af18dfa798c905a22be55e`. No integration conflicts or newer commits.
- No push, production migration, function deployment or web deployment was performed.
- Passed again: handbook retrieval/context and impact gate against that exact SHA; payment and voice evidence tests (maintained stale fixtures); storage gateway/client/PGlite tests; render preparation/handler/review tests; multi-photo upload/draft tests; expired-portal regression; invoice layout regression; public build and artifact checks.
- Deno 2.9.6 full type-check passes for `storage-budget`, `portal-designs`, and `optimize-photo-storage`. Remaining type errors in `client-document`, `document-payment`, and `voice-audio` require review before this combined release; do not describe the full backend type-check as green.
- Docker Desktop was started hidden for isolated integration checks, but its API inspection did not return. Actual concurrent Postgres/Storage and authenticated upload/finalize tests remain unperformed. Authenticated chatbot and visual browser checks remain unperformed too.
- Live read-only inspection confirmed signed-upload bucket maxima: payment evidence 8 MiB, voice evidence 6 MiB. The shared quota table is not live yet; render bucket still has its existing 8 MiB cap.
- Split activation into `20260925151506_shared_storage_policy_cutover.sql`. Apply quota schema first, deploy/verify compatible functions and web, then activate restrictive policies. Never bulk-apply the cutover ahead of the code. Existing open tabs must refresh afterwards.
- Cloudflare currently shows production commit `ef3539a` with automatic deployments from main. No billing/plan changes or customer/model files were changed.

1. Fetch/integrate the latest main and repeat the handbook release checks with that exact SHA.
2. Test in a disposable Supabase environment: actual concurrent uploads, teammate permissions, retries, payment-proof finalize and voice evidence finalize/retention, every photo upload/delete route. PGlite tests do not prove live Storage service behaviour.
3. Coordinate migration `20260924163345_shared_storage_budget.sql` with the web app and `storage-budget`, `portal-designs`, `optimize-photo-storage`, `document-payment`, `voice-audio` and their current dependencies. Earlier rendering migration and `client-document` changes are also pending. Do not apply restrictive policies ahead of compatible handlers. Use a controlled cutover; old cached upload clients must refresh.
4. Verify actual bucket maxima for signed uploads (payment proof 8 MiB, voice 6 MiB). Keep originals if any save fails. No real customer records/messages for tests.
5. Verify published handbook/source links and authenticated chatbot answers after deployment.

## Local verification record

Passed: executable PGlite reservation/RLS tests; browser-adapter and Edge-handler tests; render handler 30 MB round trip, preparation and quote-review tests; expired-portal activity regression; multi-photo upload test; handbook tests and impact check against local origin/main `ef3539aafa89220b66af18dfa798c905a22be55e`; public build/artifact checks. No fresh fetch, release, authenticated live check or real parallel Postgres test was performed.

The wider payment-proof test has a pre-existing hard-coded bundle expectation (`2026082401` versus HEAD's `2026091702`). The voice-evidence test has an expired August playback fixture evaluated against the real current date. Those suites are not green; their remaining coverage needs rerunning with maintained fixtures before release. TypeScript was syntax-parsed, not fully Deno type-checked.

Reproduce the SQL test with a disposable install of `@electric-sql/pglite@0.3.14` and set `QD_PGLITE_MODULE` to its `dist/index.js`, then run `node tests/storage-budget-migration.test.mjs`. Run `node tests/storage-budget-handler.test.mjs` and `node tests/storage-budget-client.test.mjs` for gateway/client coverage. The temporary dependency install was not added to the application package.

## Larger renderings and costs (remaining work)

The render transport remains bounded to **30 MB per final upload**, not the entire working folder. The inspected final HTML was about 20.6 MB even though its source folder was about 75.1 MB. The customer's folder was left untouched.

Larger direct/resumable transfers and lossless compressed delivery remain a separate technical gate. The current Free plan's 50 MB file ceiling and Edge memory limits cannot be solved by changing a number in the UI. Do not advertise 250 MB files or unlimited renders yet.

Monthly uploaded bytes control growth, not repeated-download egress. Monitor project bandwidth separately. Paid 100 GB add-ons and host/plan changes remain unimplemented and require an explicit billing decision. See STORAGE-COST-AUDIT-2026-09-24.md for dated provider pricing and exclusions.
