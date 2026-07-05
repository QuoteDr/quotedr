const assert = require('node:assert');
const fs = require('node:fs');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const quoteStyle = fs.readFileSync('quote-style.js', 'utf8');

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\n\\s*\\}', 'm'));
  assert(match, `${selector} block should exist`);
  return match[1];
}

[
  '--change-order-accent',
  '--change-order-surface',
  '--change-order-border-soft'
].forEach((token) => {
  assert(viewer.includes(token), `client change-order viewer should expose ${token} from saved style`);
});

assert(
  viewer.includes('function resolveViewerDocumentStyle') &&
    viewer.includes('quoteData.changeOrderContext?.parent?.data?.style') &&
    viewer.includes('var viewerStyle = resolveViewerDocumentStyle();') &&
    viewer.includes('var accent = viewerStyle.accent ||'),
  'client change-order viewer should inherit the parent quote/invoice viewer style when rendering existing change orders'
);

assert(
  /ownerResult[\s\S]*QuoteDrChangeOrders\.isChangeOrder\(ownerResult\.data\)[\s\S]*QuoteDrChangeOrders\.fetchContext/.test(viewer),
  'admin preview change-order loads should fetch parent context so they can inherit the parent viewer style'
);

[
  '.change-order-summary',
  '.change-order-price-card',
  '.viewer-change-order-item-changed',
  '.viewer-change-order-note'
].forEach((selector) => {
  const block = cssBlock(viewer, selector);
  assert(
    /var\(--change-order-(accent|surface|border-soft)/.test(block),
    `${selector} should inherit the saved quote/invoice theme through change-order CSS variables`
  );
  assert(
    !/#(f0ad4e|f59e0b|fff8e1|fff7ed|fed7aa|17a2b8|bee5eb|f3fcff)/i.test(block),
    `${selector} should not use a fixed change-order colour scheme`
  );
});

[
  '.change-order-banner',
  '.change-order-price-summary',
  'body.change-order-mode .co-item-changed'
].forEach((selector) => {
  const block = cssBlock(builder, selector);
  assert(
    /var\(--change-order-(accent|surface|border-soft)/.test(block),
    `${selector} should use the same themeable change-order variables in the builder preview`
  );
  assert(
    !/#(f0ad4e|fff8e1|ffe08a|f0d98c|6b4e00)/i.test(block),
    `${selector} should not hard-code the old orange change-order palette`
  );
});

assert(
  builder.includes('function resolveChangeOrderParentStyle') &&
    builder.includes('var parentStyle = resolveChangeOrderParentStyle(parentData);') &&
    /window\._loadedQuoteData = Object\.assign\(\{\}, window\._loadedQuoteData \|\| \{\}, \{[\s\S]*style: parentStyle/.test(builder),
  'starting a change order should carry the original quote/invoice viewer style into the editable copy'
);

assert(
  builder.includes("if (parentStyle && typeof applyQuoteStyleToControls === 'function')") &&
    builder.includes('applyQuoteStyleToControls(parentStyle);'),
  'starting a change order should seed the quote-send style controls from the original document style'
);

assert(
  quoteStyle.includes('function getActiveQuoteStyleForSend') &&
    quoteStyle.includes('var activeStyle = getActiveQuoteStyleForSend();') &&
    quoteStyle.includes('applyQuoteStyleToControls(Object.assign({}, savedDefault, activeStyle));'),
  'quote send settings should prefer the active document style over global defaults when a saved quote/change order has one'
);

console.log('change-order theme inheritance static checks passed');
