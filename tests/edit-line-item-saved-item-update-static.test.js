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
  source.includes('maybeConfirmSavedItemDatabaseUpdate(item, editedSavedItemData)') &&
    source.includes("if (savedDbChoice === false) return;") &&
    source.includes("if (savedDbChoice === 'update_saved_item')"),
  'The edit save path should prompt before committing and branch on the saved-item update choice'
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
