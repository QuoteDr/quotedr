# AI Operations Dashboard

`ai-operations.html` is an administrator-only support-to-product workspace. Open it from **Settings → Administrator → AI Operations**.

## Workflow

1. Create a support intake and review the prepared safe response.
2. If the case is a likely bug and includes a possible solution, the database trigger creates an engineering work item and release follow-up automatically.
3. Record the human-sent immediate response. Sensitive cases without a safe workaround require an owner account.
4. Move engineering through implementation and evidence-backed verification.
5. Verification creates a pending deployment approval. Owner approval only records permission; the dashboard cannot deploy.
6. After an approved release is deployed elsewhere, record its release reference and verification evidence.
7. Review the customer follow-up. Any live-fix wording requires the verified deployment record and owner approval. The dashboard never sends it.
8. Optionally recommend goodwill. Owner approval is recorded, but the dashboard has no credit-grant action.

Sensitive billing, payment, data-loss, privacy, access, legal/signature, cross-device, and broad-incident cases keep the existing human-review boundary.

## Backend

- Migration: `supabase/migrations/20260808152738_ai_operations_dashboard.sql`
- Edge Function: `supabase/functions/ai-operations/index.ts`
- Function configuration: `[functions.ai-operations]` with `verify_jwt = true`

All six operations tables have RLS enabled and direct `public`, `anon`, and `authenticated` access revoked. The Edge Function verifies a coordinator allowlist for every action and a separate owner allowlist for deployment, live-fix wording, and goodwill decisions.

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
