# QDR interactive-render handoff — updated 2026-09-24

The shared-byte budget supersedes the earlier three-upload proposal. See SHARED-STORAGE-RELEASE-2026-09-24.md for the full coordinated release and remaining verification gates. All changes are local, not live.

Local implementation; deploy the web app, portal-designs and client-document Edge Functions with current dependencies, and migration 20260922025938_portal_render_upload_allowance before using these limits in production. No native mobile files changed. Original customer model files were not modified.

## Copy to the modelling agent

Preserve the original SketchUp model and the full visual quality of the existing walkthrough. Do not decimate geometry, downscale textures, reduce image quality or remove views to meet the previous 8 MB limit. QDR is adding a 30 MB (30,000,000 bytes) upload limit.

Deliver one self-contained HTML file. Embed all geometry, textures, still images and JavaScript. Inline JavaScript and dynamically imported embedded blob modules are supported. No CDN/external files, network fetches, nested frames, workers, eval or new Function. Do not embed credentials or local machine paths. Keep third-party licences.

The HTML runs inside an opaque iframe with sandbox="allow-scripts" only. Do not require cookies, localStorage, IndexedDB, parent-page access, popups, fullscreen or pointer lock. Catch storage/fullscreen failures. Keep preferences in memory when storage is unavailable. Provide touch controls, responsive layout and a graceful fallback when WebGL or a required browser API is unavailable. Do not ask QDR to add allow-same-origin or disable its CSP.

QDR adds: default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'. Test under that policy, not just file://. Any export CSP must also permit the embedded blob scripts; a later policy cannot relax an earlier one.

Supply the HTML plus a thumbnail screenshot and separate ZIP backup, updated manifest/hashes, controls instructions and known limitations. ZIP is for backup, not portal upload. Keep the final HTML at or below 30,000,000 bytes; if larger, report its size without changing quality. The working-folder size is not the upload size. The shared budget meters uploaded bytes instead of counting three files; replacements and thumbnails count. Keep originals locally. Larger-file transport is not ready yet; do not remove model detail to work around that limit.

## Release and verification

- Local real-model preparation leaves a self-contained model unchanged; no lossy conversion. Thumbnail processing is independent.
- Multipart uploads/binary reads avoid base64 expansion in updated clients. Legacy JSON/base64 callers remain compatible. Private bucket and current portal/PIN/account authorization stay in place.
- Shared byte reservations start at migration; existing files count toward retained storage but not retroactive monthly uploads. A lost response may still have saved; refresh before retrying. Successful transfers count even if a later save fails. Withdrawal does not release retained versions; deletion does not refund monthly bytes.
- Old private object versions are retained for recovery. Nothing is automatically deleted.
- Test owner upload, fresh client PIN access, attached-quote review, withdrawal/revocation and phone controls on a disposable portal after deployment; never use a real customer record for release tests. Test current and older cached clients.
- Run node tests/portal-designs.test.mjs, node tests/portal-design-prepare.test.mjs, node tests/quote-design-review.test.mjs, migration test with QD_PGLITE_MODULE, and handbook release checks.

## Earlier 30 MB implementation verification (before shared-budget integration)

- Exact 30,000,000-byte multipart save and authenticated binary read round-trip through the real Edge handler with disposable adapters; oversize rejected and quota-denied uploaded objects cleaned up.
- Migration executed in disposable PGlite: fourth file blocked, replacement counted, rollback not counted, deletion did not refund, next-month allowance reset, 30 MB constraint and private-role permissions checked. Real parallel production requests have not been exercised.
- Original customer walkthrough opened in the local QDR sandbox; 3D scene, Real mode and kitchen gallery navigation verified without modifying the export. This is not a full phone/control sweep.
- Browser isolation regression: parent document, localStorage, eval and network denied; blob module import succeeded under production-style CSP headers.
- Handbook tests/release check against local origin/main ef3539aafa89220b66af18dfa798c905a22be55e, design/quote-review/client-document tests, public build and artifact checks passed. No fetch/integration/deployment was performed for this local change; repeat the release workflow against newly fetched main before publishing.
- Live authenticated upload, Edge resource usage, phone performance and chatbot answers remain unverified. Do not describe this as live until the migration/functions/web release is complete.

## Historical three-upload cost illustration (superseded, not a guaranteed budget)

Published Supabase rates checked 2026-09-21: storage overage US$0.0213/GB-month; uncached egress US$0.09/GB. Three 30 MB files add 0.09 GB/month. That batch costs approximately US$0.001917/month in storage overage; twelve retained batches are 1.08 GB, about US$0.023/month thereafter. One hundred full 30 MB deliveries represent 3 GB, about US$0.27 for that egress leg. Included allowances, thumbnails, retained versions, API/Edge overhead and any separately metered storage-to-function transfer affect actual cost. No billing-plan entitlement has been assumed.

Three uploads limits growth, not downloads or accumulated lifetime storage. Monitor account and project storage/egress usage before increasing the allowance. It is not a hard total-spend cap.

Sources: https://supabase.com/docs/guides/platform/manage-your-usage/storage-size and https://supabase.com/docs/guides/platform/manage-your-usage/egress
