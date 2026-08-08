# AI Operations Dashboard

`ai-operations.html` is an administrator-only support-to-product workspace. Open it from **Settings → Administrator → AI Operations**.

## Workflow

1. Create a support intake and review the prepared safe response.
2. If the case is a likely bug and includes a possible solution, the database trigger creates an engineering work item and release follow-up automatically.
3. Record the human-sent immediate response. Sensitive cases without a safe workaround require an owner account.
4. Review the advisory classification confidence, similar-case patterns, issue evidence, risk flags, policy gates, missing information, and recommended next step. Confidence is an evidence band, not a probability, certainty, or permission to act. Sensitive categories remain human-review-first at every confidence level.
5. An owner can select **Send to engineering coordinator**, review the exact privacy-minimized brief, and submit one durable revision to the internal coordinator inbox. Re-handoffs use a new revision and idempotency key. QuoteDr does not contact Codex Desktop, poll the queue, or launch an agent.
6. A separate trusted local coordinator process may be built later to claim queued requests after repeating its own approval and risk checks. This release only stores, displays, and audits queue state; it includes guarded claim, retry, outcome-recording, and cancellation transitions but no process that invokes them automatically.
7. Move engineering through implementation and evidence-backed verification. Verification creates a pending deployment approval. Owner approval only records permission; the dashboard cannot deploy.
8. After an approved release is deployed elsewhere, record its release reference and verification evidence.
9. Review the customer follow-up. Any live-fix wording requires the verified deployment record and owner approval. The dashboard never sends it.
10. Optionally recommend goodwill. Owner approval is recorded, but the dashboard has no credit-grant action.

Sensitive billing, payment, data-loss, privacy, access, legal/signature, cross-device, and broad-incident cases keep the existing human-review boundary.

## Backend

- Base migration: `supabase/migrations/20260808152738_ai_operations_dashboard.sql`
- Coordinator handoff migration: `supabase/migrations/20260808161014_ai_operations_coordinator_handoff.sql`
- Coordinator inbox migration: `supabase/migrations/20260808165116_ai_operations_coordinator_inbox.sql`
- Edge Function: `supabase/functions/ai-operations/index.ts`
- Function configuration: `[functions.ai-operations]` with `verify_jwt = true`

All eight operations tables have RLS enabled and direct `public`, `anon`, and `authenticated` access revoked. The two inbox tables also revoke default `service_role` privileges before granting only the required queue operations; the append-only inbox event table grants no update or delete. The Edge Function verifies a coordinator allowlist for every action and a separate owner allowlist for coordinator-inbox submission, deployment, live-fix wording, customer follow-up, and goodwill decisions.

The generated brief includes the case summary, controlled classification, advisory confidence and rationale, current safe workaround and response, product impact, proposed solution, evidence notes, escalation flags, missing information, requested outcome, and explicit approval boundaries. Customer name and email are omitted; email addresses, secure links, and token-like values are redacted before storage. The work-item update, queue revision, and audit inserts are performed by one database trigger transaction. The stored brief and rationale snapshot are immutable for that revision.

Queue states are `queued`, `claimed`, `task_created`, `retry_required`, and `cancelled`. Claims record administrator ownership and a bounded lease. Retriable failures store a sanitized error, retry count, and future availability time. `task_created` records a task that a trusted process created elsewhere; the dashboard has no create-task or launch-agent action.

## Local UI preview

Serve the repository locally and open:

```text
http://127.0.0.1:8893/ai-operations.html?demo=1
```

Demo mode only activates on `localhost` or `127.0.0.1`; it uses in-memory sample data and never calls Supabase.

## Verification

```powershell
node tests\ai-operations-core.test.js
node tests\ai-operations-static.test.js
deno check supabase\functions\ai-operations\index.ts
```

The three dashboard/inbox migrations and JWT-protected dashboard function are deployed in the current verified foundation. They must be re-checked against production before any later receiver release; adding receiver files locally does not change production.

## Trusted local coordinator receiver (prepared, not activated)

The receiving side is intentionally separate from the browser-facing `ai-operations` function:

- Migration: `supabase/migrations/20260808200503_ai_operations_coordinator_receiver.sql`
- Narrow Edge Function: `supabase/functions/ai-operations-coordinator/index.ts`
- Single-run local bridge: `scripts/ai-operations-coordinator.mjs`
- Synthetic no-data fixture: `tests/fixtures/ai-operations-coordinator-synthetic.json`
- Focused verification: `tests/ai-operations-coordinator-receiver.test.mjs`

The existing `ai-operations` function remains JWT-protected and continues to serve the administrator dashboard. The separate receiver uses a long random coordinator bearer secret because the caller is a trusted local process, not a signed-in browser user. Its gateway setting is therefore `verify_jwt = false`, but the function authenticates the coordinator secret before parsing the request or creating a service-role client. It has no CORS response and accepts POST only.

The receiver selects a fixed whitelist of fields from `ai_engineering_coordinator_inbox`. It never queries the customer-bearing support tables or the broad dashboard overview. The service-role key remains an Edge Function secret and is never stored in Codex automation configuration, source, browser JavaScript, a task brief, or logs.

After authentication, a database-backed 30-actions-per-minute ceiling is checked against the coordinator's own append-only audit table. If that check is unavailable, the receiver fails closed. Polls remain limited to five minimized requests and the normal heartbeat invokes only one poll.

### Actual bridge and activation model

There is no general Codex Desktop agent-launch API and no direct credential connection from the QuoteDr dashboard to Codex. The actual bridge is:

1. An owner reviews and queues a privacy-minimized request in QuoteDr.
2. A paused Codex heartbeat, targeted to the pinned Orchestrator task, may later invoke the local bridge once per scheduled run.
3. The bridge performs one authenticated poll and exits. It does not busy-loop.
4. The pinned Orchestrator displays the exact minimized brief and applies the operating rules.
5. If a low-risk, complete bug is appropriate for engineering, the Orchestrator creates or works in a dedicated isolated local worktree through the normal Codex task workflow. That manual Codex action is outside QuoteDr and is recorded honestly as `pinned_orchestrator_manual_local_worktree`.
6. The resulting local diff, commit, and tests return to the pinned task for owner review. Push, merge, and deployment remain unauthorized until the owner separately invokes the existing deployment protocol.

Sensitive billing, payment, refund, data-loss, privacy/access/security, legal/signature, cross-device, broad-incident, ambiguous, feature, and high-blast-radius requests are recorded as needing an owner decision rather than dispatched automatically.

### Receiver actions

Each invocation requires an idempotency key. Queue updates also retain the last claim, heartbeat, outcome, or synthetic-cancel key, and append an audit event.

- `poll`: one bounded read of available, owner-confirmed, privacy-minimized requests.
- `claim`: a 15-minute lease after the owner/risk/privacy checks are repeated.
- `heartbeat`: one explicit lease extension; it never starts a scheduler.
- `record_review`: stores the coordinator disposition without creating code or an agent.
- `record_outcome`: records a manually created local task reference or a sanitized retry.
- `cancel_synthetic_test`: cleanup only for a title beginning `[SYNTHETIC COORDINATOR TEST]` and only with explicit owner approval.
- `send_synthetic_test_notification`: the one separately authorized test email after the dry-run and synthetic-dashboard gates pass.
- `confirm_synthetic_test_notification`: records the owner's inbox confirmation; provider acceptance alone is not called delivery.
- `record_owner_decision`: records approve-local-only or reject for the synthetic result while a database constraint keeps `deployment_authorized = false`.

### Notification boundary

The one test notification is fixed to `admin@quotedr.io`. Its subject begins `[TEST — NO ACTION REQUIRED] QuoteDr code review notification`; its body is constructed server-side from only the synthetic case reference, synthetic title, severity, and authenticated dashboard review link. It states that no customer, code, or deployment action is required. It has no attachments and never accepts customer content from the caller.

The provider request has a stable idempotency key. A failed attempt stops closed; it cannot be retried as a second test without a new owner-reviewed flow. An accepted provider response records provider acceptance, not inbox delivery. Delivery becomes confirmed only after the owner explicitly confirms receipt.

Future real owner-review notifications are represented in the schema but are not exposed as a send action in this receiver. They remain design-only until separately approved.

### Required secrets and configuration

Set these only through Supabase Edge Function secrets or the local operating-system secret store; never put values in Git or the automation prompt:

- `QUOTEDR_COORDINATOR_TOKEN`: independently generated random secret, at least 43 characters.
- `QUOTEDR_COORDINATOR_ENABLED`: explicit receiver kill switch; set to `true` only during an approved activation window.
- `QUOTEDR_COORDINATOR_TEST_EMAIL_ENABLED`: separate one-test-email kill switch; keep false until the dry-run gates pass and disable after the single attempt.
- `QUOTEDR_COORDINATOR_ACTOR_ID`: existing allowlisted administrator user UUID used for the audited legacy claim ownership fields.
- `QUOTEDR_COORDINATOR_ACTOR_EMAIL`: matching administrator email.
- `QUOTEDR_COORDINATOR_LABEL`: stable human-readable bridge label.
- `QUOTEDR_COORDINATOR_FROM_EMAIL`: verified QuoteDr sender used only for the separately approved test notification.
- Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` remain server-only.

The local bridge receives only `QUOTEDR_COORDINATOR_ENDPOINT` and `QUOTEDR_COORDINATOR_TOKEN` from its secret environment. The paused automation contains neither value.

### Release and dry-run order

Do not run any of these steps alongside another deployment.

1. Confirm the active release has fully completed and production `main` is stable.
2. Obtain a new, explicit owner deployment instruction for this receiver release.
3. Fetch and integrate the latest `origin/main`; review that the final diff contains only the receiver migration, function, script, docs, fixture, tests, configuration, and intended local scheduler metadata.
4. Run the focused tests, TypeScript/Deno check, migration lint against a disposable/local database, and diff checks.
5. Apply only the receiver migration; verify RLS, grants, trigger constraints, indexes, and append-only audit access.
6. Set the receiver secrets without displaying them; deploy only `ai-operations-coordinator` with its custom-auth configuration.
7. Probe missing/invalid tokens and every narrow action. Confirm direct `anon` and `authenticated` table access remains denied and `ai-operations` still requires JWT.
8. Keep the heartbeat paused. Manually run the local no-data fixture lifecycle: queued -> poll -> claim -> heartbeat -> review -> recorded synthetic cleanup. Confirm no email, task, customer action, code release, or production deletion occurred.
9. Create one labeled synthetic dashboard case with blank customer identity and submit its minimized handoff. Claim and record `synthetic_dry_run_ready`.
10. Only then, under the already recorded one-email authorization, send the single test notification and ask the owner to confirm inbox receipt. Do not send a second email.
11. In the pinned Orchestrator, manually create a separate harmless local-only test artifact in a dedicated worktree, run focused validation, commit locally, and show its diff/commit evidence.
12. Record the owner's approve/reject decision with deployment explicitly false. Leave the immutable synthetic audit record and close the test. Do not push, merge, or deploy the test artifact.

Until steps 1-7 receive release authorization and succeed, the receiver, scheduler, real inbox dry run, test email, and synthetic local-code result all remain inactive.
