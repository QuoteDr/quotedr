# Daily work reminders — deployment gate

Local implementation only. No SMS provider, phone number, production secret or scheduler has been configured by this change. Web push is optional; provider acceptance does not prove device delivery. Server execution/storage and future AI usage may still incur costs.

## Coordinated release (requires owner approval)

1. Apply `20260921013900_labor_web_push_reminders.sql` after the existing labour tables. Verify anonymous access is denied, authenticated users can only select their own settings, and only service-role handlers can write subscriptions/test claims. Use two disposable test users, not customer records.
2. Generate a VAPID key pair once with the pinned web-push library. Store `LABOR_VAPID_PRIVATE_KEY`, `LABOR_VAPID_PUBLIC_KEY`, and a valid contact `LABOR_VAPID_SUBJECT` in Edge Function secrets. Never put the private key in web assets or commit it. Keep this pair stable; rotation requires re-subscribing browsers.
3. Set a strong random `LABOR_REMINDER_CRON_SECRET`, stored in secrets and server-side Vault. Deploy `labor-web-push` with `_shared/labor-push-policy.mjs` and `labor-notification-dispatch` together. Both verify cron authorization inside the handler; JWT verification remains disabled for scheduler calls.
4. IMPORTANT: the older native dispatcher cron was unauthenticated. Update its existing job to send the new Bearer secret before enabling the hardened dispatcher. Do not create a second native job. Add one five-minute web dispatch job POSTing `{ "action": "dispatch" }` to `labor-web-push`, with the same server-side authorization. Never embed secret values in a committed SQL file. Inspect existing jobs and coordinate this switch to avoid a reminder outage.
5. Deploy web assets and matching handbook. Set `LABOR_WEB_PUSH_ENABLED=true` only after configuration and test-account checks. It defaults off. No native files changed; this web feature does not require a new native binary. It does not add web subscriptions to the native companion app.
6. With a consenting test user on Android Chrome and an iPhone Home Screen web app, enable reminders, send a test, tap the notification and confirm authenticated access to the work log. Check permission denial, offline/missed notifications, weekends, DST, quiet hours, disabling, replacement device and duplicate dispatch calls. Test acceptance is not delivery proof.
7. Verify the published handbook and authenticated chatbot answers for reminders and actual-hour entry. Do not send client messages or modify real quotes.

## Behaviour and limits

- One active web browser subscription per account. Enabling on a second device replaces the first. A browser subscription cannot be active for two accounts simultaneously; disable it in the previous account first.
- Web opt-in disables the old native morning/evening schedule for that user. Turning web reminders off does not restore native reminders.
- Defaults: weekdays at 17:30 in the browser's time zone, saved with the schedule; weekends optional. Time zone stays saved if the user travels. Fixed quiet hours 20:00–08:00. Test requests are immediate and explicitly user initiated.
- Shared unique daily evening claim is written BEFORE either transport sends. Failed/uncertain attempts are not retried that day, prioritizing avoiding duplicates. A notification already in flight may still arrive after disabling.
- Any saved check-in on the local date suppresses the day's web reminder; this is not a per-job completeness check. Dashboard always offers the work-log link and pending review count, even without push permission.
- Delivery supports the allowlisted Google, Mozilla and Apple web-push endpoints. Unsupported providers fail closed. Push payload and notification contain no client, quote, location or hours data.
- Test requests are one attempt per five-minute bucket. Retain recent test claims for rate limiting; an operator may separately schedule cleanup of claims older than 30 days. No cleanup job is activated here.
- Existing legacy mobile check-in auto-learning has not been redesigned here. The new manual work-log review path remains separate.

## Verification evidence

Policy/static tests and handbook checks can run locally. Database/RLS, Edge Function runtime, scheduler, authenticated chatbot and real-device delivery must be verified separately before claiming this feature live.
