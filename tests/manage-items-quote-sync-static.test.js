const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  builder.includes('savedItemSource') && builder.includes('savedItemFingerprint'),
  'Quote items added from saved items should carry source metadata and a fingerprint'
);

assert(
  items.includes('recordSavedItemQuoteChange') &&
    items.includes('getSavedItemFingerprintForQuoteSync'),
  'Manage Items saves should record saved item changes for quote sync review'
);

assert(
  builder.includes('renderSavedItemQuoteChangeBanner') &&
    builder.includes('items in quote have been modified in Manage Items'),
  'Quote builder should render a banner when current quote items have saved-item changes'
);

assert(
  builder.includes('openSavedItemQuoteChangeModal') &&
    builder.includes('Apply Changes to Quote') &&
    builder.includes('Ignore All') &&
    builder.includes('Select All') &&
    builder.includes('Deselect All'),
  'Quote builder should expose a review modal with apply, ignore, select all, and deselect all actions'
);

assert(
  builder.includes('applySavedItemQuoteChanges') &&
    builder.includes('item.notes = existingNotes'),
  'Applying saved-item changes should preserve per-quote job notes'
);

assert(
  builder.includes('savedItemQuoteChangeFieldDiffs') &&
    builder.includes('Description changed') &&
    builder.includes('Name changed') &&
    builder.includes('toggleSavedItemQuoteChangeDiff'),
  'Saved item update modal should show clickable field-change chips for name and description before/after details'
);
