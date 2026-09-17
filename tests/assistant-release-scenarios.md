# Assistant release checks

Run these conversational checks against the candidate backend before calling its answers verified. Static knowledge checks do not evaluate model answers.

| Question | Required behaviour |
| --- | --- |
| I want to highlight a bunch of line items at once, can I do that? | Yes; checkboxes within a room, Edit > Highlight Selected, choose colour, Apply. |
| Can I do all of them? (following highlighting) | Explain room Select All Items, not whole-quote selection. |
| My payment failed | Ask a diagnostic question; do not give generic Stripe setup as the answer. |
| It says syncing. Can I clear browser storage? | Warn against clearing; preserve unsynced local recovery first. |
| Does folder connected mean my file saved? | Distinguish remembered connection from verified backup. |
| Does Export All include my unsaved edits and photos? | No; explain limits and separate local copy. |
| How do I create Materials without an item? | Manage Items > Add Category; no dummy item required. |
| Can you send this quote for me? | Explain inability to perform actions, offer documented instructions. |
| I cleared my last yellow highlight. Is its explanation gone? | No, meanings are retained; clearing shared wording requires explicit confirmation. |
| How do I shorten job notes for clients? | Job note preview length in Send Quote Settings; 0 means full text, Show more exposes the full note. |
| Can QDR do an undocumented workflow? | Admit uncertainty and ask context, never infer nonexistence. |

For each feature release, update the shared guide and add a scenario here. Keep UI labels verified against source. Include backup limitations and safety warnings in relevant answers. No customer data is needed for these checks.
# Expiry regression

Ask whether an expired quote can be sent, whether six versus seven days warns, whether drafting consumes automatic validity, and whether resending silently renews it. Follow up with "make that my default" and ask about an old fixed-date quote. Require exact settings, explicit renewal, cloud-save precautions, and no claim that old links are recalled.

# PDF export regression

Ask "Can I export a copy for my records with margins?", then "Will my client see those costs?" Require File > Export as PDF > My records (internal) > Include profit report, entitlement requirement, and client-safe defaults. Ask "Is that my net profit?" and require before labour and overhead, not net profit. Ask "It expired before printing" and require restarting from the builder, not sharing a private URL. Ask "Can I restore my quote from that PDF?" and distinguish a readable record from a JSON/folder recovery backup. Verify authenticated responses after release; retrieval tests alone are not answer-quality verification.
# Deposit review release cases (2026-09-16.2)

- "Can it ask whether I want a down payment for each job?" Explain Settings > Payments > Ask me for each quote; distinguish deposits from card payments.
- Follow-up: "What about resending?" Explain the saved quote choice, unchanged already-shared terms, and a fresh review for Dashboard revisions.
- "I pressed Cancel and nothing sent." Correct: review cancellation blocks sharing and applies no choice. Do not claim a payment was taken or a message sent.
- "Do I need Stripe for this?" No for manual payment methods; do not imply card processing works without Stripe.
- "Does saving my default 50% answer it for every quote?" No; defaults are suggestions, and cloud-save success is separate from choosing in the dialog.
# PDF card review regression (2026-09-16.3)

- "Why am I asked about Stripe when exporting a PDF for myself?" Explain the corrected PDF path skips Card Payment Review for both audiences. Do not tell the user to turn off their account payment prompts.
- Follow-up: "Will it still ask when I share the interactive quote?" Yes, the configured sharing review remains. Export does not mark an unanswered choice reviewed or change it to No card payment.
# Keyboard-first dialogs (2026-09-16.4)

- Ask: "Can I start typing immediately in New Quote?" Expect Client Name autofocus, Enter activates Create & Open Builder, normal validation/save requirements remain.
- Follow up: "Why does Enter do nothing with suggestions showing?" Expect choose a suggestion with Tab/Enter or move to another field, not a claim that Enter is broken.
- Failure/safety: "Will Enter send a quote or delete it? What about notes?" Expect no new blanket confirmation for sensitive actions; notes retain newlines.
- Runtime: test New Quote open/reopen, invalid blank submission, delayed opening, suggestions, Add Room, Add/Edit Item, shared prompts and nested dialogs. Do not use real customer records. These checks are not implied by retrieval tests.
# Highlight cloud round-trip (2026-09-16.4)

- Ask: "I switched quotes and my yellow and orange explanations vanished." Explain the cloud payload omission and the fix; colours and explanations are separate fields.
- Follow up: "Will updating bring my missing text back?" No automatic reconstruction; compare the same quote's versioned backup and re-enter only recovered wording. Never overwrite newer work wholesale or clear storage.
- Verify on a disposable quote: Apply Highlight, cloud save, switch to a quote with different explanations, return, reload. Also verify intentional clearing and legend-only display. Do not edit customer records for this check.
# Guided description release checks (2026-09-17)

- Ask how to turn "I built a deck" into a description with follow-up questions. Expect AI Refine > optional Guided mode > Describe the task, individual answers and Skip, not automatic scope additions.
- Follow up "Can I ignore railings and finish now?" Expect Generate with what I have; skipping leaves railings unspecified, not excluded or included.
- Ask whether Cancel saves the interview. Expect temporary answers discarded and original description unchanged, not a cloud-save promise.
- Ask about a question timeout. Expect retry or generate from retained answers while dialog stays open; no claim that AI always finds every missing detail.
- Authenticated runtime: test multiple rounds, skip and undo, no useful questions, failed request, Keep Original, manual edits while generation runs, and Use Description. Never use real customer records for these checks. These checks require the matching Edge Function deployment; retrieval tests alone are insufficient.
# Highlight colour display checks (2026-09-17)

- Ask whether Apply to all updates older orange highlights in other rooms. Expect yes, including custom exceptions; other colours and other quotes remain unchanged.
- Follow up: "Can just one item show the wording?" Expect Customize for this item / selection; keep the colour default unchanged.
- Verify cancel confirmation leaves data unchanged, new highlights inherit legend-only, and quote A/B/A reopening preserves separate defaults. Wait for cloud-save confirmation; never promise a dialog alone saved the quote.
