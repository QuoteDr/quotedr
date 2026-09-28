# Activity shortcut and coarse location release

Local implementation; not deployed by this change.

## Required activation

1. Generate one random secret of at least 32 characters. Set `QDR_ACTIVITY_LOCATION_SECRET` as a Cloudflare Pages production secret for each serving project and as a Supabase Edge Function secret. Never commit or print it. Preview environments should use a separate matching secret/backend or remain unconfigured.
2. Deploy `client-document` with current dependencies, including `_shared/activity-location.mjs`, without Docker. No database migration is required: coarse location uses the existing owner-protected event metadata.
3. Deploy the normal web artifact containing `_worker.js` and `_routes.json`. The only Worker route is `/api/document-activity`; other assets stay static. Verify both client hosting domains. This introduces Pages Functions requests for document telemetry; review the hosting plan's function-request allowance before activation.
4. Verify an authorised synthetic document, not a customer document: open, send duration, inspect owner's activity, confirm approximate location. Verify direct unsigned/spoofed events have no location. No client messages.
5. Check published handbook/source links and authenticated chatbot answers. Local tests are not production evidence.

## Behaviour and limits

- Notifications > Show Activity uses the authenticated existing activity endpoint. Closing returns to notifications without changing read/unread state.
- Only `log_event` requests are relayed. Existing token access, owner-preview exclusions and owner-only report access remain in Supabase. The relay is not an authentication substitute.
- Cloudflare's city, region and country are signed with a timestamp and exact request payload. Supabase verifies HMAC and freshness, discards client-supplied `location_*` fields, and stores only verified coarse fields. Raw IP, browser/device, coordinates and postal codes are not added to activity records or forwarded headers. Hosting providers may retain their normal infrastructure logs.
- Existing events are not backfilled. Standalone design-only activity uses a different table/endpoint and is not given location by this change. Quote/invoice document events (including design duration events sent via that document logger) are covered.
- A missing/unconfigured relay falls back to ordinary event logging with no location. Once forwarding begins, a failure is NOT retried automatically, avoiding duplicate events. A disconnected browser can lose telemetry; never treat missing logs as proof of no visit.
- Native mobile files/config/dependencies are unchanged. HTTPS web clients use the relay; local HTTP preview uses unsigned direct logging with no location. No new native build or bundle sync is performed.
- Rollback web and Edge Function together when possible. Removing the relay alone falls back on 404; leave the current Edge Function's stripping of untrusted location fields in place. No stored customer records need editing.
