# QDR storage and rendering decision brief — 2026-09-24

## Outcome and boundaries

Expired existing-portal access is fixed locally in dashboard.html. Publication and Email Portal Follow-up keep their send checks. Regression, expiry, portal-link, change-order destination and handbook tests passed. No deployment, customer record edits, model-folder writes, subscription changes, or new storage-policy implementation occurred. Earlier local 30 MB/three-upload implementation remains pending and should be reconsidered before deployment.

## Verified live storage, not an assumed paid plan

Read-only Supabase management and SQL inspection identified project Quote Dr. (axmoffknvblluibuitrq), organization ALD Direct Inc., reported plan free/tier_free. User files below are Supabase Storage objects; Cloudflare hosting the website does not mean those objects are in R2. No R2 migration is configured by this work.

| Live bucket | Objects | Stored bytes | Bucket restriction |
| --- | ---: | ---: | --- |
| item-full-res-photos | 64 | 76,117,084 | Public; no bucket-specific size/MIME cap |
| portal-designs | 8 | 12,591,374 | Private; 8,388,608 bytes/file |
| portal-job-assets | 5 | 1,153,833 | Private; no bucket-specific size/MIME cap |
| document-payment-evidence | 2 | 639,332 | Private; 8 MiB, JPEG/PNG/PDF |
| ai-voice-audio-evidence | 0 | 0 | Private; 6 MiB, allowed audio MIME types |
| room-photos / Signatures | 0 | 0 | Public; no bucket-specific cap |

Total current object metadata size: 90,501,623 bytes (~90.5 MB), not a billing-cycle average. This excludes database size, database backups, bandwidth, compute, and local backups. The provider's global file limit still applies where a bucket cap is null. Free supports at most 50 MB/file; the project's exact global configured value was not read. No invoice, month-to-date egress, or actual bill was retrieved.

## Current product limits and gaps

| Surface | Code limits | Enforcement / cost caveat |
| --- | --- | --- |
| Rendering | Live bucket 8 MiB; local pending 30,000,000 bytes plus 3 successful uploads/replacements per owner/UTC month | Pending ledger is not live. Existing render code retains older objects. Three uploads/month does not cap lifetime bytes or downloads. |
| Add/Edit Line Item photos | 3 photos; 10 MiB input each; resized to 1200px JPEG quality .8; shared cloud preparation uses 600px/.78 thumbnails | Do not apply this lossy photo pathway to models. Quote/item counts are not a total storage allowance. |
| Saved-item full-resolution photos | 3/item; 10 GiB bucket allowance by user-path | Live INSERT/UPDATE RLS calls quotedr_item_full_res_photo_usage_bytes. It is a SUM check, not an atomic reservation: parallel writes can race. Separate from portal assets and renders; not a unified owner-account budget. Public delivery also permits repeated bandwidth use. |
| Portal job photos | 15 MiB input; normally 2048px/.78 plus 480px/.72 thumbnail | Stored in private portal-job-assets. Photos are resized; unlike the proposed lossless model storage. |
| Portal job documents | 25 MiB/file; videos use external links | 5 GiB warning / 10 GiB UI hard stop across portal assets. Live storage RLS verifies owner path, but does not enforce aggregate bytes. No quota trigger found on storage.objects beyond standard timestamp/delete protection. |
| Payment proof | 8 MiB/file | No aggregate account byte ceiling identified in reviewed path. Per-file cap is not a lifetime limit. |
| Optional voice evidence | 6 MiB / 5 minutes; 100 MiB account cap | SQL reservation quota in source; 14-day normal retention, support holds and 30-day post-case retention. Cleanup must run; source retention is not proof of live scheduler execution. |

Sources inspected: quote-builder.html, quote-items.js, quote-media.js, client-portal.html, portal-designs.js, portal-design-policy.mjs, supabase/functions/portal-designs/index.ts, client-document/index.ts, _shared/payment-evidence-policy.mjs, _shared/voice-audio-policy.mjs, voice-audio/index.ts, migrations for item photos/portal job assets/voice evidence; live bucket metadata, storage policies and photo usage function.

**There is no defensible finite worst-case cost per customer today.** The two nominal 10 GiB allowances are separate, portal enforcement is UI-only, some other categories have no aggregate ceiling, revisions accumulate, and downloads are not capped. Do not sell this as one secure 10 GB budget.

## Model folder: no modification

Folder Amanda-Client-Walkthrough contains 47 files, 75,125,229 bytes (71.65 MiB). The portal upload is the self-contained Amanda-Basement-Walkthrough.html: 20,627,750 bytes (20.63 MB). The ZIP (18,138,868 bytes) and loose images/backups explain much of the folder total; do not upload the entire folder as separate render objects.

An in-memory gzip level-9 measurement produced 14,424,888 bytes, a 30.1% reduction. Decompression was byte-for-byte identical. No geometry, texture, still, code or model quality changed; no file was written. Existing QDR does not yet accept/decompress this compressed format. A future implementation needs bounded decompression, original-size and hash verification, correct content handling, and phone memory testing. It reduces storage/transfer, not runtime scene memory. Do not promise every model compresses this well.

## Published costs (USD, before tax; illustrative decimal GB)

Supabase paid overage storage: $0.0213/GB-month, approximately $0.0000213/MB-month. Uncached delivery: $0.09/GB (~$0.00009/MB); cached delivery: $0.03/GB. Free includes 1 GB storage and 5 GB each cached/uncached egress; Pro includes 100 GB storage and 250 GB each egress pool. These are provider organization allowances, not per QDR customer. Free is quota-limited, not an automatically metered paid-overage plan.

| Usage scenario above included allowance | Storage/month | Uncached transfer example |
| --- | ---: | ---: |
| Actual 20.63 MB HTML | $0.00044 | 100 full deliveries = ~$0.186 |
| Hypothetical 75 MB model | $0.00160 | 100 full deliveries = $0.675 |
| Both existing nominal 10 GiB allowances full | ~$0.457/customer | One complete download = ~$1.933; ten = ~$19.33 |
| 100 GB stored add-on | $2.13 | 100 GB downloaded = $9; 1 TB = $90 |
| 1,000 customers each at nominal 20 GiB | ~$457 before included quota | One full download each =~$1,933 |

These are marginal raw infrastructure examples, not guaranteed bills or a per-account maximum. Current renders are proxied through Edge Functions; storage-to-function and function-to-client traffic and legacy base64 expansion may add metered bytes. Do not assume the cheap cached rate applies to the entire private render route. Monthly new-upload limits still accumulate storage: 2 GB uploaded every month becomes 24 GB retained after a year without a retained-storage cap.

Cloudflare R2 Standard alternative: $0.015/GB-month (~$0.000015/MB-month), free internet egress, plus request operations and any Worker/auth costs. 100 GB raw storage is $1.50/month before included allowance/rounding; it is not free hosting overall. Current QDR user uploads are not on R2. Routing R2 bytes back through Supabase would undermine the delivery saving; authorized direct delivery/Worker streaming and the current sandbox/privacy boundaries would need deliberate implementation.

## Recommendation for owner decision — not implemented

1. Replace render-count allowance with an account-wide byte budget shared by team members: initially propose 10 GB retained storage plus 2 GB new uploads/month for paid accounts, with visible 80%/95% warnings. Decide how existing separate allowances migrate; do not silently shrink or delete existing customer data.
2. Keep a technical per-file guard as well (proposed 250 MB after direct/resumable upload and delivery changes). Monthly quota alone cannot prevent one upload exhausting an Edge worker or phone. Supabase Edge memory is 256 MB; current handlers buffer complete files, so simply raising the constant is not a safe large-file design. Supabase recommends resumable uploads above 6 MB. Free-plan >50 MB also needs a provider-plan/storage change.
3. Enforce byte reservations atomically on the backend, across render/photo/document paths, count versions and thumbnails, reconcile actual object bytes, expire failed reservations, and block direct bypass. Publish retained and monthly usage separately. Keep recovery versions unless an explicit retention policy is accepted; use recoverable/user-confirmed cleanup.
4. Consider R2 Standard for large models before broad adoption, while keeping Supabase for app data/auth. For the current 20.6 MB model, the pending 30 MB support is sufficient; R2 is not required for this one upload.
5. Consider a recurring 100 GB storage add-on (e.g. CAD $10–15/month as a product hypothesis, not a proven margin). With Supabase, include a defined bandwidth allowance/fair-use policy: storage pricing alone cannot cover unlimited model viewing. With R2, bandwidth risk is lower but abuse, request and Worker costs remain. No surprise automatic overage charges or per-photo fees.
6. Optional lossless gzip/brotli packaging is worthwhile; retain full-quality original semantics and verify hash after decompression. Never decimate or resize model assets without explicit permission. Account for both stored bytes and unpacked safety limits.

## Verification / next steps

No uploaded customer objects or model source files were changed. No billing plan changed. Expiry fix is local, not live; full authenticated browser activity and chatbot walkthrough remain release checks. Handbook check passed against existing local origin/main ef3539aafa89220b66af18dfa798c905a22be55e; no fresh fetch/integration this turn. Repeat release workflow before deployment. Choose quota/storage direction before deploying the pending render-count migration unchanged.

## Current official references

- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
- https://supabase.com/docs/guides/platform/manage-your-usage/egress
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- https://supabase.com/docs/guides/functions/limits
- https://developers.cloudflare.com/r2/pricing/

Pricing verified 2026-09-24. No relevant storage-contract change identified in the current changelog scan; changelog.md could not be fetched by the web tool, so the HTML changelog and current topic docs were used.
