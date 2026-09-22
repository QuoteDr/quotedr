# QDR daily work reminders — save this for later

Release boundary, September 21, 2026: the web work-log UI and reminder setup UI are included in the web release, but PUSH DELIVERY IS NOT ACTIVATED. The reminder migration, functions, keys and schedulers remain deferred. No notifications or SMS have been sent by this work. Keep this file with your project notes; the technical setup instructions are in `docs/LABOUR-PUSH-SETUP.md` in the QuoteDr repository. This file describes the release scope, not proof of real-phone delivery.

## What we are trying to achieve

Give the user a gentle daily nudge: “What did you work on today?” Record hours and completed quantities against quote line items. Over time, use reviewed work records to suggest realistic production rates and improve future job-duration estimates. Geofence time is a comparison, not proof of productive work or automatic payroll.

We chose optional phone push notifications instead of SMS. No QDR phone number or SMS subscription is required. Push is not a text-message conversation: tapping opens QDR. Backend hosting/storage and future AI processing can still have usage costs.

## Built so far

- Labour Tracker: manual Daily Work Check-in for quote, room/item, date, worker, hours per person, crew size, completed quantity and notes.
- Draft logs require approval. Normal work trains suggestions; rework, waiting and extra scope are excluded.
- Suggestions use completed quantity divided by labour-hours. Four hours with two people means eight labour-hours. Unequal individual hours should be separate logs.
- Suggestions do not silently rewrite quotes or saved item prices/rates. Adoption is currently manual in Manage Line Items > Labor Time > Units/hr.
- Dashboard card links to work logs and shows the count awaiting review, even when notifications are unavailable.
- Optional push controls: time, weekends, enable, test and turn off. Default weekdays at 5:30 pm; quiet hours 8 pm–8 am in the saved time zone.
- One active web browser/device per account. Enabling a new device replaces the old one and disables that user's older native morning/evening reminder schedule. Turning web reminders off does not restore that older schedule.
- Duplicate-send protection: reserve one daily evening reminder before sending. Failed/uncertain attempts are not retried that day. Any saved check-in for that local date suppresses the web reminder.
- Generic lock-screen message; no customer, job, location or hours details.

## What still must happen before using it

1. Fetch/integrate the newest main branch before resuming. The September 21 release includes the source and web interface only; do not assume its presence means reminder backend activation is complete. Preserve other work and do not deploy every Edge Function blindly.
2. Test database permissions with disposable accounts. Docker was not running during the last check, so database/RLS validation was not completed.
3. Apply the new reminder migration after the existing labour tables: `20260921013900_labor_web_push_reminders.sql`.
4. Generate and securely configure the VAPID push keys and cron authorization secret. The exact secret names and rollout order are in LABOUR-PUSH-SETUP.md. Never paste private keys into this note or public files.
5. Deploy `labor-web-push` and the changed `labor-notification-dispatch` with their dependencies. Coordinate the existing native scheduler's authorization update: the hardened function rejects its old unauthenticated calls. Avoid a duplicate schedule or a reminder outage.
6. Deploy web assets and matching handbook, then enable the feature flag and the authorized five-minute scheduler. This requires separate deployment approval; this note is not permission to activate anything.
7. Verify the published handbook, authenticated chatbot answers, browser workflow and actual phone delivery. Local tests are not proof of any of those.

## Owner testing checklist — after deployment/configuration

Use a disposable test quote/account, not real customer records or messages.

- Open Labour Tracker on your phone. On iPhone use a Home Screen installation. Choose a reminder time and tap Enable reminders on this device; allow notifications.
- Tap Send test notification. “Accepted” means the provider accepted it, NOT that the phone received it. Confirm it appears, then tap it and confirm the correct authenticated work-log screen opens. Tests allow one attempt per five-minute window.
- Create a test log: 2 people × 4 hours, 400 sq ft completed = 8 labour-hours and 50 sq ft per labour-hour. Save the draft, reopen and approve it. Confirm no suggestion changes your saved item automatically.
- Add rework/waiting logs and verify they do not alter the normal-work suggestion. Reject a log and check the dashboard review count after reloading.
- Manually adopt a reviewed suggestion on a disposable saved item, then check the existing Timeline Report on a new quote. Verify labour-hours and elapsed crew time are not confused.
- Test weekends, quiet hours, a saved check-in suppressing that day's reminder and duplicate scheduler calls. Test turning reminders off. An already in-flight notification may still arrive.
- Deny notifications or go offline: the dashboard work-log link must remain usable when back online. Do not promise notifications always arrive; phone settings and connectivity matter.
- Test uncertain save/retry without duplicates, review conflicts and two-account isolation. Keep the page open if saving is unconfirmed; closing-tab draft recovery is not built yet.

## What would make it the copilot we want

Recommended order after the first real-phone loop works:

1. Conversational/voice entry: “Two guys boarded the basement for five hours.” Suggest the correct quote item, ask what quantity was completed and show 10 labour-hours for approval. Never invent quantities or silently match ambiguous items.
2. Durable draft/retry recovery after closing the browser, plus paginated history beyond the latest 500 logs.
3. Stable item identities across quote splits/combinations/deletions, with a review path for unmatched historical work.
4. One-click reviewed production-rate adoption with sample counts, before/after history and undo. Current suggestions pool identical category/name/unit, so scope differences still need judgement.
5. Compare approved task hours with geofence sessions and flag unallocated time. Do not automatically treat driving, breaks or waiting as productive work.
6. Better schedule estimates using crew size, dependencies and wait times separately from labour-hour estimates.
7. Audit/replace the older native `labor-checkin-submit` auto-learning path; it is not the new review-first workflow. The new web form deliberately bypasses it.

## Verification completed locally

Labour calculations, push scheduling rules, duplicate-claim structure, denied-auth handling, fixed notification destination, existing mobile static regressions, handbook retrieval/release checks and public build/artifact checks passed. Authenticated database, production functions/scheduler, actual browser interaction, real-device delivery and chatbot answer quality remain unverified. No native files were changed for web push.

## Resume prompt

“Resume QDR daily work reminders using docs/REMINDER-PROJECT-HANDOFF-2026-09-21.md, docs/LABOUR-PUSH-SETUP.md and docs/LABOUR-FEEDBACK-IMPLEMENTATION.md. Inspect current code and deployment status first; the September 21 note describes local, undeployed work. Preserve unrelated changes. Finish verification and explain any required setup before activating delivery. Do not send customer messages or alter customer records.”
