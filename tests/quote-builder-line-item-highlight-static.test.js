const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const viewerSource = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  source.includes('LINE_ITEM_HIGHLIGHTS'),
  'Quote builder should define reusable line item highlight colour presets'
);

assert(
  source.includes('function setLineItemHighlight('),
  'Quote builder should expose a function to set or clear a line item highlight'
);

assert(
  source.includes('item.highlightColor'),
  'Line item highlight choice should be stored on the quote item data'
);

assert(
  source.includes('quote-item-highlight-btn') &&
    source.includes('quote-item-highlight-swatch') &&
    source.includes('fa-highlighter'),
  'Line item rows should include a compact highlight picker button with colour swatches'
);

assert(
  source.includes('id="lineItemHighlightModal"') &&
    source.includes('function openLineItemHighlightModal(') &&
    source.includes('function renderLineItemHighlightModalOptions(') &&
    source.includes('data-room-id') &&
    source.includes('data-item-index'),
  'Line item highlight picker should open in a modal with a durable selected item context'
);

assert(
  source.includes('function setSelectedLineItemHighlights(') &&
    source.includes('function openSelectedLineItemHighlightModal(') &&
    source.includes('Highlight Selected...'),
  'the room Edit menu should apply one highlight colour to all selected line items'
);

assert(
  source.includes('id="lineItemHighlightModalTitle"') &&
    source.includes('id="lineItemHighlightModalMessage"') &&
    source.includes('Highlight Selected Items'),
  'the shared highlight modal should clearly identify bulk highlighting mode'
);

const highlightButtonSource = source.slice(
  source.indexOf('function renderLineItemHighlightButton('),
  source.indexOf('async function openProFeature(')
);

assert(
  !source.includes('quote-item-highlight-menu') &&
    !highlightButtonSource.includes('data-bs-toggle="dropdown"'),
  'Line item highlight picker should not use a table-cell dropdown that can be clipped behind rows'
);

assert(
  source.includes('.quote-items-table tr.quote-item-highlighted > td') &&
    source.includes('--line-highlight-bg') &&
    source.includes('--line-highlight-border'),
  'Highlighted line item rows should apply the faint background to table cells, not only the tr'
);

assert(
  source.includes("rowClassNames.push('quote-item-highlighted')") &&
    source.includes("rowStyles.push('--line-highlight-bg: ' + highlight.background)") &&
    source.includes("rowStyles.push('--line-highlight-border: ' + highlight.border)"),
  'Highlighted builder rows should render a cell-visible background and accent border'
);

assert(
  /delete room\.items\[itemIndex\]\.highlightColor/.test(source),
  'The highlight picker should include a clear option that removes the saved highlight'
);

assert(
  /saveSessionQuote\(\);/.test(source.slice(source.indexOf('function setLineItemHighlight('), source.indexOf('function openProFeature('))) &&
    /markUnsaved\(\);/.test(source.slice(source.indexOf('function setLineItemHighlight('), source.indexOf('function openProFeature('))),
  'Changing a line item highlight should save the local session immediately and mark the quote unsaved for cloud autosave'
);

assert(
  viewerSource.includes('VIEWER_LINE_ITEM_HIGHLIGHTS') &&
    viewerSource.includes('function getViewerLineItemHighlight(') &&
    viewerSource.includes('item.highlightColor'),
  'Interactive quote viewer should understand saved line item highlight colours'
);

assert(
  viewerSource.includes('viewer-line-item-highlighted') &&
    viewerSource.includes('--viewer-line-highlight-bg') &&
    viewerSource.includes('--viewer-line-highlight-border'),
  'Interactive quote viewer should render a faint highlighted background for highlighted items'
);

console.log('quote builder line item highlight static test passed');
