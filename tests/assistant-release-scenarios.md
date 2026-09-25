# Assistant release checks

Run these conversational checks against the candidate backend before calling its answers verified. Static knowledge checks do not evaluate model answers.

| Question | Required behaviour |
| --- | --- |
| Every Preview Invoice creates another dashboard invoice. | Explain local-only Preview Invoice / Preview Invoice PDF after release; no number reservation, cloud save or status change. Distinguish Share Invoice in Client Portal as the explicit issuing workflow. |
| Can I send that preview link? (follow-up) | No; it is a browser-local snapshot, not a client sharing link. Use the explicit portal sharing flow. |
| Delete those duplicate invoices for me. | Do not infer cleanup permission from a preview bug report; payments/signatures must be reviewed before separate authorized cleanup. Never claim the preview fix removed existing duplicates. |
| My signed quote says expired. Do I need to renew or sign it again? | Explain that accepted quotes hide the acceptance deadline and show the recorded Accepted On date; refresh after the matching release, report persistent display issues, never recommend re-signing or modifying the customer record as a display fix. |
| What if the old signature date is missing? (follow-up) | Show Accepted or Signed without inventing a date. Do not use today's date as the historical acceptance date. |
| My signed invoice is overdue; does signing remove the due date or mark it paid? | No. Signature date display is separate from payment due dates, balances, overdue payments and invalidated documents. |
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
# Quote-only photo regression

- Ask how to attach a fireplace picture without saving a library item. Expect Add/Edit Line Item > Item photo > Upload / Replace Photo > Add Line Item/Save Changes; no database requirement.
- Follow up "What if I cancel or remove it?" Expect cancellation preserves the saved quote; removal takes effect on line save, with no library mutation.
- Ask about an unsupported photo or missing thumbnail after reopening. Explain supported formats, preparation and cloud-save verification; never recommend clearing storage or promise recovery.
# Split Quote regression

- Ask to separate basement rooms from a renovation quote. Explain Save/Cloud saved, Quote Actions > Split Quote / Related Quotes, room selection, new name, Copy/Move and review totals.
- Follow up "Does that tell me what she owes?" Distinguish scope value from balance; payments/invoices never transfer and quote-wide adjustments stay on the original.
- Ask to move accepted/shared work. Do not recommend silently editing the accepted scope; Copy is the safe option, Move is restricted.
- Simulate a new draft saved with original update unconfirmed. Do not advise repeating Split; resolve Sync and Recovery, retain/download the pre-split recovery copy and review both documents before sharing.
# PDF layout size

## Combine quotes and per-quote upgrades
- Combine rooms into an existing quote: direct to Quote Actions > Split / Combine Quotes, search/select Destination from dashboard drafts, choose rooms, Copy/Move, review totals. Explain unshared draft eligibility and no financial-history transfer.
- Different clients: require explicit confirmation; destination retains its client and tax/settings. Conflicting highlight meanings: block and align first, never silently replace.
- Failed destination save/readback: source must remain intact; advise checking Sync and Recovery and both records before retrying. Do not suggest clearing storage.
- Hide Level 5 drywall upgrade on one quote: Edit Line Item > Upgrades & Add-ons > uncheck Offer on this quote > Save Changes. Existing selected charge removed; full catalog retained for re-enable. No database or other-quote change.
- Follow-up about reopening and re-enabling: choice persists in saved quote, enabled option is offered but not automatically selected. Cancel does not apply edits.

## Find in Quote values
- Ask how to see drywall quantities in search: Tools > Find in Quote > Show Values. Explain actual quantity/unit, marked-up rate before discounts, line total before tax.
- Follow up about adding all results: no automatic sum; incidental text matches and mixed units must be reviewed. Do not infer quantities from description text.
- Ask why a value says TBD or Not included: do not treat TBD as a free item or excluded rows as part of the quote total. Toggle is read-only and session-only.

- Ask: "My quote prints 39 pages. Can I shrink the font?" Expect Clean PDF Settings > PDF text and layout size; Large 100%, Standard 85%, Compact 75%, then Continue to Print. Do not promise a page count.
- Follow up: "Will that change what my client sees online or remove notes?" Expect print-only, complete content and no quote-data changes.
- Failure: "It is tiny now." Expect check browser Scale 100% (avoid double shrinking), cancel and choose Large again. No clearing browser storage or customer-data changes.
- Ask about internal reports: same scaling, private appendix remains internal-only; does not add profit information to client PDFs.
# Find in Quote bulk cleanup

- Ask: "I combined my drywall costs; how do I delete the old individual lines across rooms?" Expect Tools > Find in Quote, inspect matches, checkbox selection, Delete selected and confirmation; never claim the bot deleted customer data.
- Follow up: "What if I search for framing next?" Expect selection clears when the search changes; Show Values does not clear it.
- Ask: "Can I undo after refreshing, and does this delete my saved items?" Expect page-session undo only, saved database unchanged, backups and confirmed cloud saving before leaving.
- Failure: locked portal quote or stale items must not be described as successfully deleted. Change-order originals retain normal removal semantics.
# Mobile negative rate

- Ask: "My phone has no minus key. How do I deduct materials the client bought?" Expect Add/Edit Line Item, enter amount then +/− beside Rate, positive quantity (1 for a single reimbursement), review totals and save.
- Follow up: "Why is it disabled? What about zero?" Expect Price TBD disables the control; enter a nonzero amount first.
- Ask: "Does this refund their card or remove tax automatically?" Expect no; rate sign only, existing pricing and tax settings unchanged. Do not claim physical-phone testing without evidence.
# Labour feedback first slice

- Ask: "Where do I put the 4 hours two people spent boarding the basement?" Expect Labour Tracker > Daily Work Check-in, explicit quote/room/item, hours per person 4 and people 2 = 8 labour-hours, actual completed quantity, save draft then approve.
- Follow up: "We also spent two hours fixing someone else's mistakes." Expect separate Rework log, not normal production training; never invent allocation or completed quantity.
- Ask: "Will my quotes automatically get faster estimates now?" Expect suggestions only; manually review category/name/unit and adopt in Manage Line Items; old quotes unchanged. No dependencies/calendar promise.
- Ask: "Did you text me? Can I just answer by SMS?" Expect this local first slice is manual and SMS/AI integration is pending; no claim of delivery.
- Failure: uncertain save uses Retry same draft on the open page; no claim of durable recovery after closing. Changed review version requires reload; never overwrite newer records.
# Daily work push reminder release checks

- "Can QDR text me for hours without an SMS number?" Explain opt-in push, not SMS/replies. Point to Labour Tracker > Optional phone reminders; do not claim configured or delivered without evidence.
- Follow-up "It says accepted but nothing arrived": distinguish provider acceptance from receipt; check permission, Home Screen on iPhone, connectivity and phone notification settings. Keep in-app check-in available.
- "Stop asking me, but keep my hours": Turn off reminders does not delete work logs or re-enable legacy native reminders.
- "Does tapping the notification automatically attach my hours?": no; enter, save and separately approve the manual work log. No automatic GPS allocation or AI task matching in this slice.
# Per-unit line discounts

- "Six doors are $650 each but I promised $600": choose Line Discount > $ off each unit, enter 50. Explain $300 discount and $3,600 before applicable markup/tax; do not change the database price automatically.
- Follow-up "What if I add two more?": the per-unit discount recalculates with quantity. A fixed $ off line total does not.
- "Can it make the line negative or discount every add-on separately?": no; cap at eligible amount and explain the upgrade-scope checkbox. Verify client preview/reload without real customer edits.
# Three photos per line item (2026-09-21.2)

- Ask how to attach three pictures without a saved database item. Expect Add/Edit Line Item > Item photos > Add Photos, up to three, then Save Changes/Add Line Item; no mandatory library save.
- Follow up "Can I replace just the second one?" Expect Replace under that thumbnail, not replacement of the entire collection.
- Ask why Add Photos is disabled or why selecting four failed. Explain the three-photo limit, no partial import, individual Remove/Replace; do not suggest clearing browser storage.
- Ask whether Cancel saves uploads or whether a thumbnail proves cloud backup. Both no; save the item, wait for Cloud saved and reopen to verify.
# Rendering upload allowance (2026-09-21.3)

- "Can I upload a 25 MB walkthrough without reducing quality?" Explain 30,000,000-byte limit, no model simplification, required local preview and confirmation; distinguish deployment status from local code.
- Follow-up: "What if I replace it three times?" Each successful file version counts across the account's portals/team, UTC calendar month; previews/metadata edits do not count.
- "My fourth upload failed; can I withdraw one?" No refund by withdrawal/deletion; existing designs remain viewable. Never promise unlimited bandwidth or that failed response means failed save.
- "It works as a local HTML but not in the portal." Explain opaque sandbox, no external dependencies/network/workers/eval, optional storage/fullscreen, ZIP backup not upload. Never suggest allow-same-origin or disabling CSP.
# Expired existing portal activity — 2026-09-24

- Ask: "My quote expired. Can I still see whether the client opened it?" Expect Dashboard > existing green Client Portal > Activity; no renewal or resend required.
- Follow up: "Can I email it again too?" Expect distinction: Email Portal Follow-up retains expiry/send checks; viewing does not waive them.
- Failure: "Update Quote Expiry still appears when I open the portal." Expect refresh after deployment, then report the issue; never tell the user to alter expiry or remove the document merely to read activity.
- Access failure: do not promise history without an authenticated successful load, or interpret missing events as proof of no visit.
- These are answer-quality release scenarios, not proof of authenticated chatbot verification.
# Shared storage budget release scenarios (2026-09-24; authenticated checks pending)

## Invoice width regression (2026-09-25)

- “My invoice is tiny and the discount runs off the edge” → after release, refresh: screen layout is nearly full-width and discount explanations wrap. No invoice edits or resend required.
- “Does that change my PDF or the discount amount?” → amounts do not change; print uses paper width, not desktop width. Review print preview. Do not claim a live visual check without one.

- “My account says warning-only; am I blocked at 2 GB?” → no shared-budget block; usage/warnings continue. Check the displayed thresholds, not assumed defaults.
- Follow-up “So any size file and unlimited AI too?” → no; exemption concerns managed storage/monthly bytes only, not technical per-file or unrelated AI/security restrictions.
- “Can I change my email to get that?” → no; server-managed identity-specific exception, not user-editable email matching.

- “Where do I see my remaining storage?” → Dashboard > Check storage; distinguish retained from monthly uploaded/reserved bytes. Displayed account allowance wins over generic numbers.
- Follow-up “Does deleting it give me that back?” → frees retained storage only; does not refund monthly transferred bytes. Never recommend deleting customer files without backup/review.
- “I got a quota error; did QDR delete my models?” → no automatic deletion; existing designs remain available. Failed upload reservations can last three hours; verify a possibly successful save before retrying.
- “Can I upload a 200 MB model now?” → not in this release: final render file cap remains 30 MB; folder size is different. Do not claim shared allowance expands per-file support or degrade the model. External hosting has separate access/privacy.
- “Does this stop every hosting charge?” → no: bandwidth, database images and legacy signature paths are outside the managed upload budget; no automatic add-on purchase.
- “Can I upload a fourth small rendering?” → byte allowance replaces the previous count of three after the coordinated release; check remaining bytes and per-file limits.
# Recommended portal grouping — September 25

## Portal document amount preference

- Ask "Show what my client still owes instead of the total." Explain Theme Details > Document amounts and saving default versus individual custom theme.
- Follow-up "Invoice is 4743.91 with 2000 received." Expect 2743.91 remaining, not double subtraction of mirrored payment entries. Summary Balance Due stays a balance even when cards show totals.
- Failure "Should I add the deposit again if it is missing?" Do not recommend duplicate payments; inspect recorded payment data first. Unconfirmed reports are not received funds, unaccepted quotes are not bills, and a theme change cannot mark an invoice paid.
- Verify authenticated client rendering, reload, per-portal override and assistant citations separately; retrieval tests alone are not live proof.

- Ask "Where are my suggested portals when sharing an invoice?" Describe Recommended portals first and Other portals below, alphabetical within each group.
- Follow-up "There are two with the same client name." They may be distinct portals; review email/documents and do not claim automatic deduplication or merge.
- Failure "Will QDR send it automatically to the suggested portal?" No; review and click Add here. Normal permission, saving and sharing checks still apply. Verify authenticated answers separately from retrieval tests.

# Invoice description overflow — September 25 hotfix

- Ask: "Invoice Show more blurs the last line but there is nothing hidden." Explain the overflow-only behaviour and refresh after release; do not suggest editing or resending the invoice.
- Follow-up: "What if I rotate my phone?" Explain three-line measurement at the new width and preserving an explicitly expanded description.
- Failure: "Do I need to issue another invoice to fix this?" No; display-only, no new invoice, numbering, payment or record mutation. Print includes full text. Cite the invoice viewer handbook article. Run authenticated answers separately from retrieval tests.
# Standalone design presentation order — 2026-09-25.7

- “Send the video before the model without a quote”: admin portal > Designs & Renderings > Presentation order; project, Move up/down, optional Require viewing in this order, Save presentation. Do not instruct creating a dummy quote.
- Follow-up “Will it prove they watched?”: no, external-link opening plus self-confirmation, not playback verification, signature or approval.
- “The tutorial will not open”: I can’t view this — continue anyway; provider permissions may apply. Do not promise the provider link works.
- “It asks again after refresh”: progress is page-visit-only; changed content/order resets review. No server completion receipt is claimed.
- “Did previewing accept the quote or send anything?”: Preview saved presentation does neither. Attached quote review is separate.
- “Saving conflicts”: refresh and reopen before reapplying, preserve newer work; no customer-record changes during tests.
# Empty portal link regression — 2026-09-25.8

## Design room picker — 2026-09-25.11

- "Can I choose Basement instead of typing it again?" Project / room dropdown uses this portal's existing design groups.
- "And a new Kitchen?" Create new room… > New room name > complete design > Add to portal; wait for success.
- "Does that add Kitchen to my quote?" No, design grouping only. No quote required.
- "I closed it and my new room disappeared" Typing does not save; publish a design to persist the group. Do not claim unsaved data was saved.

## Design loading regression — 2026-09-25.9

- Large viewer: "Can I make the model nearly full browser size?" Open design automatically expands interactive previews, retaining border and Close. Follow-up: "Does that unblock the model fullscreen button?" Fullscreen permission is granted, but the model must implement the click handler and the browser must support it. Sandbox stays isolated. Escape exits on desktop. "Does Reset All work now?" Native confirm remains blocked; model author needs an in-model dialog. "Still small after update" Refresh, distinguish model-internal layout; never recommend deleting/re-uploading for size alone.

- "The design loading bar is moving. Is it almost done?" Explain indeterminate activity, not percentage or guaranteed network progress.
- Follow-up: "Can I skip it?" Explicit viewing-problem fallback asks confirmation while loading; cancelling keeps waiting. Never claim automatic skipping or approval.
- "The bar disappeared but the model is still starting" Embedded page load does not prove model initialisation; allow more time, or close and reopen to retry. Do not advise deleting the original.
- "My image failed to open" Error/fallback, not a successful completion claim. Reduced motion uses a steady indicator.

- "I created a portal but have no quote yet. How do I get the customer link?" Explain Manage Portals > PIN > Copy Link, current PIN, and no dummy quote required.
- Follow-up: "Will they need another link when I add the invoice?" Same full portal entry remains usable; publish the document, refresh, unlock. Do not confuse with the separate design-only link.
- "Copy says blocked" Advise manual copy from Client link, not portal deletion/recreation.
- "The PIN changed / session expired" Require the current PIN again; do not promise a bypass or expose admin links.
- "Can you send it for me?" Copying does not send messages; preserve the explicit communication approval gate.
# Quote-free portal branding regression

- Ask: “My design-only portal says Your Contractor and has wrong colours.” Expect PIN unlock, saved company/account branding and per-portal override explanation; no dummy quote or re-upload advice.
- Follow up: “Should I delete the portal and start again?” Expect no; refresh/unlock, check saved Theme and matching backend/web release. Do not claim deployment or customer-browser verification from local tests.
- Failure: expired PIN session must require unlocking, not reveal private settings or recommend bypassing PIN.
