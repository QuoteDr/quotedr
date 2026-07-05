const assert = require('node:assert');
const fs = require('node:fs');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  viewer.includes('id="heroTotalLabel"') &&
    viewer.includes("heroLabel.textContent = isChangeOrder ? 'Current Adjustments' : 'Current Total'"),
  'change order client view should relabel the hero total as Current Adjustments'
);

[
  'function computeViewerChangeOrderTotals',
  'function viewerChangeOrderLineDelta',
  'function viewerChangeOrderLineDisplayTotal',
  'function viewerChangeOrderExplanation',
  'function toggleViewerChangeOrderExplanation',
  'function showChangeOrderExplainer',
  'function openChangeOrderExplainer'
].forEach((needle) => {
  assert(viewer.includes(needle), `${needle} should exist in interactive quote viewer`);
});

assert(
  viewer.includes('const coTotals = isChangeOrder ? computeViewerChangeOrderTotals() : null;') &&
    viewer.includes('coTotals.netChange') &&
    viewer.includes('coTotals.tax') &&
    viewer.includes('coTotals.updatedTotal'),
  'change order summary should use a dedicated computed totals model'
);

assert(
  viewer.includes('<span>This change order total</span><strong>' + "' + money(coTotals.netChange, true) + '") &&
    viewer.includes('<span>Tax on this change</span><strong>' + "' + money(coTotals.tax, true) + '"),
  'top change order breakdown should keep the existing rows but use computed net change and tax'
);

assert(
  viewer.includes('viewer-change-order-total-btn') &&
    viewer.includes('onclick="toggleViewerChangeOrderExplanation(') &&
    viewer.includes('viewer-change-order-note'),
  'changed change-order line totals should be clickable and reveal an inline explanation'
);

assert(
  viewer.includes('changeOrderExplainerModal') &&
    viewer.includes('Highlighted items show what changed') &&
    viewer.includes('Click any underlined price to see what changed') &&
    viewer.includes('openChangeOrderExplainer()'),
  'change order client view should explain highlighted rows and clickable price details'
);

assert(
  viewer.includes('const itemDisplayTotal = isChangeOrder ? viewerChangeOrderLineDisplayTotal(item, room) : viewerItemActiveTotal(item);') &&
    viewer.includes('const itemTotal = itemDisplayTotal;'),
  'change order line item display should show current/new full totals instead of net zero deltas'
);

assert(
  viewer.includes('viewer-change-order-item-changed') &&
    viewer.includes('viewer-change-order-item-added') &&
    viewer.includes('viewer-change-order-item-removed'),
  'change order line items should be visually marked by change status'
);

assert(
  builder.includes('taxLabel: taxLabel') &&
    builder.includes('taxRate: taxRate') &&
    builder.includes('taxEnabled: summary.taxEnabled !== false') &&
    builder.includes('symbol: symbol') &&
    builder.includes('netChange: netChange') &&
    builder.includes('updatedTotal: updatedTotal'),
  'builder should save complete change order price summary metadata for the viewer'
);

console.log('change order client view static checks passed');
