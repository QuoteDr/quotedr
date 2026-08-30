const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const quoteItems = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const starter = fs.readFileSync(path.join(root, 'quote-starter-item-library.js'), 'utf8');
const supabaseClient = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');

assert(builder.includes('id="manageStarterLibraryBtn"'), 'Manage Line Items should expose a permanent Starter Library action');
assert(builder.includes('id="manageStarterLibraryView"'), 'Starter Library should use an embedded full-width Manage Items subview');
assert(/#manageItemsModal\.manage-starter-library-active #manageStarterLibraryView\s*\{[^}]*overflow-y:\s*auto/.test(builder), 'desktop Starter Library rows should have their own reachable scroll region');
assert(builder.includes('id="manageStarterTradeFilter"') && builder.includes('id="manageStarterRoomFilter"') && builder.includes('id="manageStarterPhaseFilter"'), 'Starter Library should filter by trade, room/project type, and phase');
assert(builder.includes('data-starter-edit="name"') || quoteItems.includes('data-starter-edit="name"'), 'starter rows should support inline name editing');
assert(quoteItems.includes('data-starter-edit="category"') && quoteItems.includes('data-starter-edit="unitType"') && quoteItems.includes('data-starter-edit="itemDescription"'), 'starter rows should support inline category, unit, and description editing');
assert(builder.includes('Save Selected to My Items'), 'starter imports should use the existing My Items database');
assert(quoteItems.includes('starter.catalogItemToSavedItem(catalogItem, draft)'), 'bulk import should use the shared Price TBD conversion');
assert(quoteItems.includes('starter.findSavedItem(catalogItem, customItems)'), 'bulk import should detect provenance and normalized duplicates');
assert(quoteItems.includes('persistManageItemsLocalSnapshot(customItems)'), 'starter imports should save to ald_custom_items');
assert(quoteItems.includes('await _doBackupItemsToCloud(customItems)'), 'starter imports should use the existing cloud snapshot');
assert(!quoteItems.includes("localStorage.setItem('ald_starter_items'"), 'Starter Library must not create a second item database');
assert(
  quoteItems.includes('window._manageItemsReadyPromise = Promise.all([itemRestorePromise, categoryOrderRestorePromise]).then(function()'),
  'empty database offer should wait for both item and category-order cloud restoration'
);
assert(quoteItems.includes('maybeOfferStarterLibrary();'), 'empty database should receive one lightweight starter offer');
assert(quoteItems.includes("profile.offerStatus = 'dismissed'"), 'starter offer dismissal should be remembered');
assert(quoteItems.includes("manageStarterLibraryProfile.offerStatus = 'completed'"), 'starter import completion should be remembered');
assert(quoteItems.includes("action: 'imported'"), 'bulk import should record only an explicit import action');
assert(supabaseClient.includes("QUOTEDR_STARTER_LIBRARY_PROFILE_KEY = 'ai_starter_library_profile'"), 'starter preferences should use the shared user_data key');
assert(supabaseClient.includes("QUOTEDR_STARTER_LIBRARY_PROFILE_STORAGE_KEY = 'ald_ai_starter_library_profile'"), 'starter preferences should retain a local fallback');
assert(supabaseClient.includes('window.saveUserStarterLibraryProfile = saveUserStarterLibraryProfile'), 'starter profile should be saved through the shared Supabase client');
assert(starter.includes('starterSourceId') && starter.includes('starterCatalogVersion'), 'personal starter copies should retain provenance without losing ownership');
assert(builder.includes('Nothing is added or saved until you choose an action.'), 'Copilot item preview should remain non-destructive');
assert(!builder.slice(builder.indexOf('function openQuoteReviewLineItemDraft(payload)'), builder.indexOf('function openQuoteCompletenessReview()')).includes('confirmAddLine('), 'opening a starter or AI draft must not auto-add it');

console.log('starter item library static checks passed');
