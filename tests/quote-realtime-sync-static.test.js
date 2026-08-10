const assert = require('assert');
const fs = require('fs');

const storage = fs.readFileSync('quote-storage.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260715193000_enable_quote_realtime.sql', 'utf8');

assert(
  storage.includes("new BroadcastChannel('quotedr-quote-cloud-updates')") &&
    storage.includes("type: 'quote_cloud_updated'") &&
    storage.includes('quoteStorageBroadcastCloudUpdate(savedId || operationId || currentId'),
  'same-browser tabs should receive a quote-specific cloud acknowledgement without writing'
);

assert(
  storage.includes(".on('postgres_changes'") &&
    storage.includes("event: 'UPDATE'") &&
    storage.includes("table: 'quotes'") &&
    storage.includes("filter: 'id=eq.' + quoteId") &&
    storage.includes("source: 'realtime'"),
  'other devices should observe quote updates through a read-only Supabase Realtime subscription'
);

assert(
  storage.includes('if (!hasLocalEdits && !quoteStorageUiBusy())') &&
    storage.includes('await quoteStorageLoadLatestRemote()') &&
    storage.includes("title: 'Quote Updated'") &&
    storage.includes("message: 'Loaded the newest changes from the cloud.'"),
  'an unchanged tab should automatically apply the latest cloud quote'
);

assert(
  storage.includes("title: 'Quote Updated Elsewhere'") &&
    storage.includes("okText: 'Load Latest'") &&
    storage.includes("secondaryText: 'Use My Version'") &&
    storage.includes("cancelText: 'Keep Editing'") &&
    storage.includes('quoteStoragePersistRemoteConflict(collectQuoteData())'),
  'a dirty tab should retain its local copy and ask which version to keep'
);

assert(
  coordinator.includes('async function pauseEntity(entityType, entityId, options)') &&
    coordinator.includes('async function updateConflictPayload(entityType, entityId, payload, options)') &&
    coordinator.includes('async function discardPending(entityType, entityId, options)') &&
    coordinator.includes('incomingEditorInstance === existingEditorInstance') &&
    coordinator.includes('operationId: sameEditorChain ? existing.operationId : randomId()') &&
    /if\s*\(\s*operation\.state\s*===\s*'conflict'[^)]*\)\s*continue;/.test(coordinator) &&
    /if\s*\(\s*pending\.state\s*===\s*'conflict'[^)]*\)/.test(coordinator),
  'true concurrent-edit conflicts should remain durable without automatic background retries'
);

assert(
  supabase.includes("target.requireCurrentQuoteBase === true") &&
    supabase.includes('var sameOperationChain =') &&
    supabase.includes('var sameEditorInstance =') &&
    supabase.includes('!sameOperationChain && !sameEditorInstance && !qdDurableVersionsMatch(operation.baseVersion, current.updated_at)') &&
    supabase.includes('cloudSavedTime > incomingSavedTime') &&
    supabase.includes("conflictError.code = '409'") &&
    supabase.includes('conflictError.serverVersion = current.updated_at || null') &&
    supabase.includes('requireCurrentQuoteBase: true') &&
    coordinator.includes("sourceInstanceId: payload && payload._editorInstanceId || ''"),
  'new quote writes should require the exact cloud base and identify their source tab'
);

assert(
  migration.includes("pubname = 'supabase_realtime'") &&
    migration.includes("tablename = 'quotes'") &&
    migration.includes('alter publication supabase_realtime add table public.quotes'),
  'the migration should safely enable quote updates in the Supabase Realtime publication'
);

console.log('quote realtime synchronization static checks passed');
