const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  source.includes('Job-specific Note (Optional)'),
  'Add/edit line item modal should label the per-quote note separately from the saved item description'
);

assert(
  source.includes('quote-item-job-note'),
  'Quote builder rows should render job-specific notes with a distinct class'
);

assert(
  source.includes('Job note:'),
  'Rendered line item notes should be labeled as job notes'
);

assert(
  /var descBlocks = \[document\.getElementById\(id\), document\.getElementById\(id \+ '_notes'\)\]\.filter\(Boolean\);/.test(source) &&
    /descBlocks\.forEach/.test(source),
  'Description toggle should expand and collapse both the reusable description and the job note'
);

assert(
  source.includes('function getVisibleLineItemNote') &&
    source.includes('qdLineItemTextKey(note) === qdLineItemTextKey(description)') &&
    source.includes('const visibleJobNote = getVisibleLineItemNote(item, displayItemDescription);'),
  'Quote builder should suppress exact duplicate imported descriptions from job-note display'
);

assert(
  source.includes('qdTemplateEscapeHtml(visibleJobNote)'),
  'Line item notes should be escaped when rendered'
);

assert(
  source.includes('item.notes = notes;') && source.includes('notes,'),
  'Line item notes should continue to save on edited and newly added quote items'
);

assert(
  source.includes('function editLineItemNote(') &&
    source.includes("document.getElementById('lineNotes').focus()") &&
    source.includes('Add job note') &&
    source.includes('fa-sticky-note'),
  'Rows should provide a dedicated note action that opens the item editor focused on the job note'
);

assert(
  source.includes('id="lineItemDescription"') &&
    source.includes('Reusable Item Description') &&
    source.includes("document.getElementById('lineItemDescription').value"),
  'Add/edit line item modal should include a reusable item description field separate from the item name and job note'
);

assert(
  source.includes('modal-dialog modal-xl modal-dialog-scrollable line-item-editor-dialog') &&
    source.includes('#addLineModal .line-item-editor-dialog') &&
    source.includes('max-width: 1440px') &&
    source.includes('height: calc(100vh - 4rem)'),
  'Regular and Copilot line-item editors should share the large scrollable modal layout'
);

assert(
  source.includes('height: calc(100dvh - 1rem)') &&
    source.includes('#addLineModal .modal-footer { gap: 0.5rem; padding: 0.75rem; }'),
  'The enlarged line-item modal should retain a compact viewport-safe mobile layout'
);

const saveLineItemBlock = source.slice(
  source.indexOf('function saveLineItemToDatabase()'),
  source.indexOf('function toggleDepositSection()')
);

assert(
  (saveLineItemBlock.includes('rate: rate') || saveLineItemBlock.includes('newItem.rate = rate')) &&
    (saveLineItemBlock.includes('materialCost: materialCost') || saveLineItemBlock.includes('newItem.materialCost = materialCost')) &&
    (saveLineItemBlock.includes('unitType: unitType') || saveLineItemBlock.includes('newItem.unitType = unitType')) &&
    (saveLineItemBlock.includes('itemDescription: itemDescription') || saveLineItemBlock.includes('newItem.itemDescription = itemDescription')),
  'Saving a new quote line item to the database should persist rate, material cost, unit type, and reusable description'
);

assert(
  saveLineItemBlock.includes('_doBackupItemsToCloud(customItems)') || saveLineItemBlock.includes('backupItemsToCloud(customItems)'),
  'Saving a new quote line item to the database should use the cloud snapshot backup path'
);

assert(
  !/newItem\s*=\s*{[^}]*notes\s*:/s.test(saveLineItemBlock) &&
    !/saveItem\(\{[^}]*notes\s*:/s.test(saveLineItemBlock),
  'Saving a reusable line item should not persist job-specific notes to the item database'
);
