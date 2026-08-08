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

The migration and Edge Function must still be applied/deployed through the normal owner-approved release process. Adding the files does not change production.
