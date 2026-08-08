# AI Operations Dashboard

`ai-operations.html` is an administrator-only support-to-product workspace. Open it from **Settings → Administrator → AI Operations**.

## Workflow

1. Create a support intake and review the prepared safe response.
2. If the case is a likely bug and includes a possible solution, the database trigger creates an engineering work item and release follow-up automatically.
3. Record the human-sent immediate response. Sensitive cases without a safe workaround require an owner account.
4. Select **Send to engineering coordinator** to review a structured, privacy-minimized brief. QuoteDr records the manual handoff and makes the brief copyable, but it has no live Codex integration and does not launch an agent.
5. Paste the copied brief into the approved coordinator task, then move engineering through implementation and evidence-backed verification.
6. Verification creates a pending deployment approval. Owner approval only records permission; the dashboard cannot deploy.
7. After an approved release is deployed elsewhere, record its release reference and verification evidence.
8. Review the customer follow-up. Any live-fix wording requires the verified deployment record and owner approval. The dashboard never sends it.
9. Optionally recommend goodwill. Owner approval is recorded, but the dashboard has no credit-grant action.

Sensitive billing, payment, data-loss, privacy, access, legal/signature, cross-device, and broad-incident cases keep the existing human-review boundary.

## Backend

- Base migration: `supabase/migrations/20260808152738_ai_operations_dashboard.sql`
- Coordinator handoff migration: `supabase/migrations/20260808161014_ai_operations_coordinator_handoff.sql`
- Edge Function: `supabase/functions/ai-operations/index.ts`
- Function configuration: `[functions.ai-operations]` with `verify_jwt = true`

All six operations tables have RLS enabled and direct `public`, `anon`, and `authenticated` access revoked. The Edge Function verifies a coordinator allowlist for every action and a separate owner allowlist for deployment, live-fix wording, customer follow-up, and goodwill decisions. The handoff state lives on the engineering work item; a database trigger creates an immutable event snapshot whenever its handoff count advances.

The generated brief includes the case summary, controlled classification, current safe workaround and response, product impact, proposed solution, evidence notes, escalation flags, requested outcome, and explicit safety boundaries. Customer email is deliberately omitted. Recording the handoff does not deliver the brief externally, launch an agent, push, merge, deploy, message a customer, or grant credit.

## Local UI preview

Serve the repository locally and open:

```text
http://127.0.0.1:8765/ai-operations.html?demo=1
```

Demo mode only activates on `localhost` or `127.0.0.1`; it uses in-memory sample data and never calls Supabase.

## Verification

```powershell
node tests\ai-operations-core.test.js
node tests\ai-operations-static.test.js
deno check supabase\functions\ai-operations\index.ts
```

The migration and Edge Function must still be applied/deployed through the normal owner-approved release process. Adding the files does not change production.
