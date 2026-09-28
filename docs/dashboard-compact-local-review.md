# Compact dashboard — local review

Built from origin/main `2e5699d` on branch `codex/dashboard-compact-themes`. No push, merge or deployment.

## Open locally

Run `node scripts/dashboard-local-preview.cjs` from this checkout.

- http://127.0.0.1:8876/preview — synthetic examples; document action buttons only record a demo action. Search, compact menus, selection, appearance and disclosure work. Board/client controls are labelled demonstrations in this page.
- http://127.0.0.1:8876/dashboard.html — actual application. Sign in to test your own account. The frontend is local, but this page still uses the existing live backend; changes made here are real.

Appearance: Recent Quotes → Options → Appearance. QDR Light, Command Center, Graphite, Soft Blue and Follow system. Preference is stored per authenticated user in this browser only, not synced across devices. Client-facing document themes are untouched.

## Feature inventory

| Existing feature | New location / behaviour |
| --- | --- |
| Quote title, client/number/date, last opened, change-order number | Compact card heading |
| Open document / portal edit-lock flow | Existing title click plus keyboard-accessible Open action in ••• |
| Rename, save/cancel inline title editor | ••• → Rename document; existing inline editor preserved |
| Total, all document statuses, status editing and invalid-state disabling | Card summary; handlers unchanged |
| Portal membership, added timestamp, edit-lock explanation | Always-visible In portal chip/edge; full details under Details & activity |
| Portal sharing / copy link | Primary card action, or ••• when client-note review is primary |
| Client notes | Primary Review Client Notes action when in review |
| Client upgrades, pending change orders, invalidity | Visible summary plus expandable original notice |
| Received payment, shortfall/continuation status, payment evidence, amount correction, accept/reject payment report, deposit decision | Visible notice summary and original expandable controls; calculations unchanged |
| Google review request, request date, reminder and dismiss | Details and •••; original conditions unchanged |
| Create change order, invalidate/restore invoice, private profit report, client view, portal follow-up | ••• with original handlers and permission attributes |
| Single-document Junk | ••• → Move to Junk; original confirmation retained |
| Select visible, clear selection, bulk Junk, busy states | Select mode or checking any card; original selection logic retained |
| New quote, refresh | Section header; duplicate refresh removed |
| Full JSON export, folder connection/change, Back Up Now, disconnect, restore help | Options → Backup & export; existing controls moved, not recreated |
| Backup permission/failure/verification status | Always visible below section header, also inside backup menu; original status publisher updates both |
| Portals, Junk count, Jobs, Labour | Options; existing main navigation also preserved |
| List, Board, Clients, client filter badge, board reorder | Existing view controls preserved |
| Default view | Options; existing default preference handler retained |
| Search and status filtering | Existing search/filter; added missing Viewed, In Review and CO statuses |
| Stats, storage, labour reminders, alerts, sync/recovery, save incidents, help/settings/sign-out | Preserved; statistics made more compact |

## Verification

- Browser tests at 1440, 768, 390 and 320 pixels with synthetic draft, invoice, upgraded, in-review, invalid, paid, change-order and sent documents.
- Every original rendered card onclick/onchange action survives DOM rearrangement. Payment detail controls remain reachable; menu action dispatch and card re-render checked.
- All four palettes, account-separated persistence, selection reveal, options/export access, and horizontal overflow checked.
- 31 of 32 existing dashboard/backup tests pass. `dashboard-portal-client-viewer-copy-static.test.js` fails its pre-existing “Total opens” label assertion on unchanged HEAD too. No production logic was changed to mask this baseline failure.
- Public artifact checks pass; new JS/CSS explicitly allowlisted. Preview and test files stay outside the public artifact.
- `npm run build` passes, including handbook checks.

Before approving a release, use your normal local authenticated walkthrough for real portal flows, board/client modes, backup folder permission, and account roles. Synthetic tests do not claim a real financial/email/backup operation was performed.
