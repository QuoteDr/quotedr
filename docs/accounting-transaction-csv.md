# Accounting Transaction CSV

QuoteDr account owners can open **Settings → Pricing & Data → Export Your Data → Export Accounting Transactions (CSV)** to create a read-only CSV for manual accounting import or reconciliation.

This export is not a native accounting integration and does not claim compatibility with Xero, QuickBooks, or another vendor's import schema. Map and review the columns in the destination accounting system before importing.

## Selection and eligibility

- The default date window is the current calendar year. Owners can choose another inclusive range or select all dates.
- The owner can filter accepted quotes and invoices that are issued/unpaid, partially paid, paid, or voided/invalid.
- Draft, sent, viewed, or declined quotes and change orders are not eligible.
- No document is exported until the owner explicitly selects it. The operation never updates QuoteDr data.
- A single export is limited to 500 selected documents. If the result limit is reached, narrow the date range and export another batch.

## CSV layout

Each included line item becomes one CSV row. Document and customer identifiers repeat on each line. Document-level totals appear only on the first line for that document so a spreadsheet sum does not count the same total more than once.

| Column | Meaning |
| --- | --- |
| Document Type | `Accepted Quote` or `Invoice`. |
| Document Number | QuoteDr quote or invoice number. |
| Document Date | ISO `YYYY-MM-DD` document/issue date. |
| Document Status | `Accepted`, `Issued`, or `Voided / invalid`. |
| Acceptance Status | Accepted quote status or optional invoice acknowledgement status. |
| Accepted / Acknowledged At | Recorded ISO timestamp when available. |
| Payment Status | `Unpaid`, `Partially paid`, `Paid`, or `Payment reported - unconfirmed`. An unconfirmed client report is never treated as received money. |
| Paid At | Latest recorded payment timestamp when available. |
| Customer Name / Email / Phone / Address | Customer contact values stored on the selected owner-account document. |
| Line Number / Section / Line Item Description | Client-facing line identity. Internal notes are not included. |
| Quantity / Unit | Sold quantity and unit. |
| Unit Selling Price / Line Total | Client selling values after applicable pricing rules. Pricing-rule details are not included. |
| Currency | Three-letter currency code; legacy records fall back to `CAD`. |
| Document Subtotal | Sum of the exported line totals. |
| Document Adjustment | Signed client-facing document adjustment amount. The adjustment rule or percentage is not exported. |
| Tax Label / Tax Rate (%) / Tax Amount | Stored or reproducible tax result. Tax-disabled documents use a zero rate and amount. |
| Document Total | Subtotal plus the signed adjustment and tax. |
| Payments Received / Balance Due | Confirmed recorded payment amount and remaining balance. A paid status with legacy missing amount evidence is treated as fully paid. |

Money columns use two decimal places. User-controlled text is quoted and values that could be interpreted as spreadsheet formulas are prefixed with an apostrophe.

## Privacy and authorization boundary

The browser calls the authenticated `team-account` Edge Function. The function confirms the signed-in user is the selected account's owner, then scopes every read to `quotes.user_id = ownerUserId`. Raw operational tables remain owner-only under RLS; staff and custom roles cannot use this export for another account.

The server builds the CSV from an allowlist. It does not return or serialize material costs, cost rates, margin/profit, markup rules or percentages, suppliers, internal notes, signatures, payment-provider metadata, credential fields, portal/share/auth tokens, or records owned by another account.

## Release order

1. Deploy the updated `team-account` Edge Function while retaining JWT verification and required secrets.
2. Verify an unauthenticated request fails closed and a signed-in non-owner receives `owner_required`.
3. Publish `settings.html`, `accounting-export-ui.js`, and the Dashboard removal together.
4. In an owner account, test an accepted quote and issued invoice with known line totals, tax, and payment states at desktop and mobile widths.
5. Inspect the downloaded CSV before importing it anywhere. Confirm excluded fields and formula neutralization with a test document containing leading `=`, `+`, `-`, or `@` text.
