# Play For a Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-time Pro feature trial with feature-specific 24-hour Play For a Day access, grace access, status visibility, smart prompts, and updated follow-up email copy.

**Architecture:** Keep all shared entitlement logic in `supabase-v2.js` so feature files continue calling `requireProFeature`. Update the Edge Function to understand both old `used_at` rows and new `started_at`/`expires_at` rows. Add only small trigger calls in feature-specific files.

**Tech Stack:** Plain JavaScript, Bootstrap modals, Supabase `user_data`, Supabase Edge Function TypeScript, Resend.

---

### Task 1: Replace Trial Entitlement Logic

**Files:**
- Modify: `supabase-v2.js`

- [ ] Add Play For a Day constants and helpers near the existing Pro trial helpers.
- [ ] Replace modal copy from "Try once" to "Start 24-Hour Trial".
- [ ] Replace `markProTrialUsed` with 24-hour entitlement fields while preserving old fields for compatibility.
- [ ] Update `requireProFeature` so unexpired access passes, grace access passes with a warning, expired access locks, and new users see the start modal.
- [ ] Keep `markProTrialUsed` as a compatibility wrapper around the new activation helper.
- [ ] Verify with `node --check supabase-v2.js`.

### Task 2: Add Trial Status Widget and Smart Prompts

**Files:**
- Modify: `supabase-v2.js`
- Modify: `quote-storage.js`
- Modify: `quote-items.js`
- Modify: `pricing.html`

- [ ] Add a shared widget renderer in `supabase-v2.js` that shows the soonest active/grace trial and opens a modal listing all active/grace trials.
- [ ] Add prompt guardrails in `supabase-v2.js`: one smart prompt per session, once per trigger per activation.
- [ ] Trigger "2 hours remaining" and grace prompts from the widget refresh loop.
- [ ] Trigger "AI made this easier" after successful AI Refine.
- [ ] Trigger "second quote" after cloud quote save when the user has at least two saved quotes.
- [ ] Trigger pricing page nudge on load when there is an active/grace trial.
- [ ] Verify with `node --check supabase-v2.js quote-storage.js quote-items.js`.

### Task 3: Update Follow-Up Email

**Files:**
- Modify: `supabase/functions/pro-trial-followup/index.ts`

- [ ] Extend `TrialEntry` for `started_at`, `expires_at`, `source`, and `activations`.
- [ ] Treat entries with `followup_due_at` as due whether they came from old or new trial data.
- [ ] Update subject/body copy to "Play For a Day".
- [ ] Preserve feedback ask to `support@quotedr.io`.
- [ ] Deploy `pro-trial-followup`.

### Task 4: Verify and Commit

**Files:**
- Stage only files changed for this feature.

- [ ] Run syntax checks.
- [ ] Run focused diffs to confirm no unrelated files are staged.
- [ ] Commit the implementation.
- [ ] Push `main`.
