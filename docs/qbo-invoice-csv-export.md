# QBO Invoice CSV Export

This owner-only tool prepares a QuickBooks Online-oriented invoice CSV. It is a preflight and download only: QuoteDr does not create, update, void, send, or record any QuickBooks transaction.

## Required profile

Before reviewing invoices, the account owner saves one QBO invoice profile with exact values used by the target QuickBooks company:

- a profile name;
- an exact QBO tax-exempt code;
- exact QuoteDr customer to QBO customer mappings, unless the owner deliberately enables QBO customer creation during import;
- exact QuoteDr line-description to QBO product/service mappings; and
- exact QuoteDr tax-label to QBO item-tax-code mappings.

Mappings are exact text pairs. The exporter never guesses from a similar customer or item name. The profile is stored only for the owner account and the Edge Function re-reads it before every preflight/export.

## Eligibility

The preflight includes only issued, unpaid invoices. It rejects accepted quotes and change orders, paid or partly paid invoices, payment reports that are not confirmed, voided/invalid invoices, missing number/date/due date/customer, document adjustments, negative or discounted line amounts, missing mappings, duplicate invoice numbers in the review, and unsupported quantities.

The download is limited to 100 invoices and 1,000 line rows. The review displays every inclusion/exclusion reason and the selected profile before the owner can select ready invoices.

## CSV columns

Each invoice line is emitted as:

`Invoice Number`, `Customer`, `Invoice Date`, `Due Date`, `Product/Service`, `Description`, `Quantity`, `Rate`, `Item Amount`, `Currency`, `Item Tax Code`.

The owner must still review QBO's current import template, account settings, tax setup, and mapped values before import. This export does not promise compatibility across every QBO country, plan, or tax configuration.

## Privacy and authorization

The browser and Edge Function both require the signed-in account owner. The source read is scoped to `quotes.user_id = ownerUserId` and excludes backup pseudo-documents. The serializer receives only client-facing invoice values and does not include costs, margins, markup, supplier data, internal notes, payment-provider IDs, credentials, portal tokens, or other-account records.

## Safe release checks

1. Deploy `team-account` with JWT verification retained.
2. Verify unauthenticated and non-owner profile/preflight/export requests fail closed.
3. In a QBO sandbox, save a profile with known customer, product/service, taxable, and tax-exempt mappings.
4. Review an eligible invoice, then verify paid, partially paid, accepted, voided, adjusted, missing-due-date, and unmapped fixtures are excluded with the expected reason.
5. Inspect a downloaded CSV for its exact headers, line totals, formula neutralization, and absence of excluded fields before importing it into QBO.
