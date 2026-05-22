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
  source.includes('qdTemplateEscapeHtml(item.notes ||') || source.includes('qdTemplateEscapeHtml(item.notes)'),
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
