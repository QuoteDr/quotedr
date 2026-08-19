# Voice To Quote optional audio evidence

Status: release implementation and security checklist. This document does not itself authorize a push, migration, function deployment, scheduled job, customer lookup, or production test record; each release still requires explicit owner authorization.

## User contract

- Text transcripts keep their existing retention and parser-safety contract. A transcript is confirmed saved before optional audio upload or quote parsing begins.
- First use requires a decision before any microphone capture: `Save private audio for 14 days — Recommended` or `Transcript only`. Neither option is preselected. The choice is stored as the account default, shown in Voice To Quote, and can be changed later. The current notice version is `2026-08-09-audio-v1`.
- The recommended option exists so an explicitly authorized, case-bound support investigation can compare the private original recording with the saved transcript and generated draft after a reported rare AI Voice error. QuoteDr staff do not routinely access or listen to recordings.
- When enabled, the browser records compressed mono audio while browser speech recognition builds the text. The browser is asked for 48 kbps, but it may ignore that request or select a different encoder.
- Format selection prefers WebM/Opus, then Ogg/Opus, then MP4/AAC, then a validated browser default. Unsupported results are discarded and text transcription can continue.
- A recording is limited to five minutes and 6 MiB. Each account has a rolling 100 MiB cap. The UI warns when less than one maximum-size recording remains.
- Audio normally expires after 14 days. Audio expiry or deletion never deletes or shortens the text transcript.
- The owner can see size and expiry, play privately, and delete immediately.
- `Preserve for Support` requires a case ID, reason, and explicit authorization for that recording. An active hold pauses normal expiry. Closing the hold sets a 30-day post-case deletion date; the owner can delete sooner.
- Audio is investigation evidence for human review. It is not described as legal proof and does not automatically establish compensation, a refund, credit, or reimbursement.
- The recording screen has an obvious live state and pause control. Users are told to avoid access codes and unnecessary sensitive information and to pause during private conversations.

## Security and storage design

- Audio bytes live only in the private `ai-voice-audio-evidence` Supabase Storage bucket. Postgres stores lifecycle metadata and audit records, never an audio blob.
- Browser roles have no direct policies or table grants for audio metadata or Storage objects. Owner actions go through the authenticated `voice-audio` Edge Function.
- Upload uses a path-bound signed upload token. Playback uses a 60-second signed URL that the web app immediately fetches into an in-memory Blob URL; the signed URL is not persisted.
- The browser never receives a service-role key.
- Reservation and finalization are idempotent. A per-owner transaction-level advisory lock serializes quota checks. The unique object path may be safely retried with signed upsert.
- Pending uploads expire after two hours. Cleanup uses an atomic `deletion_pending` claim, so cleanup cannot race past a new support hold. Failed Storage removal remains retryable.
- Support cannot list the bucket. Support metadata and playback require an administrator identity, exact account email, exact active case ID, an entered investigation reason, and the owner's explicit recording authorization. An audit row is created before support metadata is queried and completed before a result or signed URL is returned.
- Audit entries expire after two years. Audio cleanup is server-triggered hourly after the separate schedule is intentionally activated.

## Measured size and expected storage

The local desktop Chromium fixture recorded six seconds of synthetic mono audio while a fake speech recognizer independently returned `trim five exterior doors`:

- Format: `audio/webm;codecs=opus`
- Encoded Blob: 36,841 bytes
- Projected rate from that sample: about 0.35 MiB per minute
- A five-minute recording at that measured rate: about 1.76 MiB

The product copy uses a broader **0.3–1 MB per minute** planning range because Safari/MP4, device encoders, silence handling, and browser-chosen bitrates can differ. It does not promise a fixed bitrate. The hard 6 MiB limit remains authoritative.

At the 100 MiB rolling cap, an account can hold at most sixteen full 6 MiB recordings at once, or roughly fifty-seven five-minute recordings at the measured desktop rate. Normal 14-day expiry usually lowers the steady-state amount.

Supabase currently documents Storage overage by GB-hour (equivalent to about $0.0213 per GB-month). Holding the full 100 MiB cap for 14 days is roughly 0.046 GiB-month, or about $0.001 of storage overage before included quota. This is an estimate only; request, egress, plan allowance, encoder behavior, and future pricing are separate. Monitor Supabase Storage size, egress, request counts, and spend-cap alerts rather than treating this estimate as a guarantee.

Reference: <https://supabase.com/docs/guides/platform/manage-your-usage/storage-size>

## Local verification scope

- Node recorder fixtures: Android Chrome WebM/Opus, iPhone Safari MP4/AAC, desktop Ogg/Opus, browser-default validation, permission denial, pause/resume timing, discard, and microphone-track cleanup.
- Browser fixture: simultaneous synthetic MediaRecorder capture and independent fake transcript; measured current desktop encoding; responsive checks at Android, iPhone, and desktop viewport sizes. No microphone permission, customer data, account, upload, or saved audio is used.
- Client retry fixtures: interrupted/offline upload keeps the transcript and idempotency key, retry reuses the reservation, base MIME is used for Storage validation, and an already-finalized request does not upload twice.
- Policy/security checks: owner isolation, private bucket, RLS/grants, no Postgres audio bytes, consent version, quota, normal expiry, active hold, post-case expiry, support audit ordering, exact account/case checks, 60-second playback, deletion retry, and absence of sensitive logging.
- Existing parser, measurement, qualifier/count, trade-rule ambiguity, and transcript-history regression suites remain required.

## Careful deployment checklist

1. Fetch and integrate the then-current `origin/main`; review that the final diff contains only Voice To Quote audio evidence and direct conflict resolutions.
2. Rerun all focused Voice To Quote tests and the local browser fixture. Perform a real signed-in live-microphone check with an isolated test account only if separately authorized.
3. Deploy the backward-compatible `voice-transcripts` Edge Function update. It accepts the prior text-only notice during cache rollout, but optional audio still requires the new notice exactly.
4. Apply `20260809031711_ai_voice_audio_evidence.sql`. Verify the bucket is private, allowed MIME types and 6 MiB limit are present, browser roles have no audio table/Storage access, and direct transcript deletion is revoked.
5. Set a dedicated high-entropy `VOICE_AUDIO_CLEANUP_TOKEN` Edge secret. Do not reuse an API key or expose it to the browser.
6. Deploy the new `voice-audio` Edge Function. Verify unauthenticated owner/support calls fail, wrong cleanup tokens fail, and responses use `Cache-Control: no-store`.
7. With isolated non-customer identities, verify owner/cross-account RLS behavior, signed upload/finalization, 60-second playback, delete, preserve, exact-case support access, case close, and cleanup. Do not query customer records.
8. Deploy the changed web assets: `quote-builder.html`, `settings.html`, `supabase-v2.js`, `ai-voice-audio-recorder.js`, `privacy.html`, and `terms.html`.
9. Verify the first-use disclosure requires one of the two choices before any microphone capture, neither choice is preselected, the selected account default is remembered and clearly shown, the live recording/pause state is obvious, text saves before audio/parse, and an interrupted audio upload leaves a visible retry while parsing continues.
10. Add the required Vault values and run `supabase/ai_voice_audio_cleanup_schedule.sql` only after the schema and function are healthy. Confirm one hourly job exists and a test cleanup request succeeds before relying on retention claims.
11. Check Storage usage/egress and cleanup audit health after release. Keep cleanup active during rollback until all retained objects are removed; do not drop the bucket first.
12. Fetch `origin/main` again and verify the live web revision without overwriting newer releases. No native or package sync is required unless the final diff later includes those files.

## Residual review items

- This Windows environment cannot run real iPhone Safari. The iPhone path is covered by the feature-detected MP4/AAC fixture and responsive viewport test; a physical iPhone/Safari microphone and playback pass remains a release check.
- The local browser measurement used generated audio, not real speech or a physical microphone. A live hardware microphone pass remains outstanding and must use an isolated test account.
- Support-case closure is explicit because QuoteDr does not yet have a central support-case lifecycle table. Operations must close the hold when the case closes; audit/retention monitoring should flag unusually old active holds.
- Docker/Deno were unavailable locally, so the migration and Edge Function received static, Node syntax, policy, and concurrency tests rather than a local Supabase container run. Apply only after staging-project verification.
