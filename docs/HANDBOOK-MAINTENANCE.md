# QDR handbook release contract

The single editable product catalogue is `qdr-handbook.json`. Both the public `handbook.html` and the assistant use it. Search code is `handbook-search.mjs`; the Edge Function loads the published JSON with a short cache and falls back to its bundled copy on errors. It never fetches arbitrary URLs or accesses customer records.

For every user-facing feature, changed label, limitation, save/recovery behaviour, platform restriction or permissions change:

1. Review affected articles against the final integrated code, not an old branch. Keep stable article IDs. Update exact steps, prerequisites, limitations, source file paths, verifiedAt and release. Bump handbook version.
2. Do not document pending features as live. Publish handbook and feature together; coordinate backend changes separately. Record review against source, and distinguish it from authenticated runtime verification.
3. Add realistic retrieval questions to `tests/handbook-search.test.mjs`, including synonyms, follow-ups and failure cases. Update `tests/assistant-release-scenarios.md` for conversational answer checks. Retrieval passing does not prove an AI answer is correct.
4. Run `npm run test:handbook` and `npm run check:handbook -- <pre-release-origin-main-SHA>`. For the initial handbook introduction, schema/retrieval checks apply; subsequent releases compare against the exact fetched base.
5. If there is genuinely no handbook impact, record `docs/handbook-no-impact.json` with the exact base commit in `base`, every affected product path in `files`, and a specific `reason`. Do not rubber-stamp exemptions.
6. After deployment, verify the published handbook version, public source links and updated backend retrieval. Run authenticated conversational checks for changed workflows without touching customer data. Report any unperformed checks explicitly.

No system can guarantee perfect answers. The assistant must distinguish missing evidence from a missing feature, protect recovery data, and ask for clarification. Keep sources public/product-only: no credentials, account records or private screenshots.

The release gate is a local command, not a claim that hosting automatically enforces it. Add it to release workflows and CI where appropriate.
