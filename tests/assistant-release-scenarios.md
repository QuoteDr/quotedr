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
