const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const coordinator = read('save-coordinator.js');
const supabase = read('supabase-v2.js');
const quoteStorage = read('quote-storage.js');
const portal = read('client-portal.html');
const settings = read('settings.html');
const dashboard = read('dashboard.html');
const migration = read('supabase/migrations/20260712150000_save_recovery_records.sql');
const edge = read('supabase/functions/save-recovery/index.ts');
const emailEdge = read('supabase/functions/send-quote-email/index.ts');
const qbEdge = read('supabase/functions/qb-sync/index.ts');
const stripeEdge = read('supabase/functions/stripe-deposit/index.ts');
const config = read('supabase/config.toml');

assert(
  coordinator.includes('async function resolveRolloutEnabled') &&
    coordinator.includes("user.email || '').toLowerCase() === 'info@alddirect.ca'") &&
    coordinator.includes(".eq('key', 'durable_save_rollout')") &&
    coordinator.includes("localStorage.getItem('quotedr_durable_save_enabled')"),
  'Durable saves should roll out to the admin first, then explicit account cohorts, with a local rollback override'
);

assert(
  coordinator.includes("var DB_NAME = 'quotedr-durable-saves'") &&
    coordinator.includes("var OUTBOX_STORE = 'outbox'") &&
    coordinator.includes("var SNAPSHOT_STORE = 'snapshots'") &&
    coordinator.includes('persistOperationAndSnapshot(operation, snapshot)'),
  'Durable saves should commit an outbox operation and local snapshot together in IndexedDB'
);

assert(
  coordinator.includes('operationId: existing ? existing.operationId') &&
    coordinator.includes('revision: revision') &&
    coordinator.includes('payloadHash: await payloadHash(payload)') &&
    coordinator.includes('baseVersion: existing ? (existing.baseVersion || options.baseVersion || null) : (options.baseVersion || null)'),
  'Outbox operations should carry stable ids, revisions, hashes, and base server versions'
);

assert(
  coordinator.includes("publicResult('cloud_saved'") &&
    coordinator.includes("publicResult('local_pending'") &&
    coordinator.includes("current.state = isConflictError(error) ? 'conflict' : 'local_pending'") &&
    coordinator.includes("publicResult('local_failed'"),
  'Save callers should receive every explicit save state'
);

assert(
    coordinator.includes("navigator.locks.request('quotedr-durable-save-flush'") &&
    coordinator.includes('return flushSavedOperation(operation, { force: true });') &&
    coordinator.includes("new BroadcastChannel('quotedr-durable-saves')") &&
    coordinator.includes("window.addEventListener('online'") &&
    coordinator.includes("event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'") &&
    coordinator.includes('setInterval(function() { flush(); }, 30000)'),
  'Retries should run on reconnect, auth refresh, a schedule, and only one tab at a time'
);

assert(
  coordinator.includes('navigator.storage.persist()') &&
    coordinator.includes('lastLocalFailure.hasEmergencyRecovery = true') &&
    coordinator.includes("scheduleRecoveryGuidance(operation, { localFailed: true })") &&
    coordinator.includes('_mustReselectOriginal') &&
    coordinator.includes('dataUrl:'),
  'Storage failures should be visible and offer an immediate recovery export, including reasonably sized blobs'
);

assert(
  coordinator.includes("isImmediateVaultError(error) || current.attempts >= 3") &&
    coordinator.includes("action: 'capture'") &&
    coordinator.includes("action: 'resolve'") &&
    coordinator.includes("if (navigator.onLine === false) return publicResult('local_pending'"),
  'Non-retryable and repeatedly failing online saves should reach the vault while offline saves remain local'
);

assert(
  coordinator.includes('All changes saved to cloud') &&
    coordinator.includes('Saved on this device - syncing') &&
    coordinator.includes('Save needs attention') &&
    coordinator.includes('Sync &amp; Recovery') &&
    coordinator.includes('Retry Now') &&
    coordinator.includes('Export Quote Backup') &&
    coordinator.includes('Export Recovery Bundle'),
  'The app should expose persistent global sync state and user recovery controls'
);

assert(
  supabase.includes('window.QuoteDrSave.registerAdapter(entityType') &&
    supabase.includes('async function qdDurableSupabaseOperation') &&
    supabase.includes("throw new Error('Cloud save matched no records") &&
    supabase.includes("throw new Error('Cloud save acknowledgement did not match the local revision") &&
    supabase.includes('timeoutMs: options.timeoutMs || 15000'),
  'Supabase adapters should normalize acknowledgements, empty writes, revisions, and timeouts'
);

assert(
  supabase.includes("requireCloudAck('quote', documentId)") &&
    supabase.includes("requireCloudAck('invoice', documentId)") &&
    supabase.includes('has not finished syncing to the cloud'),
  'Sharing should be blocked until the latest quote or invoice revision is cloud-confirmed'
);

assert(
  quoteStorage.includes("result.state === 'cloud_saved'") &&
    quoteStorage.includes("cloudState === 'local_pending'") &&
    quoteStorage.includes("result.state === 'local_failed'") &&
    quoteStorage.includes('await saveQuoteToSupabase('),
  'Quote saves should await the coordinator and distinguish cloud, local-pending, and local-failed outcomes'
);

assert(
  portal.includes("const PORTAL_JOB_ASSET_BUNDLE_ADAPTER = 'portal_job_asset_bundle'") &&
    portal.includes('snapshotPayload: options.snapshotPayload') &&
    portal.includes(".upload(upload.path, upload.blob") &&
    portal.includes(".upsert(payload.record, { onConflict: 'id' })") &&
    portal.includes("mode: 'delete_asset'") &&
    portal.includes("mode: 'delete_folder'"),
  'Portal uploads and deletes should retain blobs/pre-delete metadata as replayable idempotent bundles'
);

for (const page of ['quote-builder.html', 'dashboard.html', 'settings.html', 'client-portal.html', 'interactive-quote-viewer.html', 'invoice-viewer.html', 'labor-tracker.html', 'onboarding.html']) {
  assert(read(page).includes('save-coordinator.js'), `${page} should load the durable save coordinator`);
}

assert(
  settings.includes('Save Incidents') &&
    settings.includes('loadSaveRecoveryIncidents') &&
    settings.includes("callSaveRecoveryAdmin('retry'") &&
    settings.includes("callSaveRecoveryAdmin('discard'") &&
    dashboard.includes('refreshDashboardSaveIncidents'),
  'The admin account should have incident monitoring, retry, export, and resolution controls'
);

assert(
  migration.includes('create table if not exists public.save_recovery_records') &&
    migration.includes('alter table public.save_recovery_records enable row level security') &&
    migration.includes("interval '90 days'") &&
    migration.includes("interval '30 days'") &&
    migration.includes('purge-save-recovery-records'),
  'Recovery records should be owner/admin protected and automatically expire on the required schedule'
);

assert(
  edge.includes('authenticatedUser(req)') &&
    edge.includes('validateRecoveryOperation(operation)') &&
    edge.includes('allowedEntityTypes') &&
    edge.includes('replayTables') &&
    edge.includes('QUOTEDR_SAVE_ALERT_EMAIL') &&
    edge.includes('alert_sent_at') &&
    edge.includes('sanitize(operation.payload') &&
    edge.includes('target.dedupe?.filters?.length'),
  'The recovery function should authenticate, validate, redact, deduplicate alerts, and replay only allowlisted idempotent targets'
);

assert(
  config.includes('[functions.save-recovery]') && config.includes('verify_jwt = true'),
  'Supabase should verify JWTs before invoking save-recovery'
);

assert(
  migration.includes('create table if not exists public.external_operation_receipts') &&
    migration.includes('payment_records_idempotency_key_idx') &&
    supabase.includes('function qdGetExternalOperationId') &&
    supabase.includes('function qdCompleteExternalOperation') &&
    emailEdge.includes('claimEmailOperation') &&
    emailEdge.includes('authenticatedUser(req)') &&
    qbEdge.includes('claimQBOperation') &&
    stripeEdge.includes('"Idempotency-Key": idempotencyKey') &&
    config.includes('[functions.send-quote-email]'),
  'Email, QuickBooks, and Stripe side effects should require stable idempotency keys and server receipts instead of entering the automatic outbox'
);

console.log('durable save and recovery static checks passed');
