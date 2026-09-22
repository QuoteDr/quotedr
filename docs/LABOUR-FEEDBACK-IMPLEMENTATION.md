# Labour feedback loop — implementation status

## Local first slice (2026-09-20)

Labour Tracker now includes Daily Work Check-in using existing `labor_daily_checkins` storage. A record links a quote UUID plus a room/item snapshot, room ID and item index. This is historical evidence, not a mutable positional link: deleted/reordered/split items are not automatically relinked. Drafts require approval. Rework, extra scope and waiting are excluded from rate suggestions. Original labour settings are snapshotted; labour-hours and elapsed crew duration remain distinct. Suggestions are weighted completed quantity / labour-hours, grouped by category/name/unit, and never overwrite saved items. The user may manually adopt a reviewed rate in Manage Line Items. Existing Timeline Report consumes saved labour settings on subsequent item use.

Uses current-user RLS and client queries, no service credentials. Read-before-insert with a fixed UUID avoids duplicate inserts on uncertain retry within the open form. After uncertain submission the pending payload is frozen; retry checks the same UUID. This first slice does not promise recovery after closing the tab. Review uses an updated_at condition. Only v2 approved normal-work records contribute; legacy endpoint-derived rates are not used. Up to 500 recent logs are loaded; tracker comparison uses loaded approved sessions, currently last 90 days, and is informational, not payroll reconciliation.

## Remaining work before calling the full plan complete

- SMS was replaced by opt-in web push at the owner's request. Reminder UI, quiet hours and shared daily delivery claims are implemented locally; see LABOUR-PUSH-SETUP.md for configuration and runtime verification. Nothing activated or sent.
- AI/voice parsing into editable proposed task allocations with explicit handling for ambiguous room/item matches. Current form is manual.
- Persisted uncertain-submission recovery and long-term paginated history.
- Stable quote-item identities across split/combine; review queue for deleted or changed items.
- One-click, version-checked adoption of rate suggestions with saved-item before/after audit and undo. Current adoption is manual.
- Schedule dependency/wait-time modelling and better crew-aware GPS reconciliation.
- Audit/replace legacy `labor-checkin-submit` learning: it currently aggregates all submitted records before review, uses service-role foreign references and non-atomic aggregate updates. New web form intentionally bypasses it; do not advertise the older endpoint as review-first.

## Verification and release gates

Pure calculation and validation regressions are in tests/labor-worklog.test.cjs. Before deployment: verify existing table grants/RLS and schema in a disposable database; exercise insert/retry/conflict and two-user isolation with authenticated test accounts. Test the web form on phone, refresh/review/reject and the existing timeline workflow. No live queries, customer edits, SMS, function deployment, migrations or native changes performed in this slice.
