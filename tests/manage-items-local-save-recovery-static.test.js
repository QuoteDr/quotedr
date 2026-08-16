const fs = require('fs');
const assert = require('assert');

const items = fs.readFileSync('quote-items.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  items.includes("const MANAGE_ITEMS_LOCAL_UPDATED_AT_KEY = 'ald_custom_items_updated_at'") &&
    items.includes('function persistManageItemsLocalSnapshot(itemsObj, options)') &&
    items.includes('window.persistManageItemsLocalSnapshot = persistManageItemsLocalSnapshot'),
  'Manage Items should timestamp every durable local item-database save'
);

assert(
  items.includes('if (!localIsEmpty && localUpdatedAt > cloudUpdatedAt)') &&
    items.includes('Kept newer local item database and queued another cloud sync') &&
    items.includes('_doBackupItemsToCloud(customItems)'),
  'Startup restore should preserve and retry a newer local database instead of replacing it with stale cloud data'
);

assert(
  items.includes("return { data: snapshot, updatedAt: data.updated_at || data.data.backed_up_at || '' }") &&
    items.includes('persistManageItemsLocalSnapshot(customItems, { updatedAt: result.updatedAt'),
  'Cloud restore should carry its timestamp into the local conflict decision'
);

assert(
  builder.includes('<i class="fas fa-database me-1"></i>Save To Database') &&
    builder.includes("? '<i class=\"fas fa-database me-1\"></i>Update Database'") &&
    builder.includes("saveNewItemBtn.dataset.databaseState = found ? 'existing' : 'new'"),
  'Add/Edit Line Item should always expose an explicit Save To Database or Update Database action'
);

assert(
  builder.includes('async function saveLineItemToDatabase()') &&
    builder.includes('persistManageItemsLocalSnapshot(customItems)') &&
    builder.includes('Saved locally. Cloud sync will retry.') &&
    builder.includes('buildSavedItemFromEditedLineItem(activeQuoteItem)'),
  'The dedicated database action should save locally first, report cloud fallback, and preserve quote item metadata'
);

assert(
  builder.includes('Saved Locally - Syncing') &&
    items.includes('Saved locally - syncing cloud...'),
  'Database saves should confirm durable local storage immediately while cloud synchronization continues'
);

assert(
  builder.includes("const isNewDatabaseItem = editingItemIndex === null") &&
    builder.includes("savNewItemBtn.dataset.databaseState === 'new'") &&
    builder.includes('const shouldAskToSaveNewLineItem = shouldPromptToSaveNewLineItem(isNewDatabaseItem);'),
  'The automatic new-item prompt should remain available without firing for existing database items'
);

console.log('manage items local save recovery static checks passed');
