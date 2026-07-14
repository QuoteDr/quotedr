const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('function findSavedItemForQuoteEdit(') &&
    source.includes('function buildSavedItemFromEditedLineItem(') &&
    source.includes('function maybeConfirmSavedItemDatabaseUpdate(') &&
    source.includes('function saveEditedLineItemToDatabase('),
  'Editing a saved quote item should have dedicated helpers for locating, prompting, and updating the saved item'
);

assert(
  source.includes('Apply these reusable item changes to the saved item database too?') &&
    source.includes('Current Quote Only') &&
    source.includes('Update Saved Item'),
  'Saving edits to a linked saved item should ask whether changes apply only to this quote or also to the saved item database'
);

assert(
  source.includes('maybeConfirmSavedItemDatabaseUpdate(editedQuoteItem, editedSavedItemData)') &&
    source.includes("await _hideBootstrapModalAndWait('addLineModal')") &&
    source.includes("if (savedDbChoice === 'update_saved_item')"),
  'The edit save path should commit and close the quote editor before prompting for the saved-item update choice'
);

const confirmAddLineBlock = source.slice(
  source.indexOf('async function confirmAddLine()'),
  source.indexOf('function checkIfNewItem()')
);

assert(
  confirmAddLineBlock.indexOf('item.rate = rate;') < confirmAddLineBlock.indexOf("await _hideBootstrapModalAndWait('addLineModal')") &&
    confirmAddLineBlock.indexOf("await _hideBootstrapModalAndWait('addLineModal')") < confirmAddLineBlock.indexOf('maybeConfirmSavedItemDatabaseUpdate(editedQuoteItem, editedSavedItemData)'),
  'Saving an edit should update the quote rate first, close the editor, and only then open the optional database prompt'
);

assert(
  source.includes('function syncEditedItemUpgradeBaseState(item, values)') &&
    source.includes('item._baseRate = values.priceTbd ? 0') &&
    confirmAddLineBlock.includes('syncEditedItemUpgradeBaseState(item, {'),
  'Editing an item with active upgrades should update the hidden base rate before the quote rerenders'
);

assert(
  source.includes('if (itemOrSource && itemOrSource.savedItemSource)') &&
    source.includes('serviceName: itemOrSource.serviceName || itemOrSource.description'),
  'Saved item lookup should fall back to the current quote line when older source metadata is stale'
);

assert(
  source.includes('saveEditedLineItemToDatabase(previousSavedItemSource, editedSavedItemData)') &&
    source.includes("localStorage.setItem('ald_custom_items', JSON.stringify(customItems))") &&
    (source.includes('_doBackupItemsToCloud(customItems)') || source.includes('backupItemsToCloud(customItems)')),
  'Updating the saved item from the edit modal should persist to local storage and the existing cloud backup path'
);

assert(
  source.includes('recordSavedItemQuoteChange(previousSavedItemSource.category') &&
    source.includes('savedItemQuoteSource(savedUpdateResult.category, savedUpdateResult.item)') &&
    source.includes('getSavedItemFingerprintForQuoteSync(savedUpdateResult.item)'),
  'Saved-item database edits from the quote editor should update source metadata and record quote-sync changes'
);

const savedItemBuilderBlock = source.slice(
  source.indexOf('function buildSavedItemFromEditedLineItem('),
  source.indexOf('function maybeConfirmSavedItemDatabaseUpdate(')
);

assert(
  !/notes\s*:/.test(savedItemBuilderBlock),
  'Job-specific notes must remain quote-only and should not be saved into reusable item data'
);
