# Activity shortcut and coarse location release

Extension deployed on 2026-09-28 with the metadata migration and both Edge Functions.

2026-09-28 release verification: both production domains returned verified coarse city/region/country from the no-write diagnostic after replacing `redirect: error` with `redirect: manual` and explicitly refusing 3xx responses. The former mode produced live relay gateway failures despite passing Node mocks. The diagnostic is not a customer visit or a persisted-event/owner-UI test. Synthetic handler persistence and privacy checks passed locally; authenticated chatbot and live synthetic customer-document persistence remain unverified.

Extension release: apply `20260929012841_design_activity_location.sql`, deploy both `client-document` and `portal-designs` with current dependencies, then publish the web artifact. The relay now supports attached design review and standalone tracking. Preserve binary design response headers. POST `{ "action": "location_check" }` to `/api/document-activity` on each production host: this makes no database writes and returns only the requesting network's verified coarse location. A false result is a release blocker for location claims; check matching secrets and Cloudflare network fields. Then use an authorised synthetic fixture to verify persistence and owner display; do not manufacture visits on customer documents.

## Required activation

1. Generate one random secret of at least 32 characters. Set `QDR_ACTIVITY_LOCATION_SECRET` as a Cloudflare Pages production secret for each serving project and as a Supabase Edge Function secret. Never commit or print it. Preview environments should use a separate matching secret/backend or remain unconfigured.
2. Deploy `client-document` with current dependencies, including `_shared/activity-location.mjs`, without Docker. No database migration is required: coarse location uses the existing owner-protected event metadata.
3. Deploy the normal web artifact containing `_worker.js` and `_routes.json`. The only Worker route is `/api/document-activity`; other assets stay static. Verify both client hosting domains. This introduces Pages Functions requests for document telemetry; review the hosting plan's function-request allowance before activation.
4. Verify an authorised synthetic document, not a customer document: open, send duration, inspect owner's activity, confirm approximate location. Verify direct unsigned/spoofed events have no location. No client messages.
5. Check published handbook/source links and authenticated chatbot answers. Local tests are not production evidence.

## Behaviour and limits

- Notifications > Show Activity uses the authenticated existing activity endpoint. Closing returns to notifications without changing read/unread state.
- Only `log_event`, supported `design_review` operations, `track_activity`, and the no-write `location_check` are relayed. Existing token access, owner-preview exclusions and owner-only report access remain in Supabase. The relay is not an authentication substitute.
- Cloudflare's city, region and country are signed with a timestamp and exact request payload. Supabase verifies HMAC and freshness, discards client-supplied `location_*` fields, and stores only verified coarse fields. Raw IP, browser/device, coordinates and postal codes are not added to activity records or forwarded headers. Hosting providers may retain their normal infrastructure logs.
- Existing events are not backfilled. Standalone design-only activity uses a different table/endpoint; its metadata column now stores verified coarse fields. Quote/invoice events and attached design opens, durations and skip actions are covered too.
- A missing/unconfigured relay falls back to ordinary event logging with no location. Once forwarding begins, a failure is NOT retried automatically, avoiding duplicate events. A disconnected browser can lose telemetry; never treat missing logs as proof of no visit.
- Native mobile files/config/dependencies are unchanged. HTTPS web clients use the relay; local HTTP preview uses unsigned direct logging with no location. No new native build or bundle sync is performed.
- Rollback web and Edge Function together when possible. Removing the relay alone falls back on 404; leave the current Edge Function's stripping of untrusted location fields in place. No stored customer records need editing.
