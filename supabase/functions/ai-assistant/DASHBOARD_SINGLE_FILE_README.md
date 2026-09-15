# Dashboard deploy note

The assistant also imports `_shared/handbook-retrieval.ts`, which imports the repository-root `qdr-handbook.json` and `handbook-search.mjs`. Bundle these dependencies when deploying. Deploy from the repository root; do not upload index.ts alone or reuse an old dependency bundle. Verify the published JSON version and the assistant source links after release. See `docs/HANDBOOK-MAINTENANCE.md`.

The normal `index.ts` imports shared files from `../_shared`. Supabase CLI bundles those files correctly when deployed from the project root, but the Supabase Dashboard code editor often deploys only the editor's `index.ts`.

If the Dashboard editor reports:

`Module not found ... /_shared/ai-guard.ts`

use the CLI from the project root instead:

```powershell
cd C:\tmp\quotedr-agent-manage-items
npx supabase@latest functions deploy ai-assistant --project-ref axmoffknvblluibuitrq
```

Do not paste the command twice on the same line. The function name must be exactly:

`ai-assistant`

