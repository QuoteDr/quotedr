const assert = require('assert');
const fs = require('fs');

const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');
const recoveryEdge = fs.readFileSync('supabase/functions/save-recovery/index.ts', 'utf8');

assert(
  supabase.includes('async function qdExecuteFreshQuoteUpdate') &&
    supabase.includes(".select('id,user_id,status,type,quote_number,updated_at,data')") &&
    supabase.includes("updateQuery.eq('updated_at', current.updated_at)") &&
    supabase.includes('Another device won the compare-and-swap') &&
    supabase.includes("action === 'update' && target.table === 'quotes' && operation.entityType === 'quote'") &&
    !supabase.includes("operation.entityType === 'quote' && target.freshnessGuard === 'quote_edit_time'"),
  'every quote update, including a legacy queued operation, should use a freshness check and atomic compare-and-swap'
);

assert(
  supabase.includes('function qdQuoteOperationIsSuperseded') &&
    supabase.includes('saveMeta.clientEditedAt') &&
    supabase.includes('cloudTime > incomingTime') &&
    !supabase.slice(
      supabase.indexOf('function qdQuoteOperationIsSuperseded'),
      supabase.indexOf('function qdQuoteMetadataRow')
    ).includes('forceConflictOverwrite'),
  'legacy Use This Device flags must not let an old device overwrite a newer cloud edit'
);

assert(
  coordinator.includes('async function markSuperseded(operation, result)') &&
    coordinator.includes("snapshot.state = 'superseded_by_cloud'") &&
    coordinator.includes('await deleteStoreValue(OUTBOX_STORE, operation.key)') &&
    coordinator.includes("new CustomEvent('quotedr-save-superseded'") &&
    coordinator.includes("result.state === 'cloud_saved' || result.state === 'superseded'"),
  'stale quote operations should leave the live cloud copy untouched, retain a local snapshot, and stop retrying'
);

assert(
  storage.includes('async function quoteStorageResolveCloudRow(row)') &&
    storage.includes("snapshot.state === 'local_pending' || snapshot.state === 'conflict'") &&
    storage.includes("String(session.supabaseId || '') === rowId") &&
    storage.includes('if (snapshotTime > best.time)') &&
    storage.includes('if (sessionTime > best.time)') &&
    storage.includes('quoteStorageOperationMatchesRow(operation, row, cloudData)') &&
    storage.includes("source: 'outbox'") &&
    storage.includes("updateSaveStatus('pending', resolved.source === 'session'") &&
    storage.includes('window._quoteLocalEditAt = new Date().toISOString()'),
  'loading a quote should preserve only a genuinely newer same-device snapshot/session and otherwise use the cloud copy'
);

assert(
  storage.includes('async function quoteStorageRefreshFromCloudIfIdle()') &&
    storage.includes(".select('updated_at').eq('id', quoteId).maybeSingle()") &&
    storage.includes('async function quoteStorageHandleRemoteSignal(signal)') &&
    storage.includes('var hasLocalEdits = unsavedChanges || hasPending') &&
    storage.includes('await quoteStorageLoadLatestRemote()') &&
    storage.includes("window.addEventListener('focus'") &&
    storage.includes('setInterval(quoteStorageRefreshFromCloudIfIdle, 60000)'),
  'an idle phone or tab should pull a newer cloud quote while dirty tabs enter an explicit conflict flow'
);

assert(
  storage.includes('window.qdSaveBeforeNavigation = async function()') &&
    storage.includes('var result = await doAutoSave({ force: true })') &&
    storage.includes("result.state !== 'local_failed'") &&
    dialogs.includes("typeof window.qdSaveBeforeNavigation === 'function'") &&
    !dialogs.includes('You have unsaved changes. Leave anyway?'),
  'leaving the builder should finish a durable save and remain on the page only when local retention fails'
);

assert(
  recoveryEdge.includes('Quote and invoice recovery records are backup-only') &&
    recoveryEdge.includes('Quote and invoice incidents cannot be replayed over a live document') &&
    settings.includes('function saveIncidentIsDocumentBackup(row)') &&
    settings.includes('active && !documentBackup') &&
    settings.includes('This is a backup only. It cannot replay over a newer live quote.'),
  'admin recovery must keep quote incidents exportable without allowing destructive replay'
);

console.log('quote multi-device save safety checks passed');
