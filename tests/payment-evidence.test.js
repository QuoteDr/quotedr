const assert = require('node:assert');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

async function policy() {
  return import('../supabase/functions/_shared/payment-evidence-policy.mjs');
}

test('payment proof accepts only the approved formats and deterministic size limit', async () => {
  const rules = await policy();
  assert.equal(rules.PAYMENT_EVIDENCE_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(rules.paymentEvidenceMimeType('image/jpeg'), 'image/jpeg');
  assert.equal(rules.paymentEvidenceMimeType('image/png; charset=binary'), 'image/png');
  assert.equal(rules.paymentEvidenceExtension('application/pdf'), 'pdf');
  assert.equal(rules.paymentEvidenceByteSize(8 * 1024 * 1024), 8 * 1024 * 1024);
  assert.equal(rules.paymentEvidenceContentMatches(Uint8Array.from([0xff, 0xd8, 0xff, 0x01]), 'image/jpeg'), true);
  assert.equal(rules.paymentEvidenceContentMatches(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(rules.paymentEvidenceContentMatches(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf'), true);
  assert.equal(rules.paymentEvidenceContentMatches(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]), 'application/pdf'), false);
  assert.throws(() => rules.paymentEvidenceMimeType('image/svg+xml'), /JPG, PNG, or PDF/);
  assert.throws(() => rules.paymentEvidenceByteSize(8 * 1024 * 1024 + 1), /8 MB/);
});

test('payment proof filenames cannot carry paths or control characters', async () => {
  const rules = await policy();
  assert.equal(rules.paymentEvidenceFilename('..\\bank\nproof.png'), '..-bank proof.png');
  assert.equal(rules.paymentEvidenceFilename(''), 'payment-proof');
  assert(rules.paymentEvidenceFilename('x'.repeat(200)).length <= 120);
});

test('payment evidence storage is private and browser roles have no direct data access', () => {
  const migration = read('supabase/migrations/20260818180914_payment_evidence.sql');
  assert(migration.includes("'document-payment-evidence'"));
  assert(/'document-payment-evidence',[\s\S]*?false,[\s\S]*?8388608/.test(migration));
  assert(migration.includes("array['image/jpeg', 'image/png', 'application/pdf']"));
  assert(migration.includes('alter table public.payment_evidence enable row level security'));
  assert(migration.includes('revoke all on table public.payment_evidence from public, anon, authenticated'));
  assert(!/create policy[\s\S]{0,160}document-payment-evidence/i.test(migration), 'the private bucket must not gain a direct browser policy');
  assert(migration.includes('payment_evidence_one_active_per_payment_idx'));
  assert(migration.includes('on public.payment_evidence(payment_record_id, uploaded_by_role)'));
  assert(migration.includes('where deleted_at is null'));
  assert(migration.includes('payment_evidence_quote_id_fkey_idx'));
  assert(migration.includes('payment_evidence_invoice_id_fkey_idx'));
});

test('the payment function authorizes, verifies, and signs evidence without changing accounting amounts', () => {
  const edge = read('supabase/functions/document-payment/index.ts');
  assert(edge.includes('ACCOUNT_PERMISSION.PAYMENTS_READ'));
  assert(edge.includes('ACCOUNT_PERMISSION.PAYMENTS_MANAGE'));
  assert(edge.includes('prepare_evidence_upload') && edge.includes('owner_prepare_evidence_upload'));
  assert(edge.includes('record.provider !== "manual"'));
  assert(edge.includes('record.portal_visible !== true'));
  assert(edge.includes('.filter((record: any) => record.portal_visible === true)'));
  assert(edge.includes('createSignedUploadUrl(record.object_path, { upsert: true })'));
  assert(edge.includes('createSignedUrl(record.object_path, PAYMENT_EVIDENCE_SIGNED_URL_SECONDS)'));
  assert(edge.includes('actualSize') && edge.includes('actualMime'));
  assert(edge.includes('paymentEvidenceContentMatches(actualBytes, record.mime_type)'));
  assert(edge.includes('body.privacyChecked !== true'));
  assert(edge.includes('actorRole === "client" ? true : body.portalVisible === true'));
  assert(!/payment_evidence[\s\S]{0,240}(?:amount_cents|confirmedAmountCents)/.test(edge), 'evidence operations must not update accounting amounts');
});

test('client and contractor interfaces keep evidence optional and warn before upload', () => {
  const dashboard = read('dashboard.html');
  const viewer = read('interactive-quote-viewer.html');
  const browser = read('supabase-v2.js');
  const fixture = read('tests/payment-evidence-browser-fixture.html');
  const warning = 'Crop or cover bank and card numbers, confirmation or reference numbers, email addresses, and unrelated personal information.';
  assert(dashboard.includes(warning));
  assert(viewer.includes(warning));
  assert(dashboard.includes('Show this proof in the client portal'));
  assert(/id="dashboardPaymentEvidencePortal"/.test(dashboard));
  assert(!/id="dashboardPaymentEvidencePortal"[^>]*checked/.test(dashboard), 'contractor sharing must default off');
  assert(dashboard.includes('The proof is optional and never changes the amount recorded as received.'));
  assert(viewer.includes('This does not change the amount reported or received.'));
  assert(viewer.includes('I checked this file for sensitive information.'));
  assert(viewer.includes("if (evidenceFile)"), 'the client may report a payment without a proof');
  assert(browser.includes('uploadToSignedUrl'));
  assert(browser.includes('window.validatePaymentEvidenceFile = validatePaymentEvidenceFile;'));
  assert(browser.includes('window.uploadPaymentEvidence = uploadPaymentEvidence;'));
  assert(!browser.includes('readAsDataURL'), 'proof bytes must upload directly rather than entering JSON or local storage');
  assert(fixture.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert(fixture.includes('id="portal-visibility"'));
  assert(!/id="portal-visibility"[^>]*checked/.test(fixture), 'the browser fixture must preserve default-off sharing');
});

test('payment-proof callers request the same current shared-client bundle', () => {
  const dashboard = read('dashboard.html');
  const viewer = read('interactive-quote-viewer.html');
  const dashboardVersion = dashboard.match(/supabase-v2\.js\?v=(\d+)/)?.[1];
  const viewerVersion = viewer.match(/supabase-v2\.js\?v=(\d+)/)?.[1];
  assert.equal(dashboardVersion, '2026081901');
  assert.equal(viewerVersion, dashboardVersion);
  assert.notEqual(dashboardVersion, '2026081801', 'a stale client bundle leaves payment-proof helpers undefined');
});

test('proof visibility and deletion are explicit on both surfaces', () => {
  const dashboard = read('dashboard.html');
  const viewer = read('interactive-quote-viewer.html');
  assert(dashboard.includes('Show in portal') && dashboard.includes('Hide from portal'));
  assert(dashboard.includes('owner_set_evidence_visibility'));
  assert(dashboard.includes('owner_delete_evidence'));
  assert(dashboard.includes("window.open('about:blank', '_blank')"), 'owner proof viewing must open synchronously for mobile popup rules');
  assert(viewer.includes("secureDocumentPaymentPayload('view_evidence'"));
  assert(viewer.includes("secureDocumentPaymentPayload('delete_evidence'"));
  assert(viewer.includes("window.open('about:blank', '_blank')"), 'client proof viewing must open synchronously for mobile popup rules');
  assert(viewer.includes("evidence.uploadedBy === 'client'"), 'clients may only remove proof they supplied');
});
