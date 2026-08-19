const assert = require('node:assert');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const payment = read('supabase/functions/document-payment/index.ts');
const connect = read('supabase/functions/stripe-connect/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const clientDocument = read('supabase/functions/client-document/index.ts');
const migration = read('supabase/migrations/20260719182624_stripe_connect_document_payments.sql');
const partialDepositMigration = read('supabase/migrations/20260818211500_partial_deposit_summary_state.sql');
const config = read('supabase/config.toml');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');
const legacyPayment = read('supabase/functions/stripe-deposit/index.ts');

assert(payment.includes('assertDocumentAccess') && payment.includes('public_share_token_hash') && payment.includes('sha256Hex'), 'document payments must validate the secure document token');
assert(payment.includes('const amountCents = dueAmount(type, state);'), 'the server must calculate the amount from document state');
assert(!/Number\(body\.amount|body\.amountCents|body\.amount_cents/.test(payment), 'the payment function must not trust a browser-supplied amount');
assert(payment.includes('safeReturnUrl') && payment.includes('url.searchParams.get("token") !== token'), 'Stripe return URLs must be restricted to the active secure document');
assert(payment.includes('headers.set("Stripe-Account", accountId)'), 'document charges must be created on the contractor connected account');
assert(!payment.includes('application_fee_amount') && !payment.includes('transfer_data[destination]'), 'QuoteDr must not collect an application fee or create destination charges');
assert(payment.includes('idempotency_key') && payment.includes('Idempotency-Key'), 'checkout and database writes must be idempotent');
assert(payment.includes('status: "client_reported"') && payment.includes('status: "confirmed"'), 'manual payments must be reported before contractor confirmation');
assert(payment.includes('authenticatedUser(req)') && payment.includes('record.user_id !== user.id'), 'manual confirmation must authenticate and authorize the contractor');
assert(payment.includes('action === "resolve_deposit_shortfall"'), 'the contractor must be able to resolve a short confirmed deposit explicitly');
assert(payment.includes('row.user_id !== user.id'), 'short-deposit decisions must be owner-authorized');
assert(payment.includes('["accept_shortfall", "keep_outstanding"]'), 'short-deposit decisions must be constrained to the two supported policies');
assert(payment.includes('deposit_shortfall_accepted_by'), 'the payment function must retain private decision provenance');
assert(payment.includes('balance_due_cents: nextState.balanceDueCents'), 'accepting a short deposit must preserve the canonical remaining project balance');

assert(connect.includes('type: "standard"') && connect.includes('type: "account_onboarding"'), 'Stripe Connect must use Standard hosted onboarding');
assert(connect.includes('action === "dashboard"') && connect.includes('action === "disable"'), 'Stripe setup must support management and disabling');
assert(webhook.includes('verifyStripeSignature') && webhook.includes('stripe_webhook_events') && webhook.includes('event.account'), 'webhooks must verify signatures, prevent replay, and handle connected-account events');
assert(webhook.includes('STRIPE_WEBHOOK_SECRET') && webhook.includes('STRIPE_CONNECT_WEBHOOK_SECRET'), 'webhooks must support separate platform and connected-account signing secrets');
assert(clientDocument.includes('loadPaymentOptions') && clientDocument.includes('stripe_connected_accounts'), 'secure document loads must return live payment availability');

assert(/\[functions\.document-payment\]\s*verify_jwt = false/.test(config), 'the token-authenticated public document payment function must bypass gateway JWT verification');
assert(/\[functions\.stripe-connect\]\s*verify_jwt = true/.test(config), 'Stripe account management must require a user JWT');
assert(migration.includes('enable row level security') && migration.includes('revoke all on table public.payment_records from authenticated'), 'payment tables must use RLS and block direct client mutation');
assert(partialDepositMigration.includes('zz_quotedr_refresh_quote_payment_summary_trigger'), 'dashboard summaries must refresh after the existing quote summary trigger');
assert(!partialDepositMigration.includes('deposit_shortfall_accepted_by'), 'private contractor provenance must never enter the dashboard cache projection');
assert(partialDepositMigration.includes('revoke all on function public.quotedr_refresh_quote_payment_summary() from authenticated'), 'the summary trigger function must not be directly callable by users');

assert(quoteViewer.includes("secureDocumentPaymentPayload('create_checkout'") && invoiceViewer.includes("secureInvoicePaymentPayload('create_checkout'"), 'quote and invoice viewers must use the secure document-payment function');
assert(!quoteViewer.includes('/functions/v1/stripe-deposit') && !invoiceViewer.includes('/functions/v1/stripe-deposit'), 'public viewers must not call the legacy amount-trusting checkout endpoint');
assert(legacyPayment.includes('legacy_payment_endpoint_retired') && !legacyPayment.includes('body.amount'), 'the old public amount-trusting endpoint must be retired');
assert(quoteViewer.includes("secureDocumentPaymentPayload('verify_checkout'") && invoiceViewer.includes("secureInvoicePaymentPayload('verify_checkout'"), 'payment return pages must verify Stripe sessions before showing paid');

console.log('secure document payments static test passed');
