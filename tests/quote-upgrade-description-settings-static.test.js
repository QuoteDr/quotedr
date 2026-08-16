const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const style = fs.readFileSync('quote-style.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  builder.includes('id="quoteUpgradeDetailsDefault"') &&
    builder.includes('<option value="collapsed">Collapsed by default</option>') &&
    builder.includes('<option value="expanded">Expanded by default</option>'),
  'Send Quote Settings should expose an accessible collapsed or expanded upgrade-detail default'
);

assert(
  builder.includes('id="quoteUpgradeDescriptionPreviewLength" min="120" max="600" step="20" value="260"') &&
    builder.includes('id="quoteUpgradeDescriptionPreviewLengthValue"'),
  'Send Quote Settings should expose a dedicated upgrade-description length slider'
);

assert(
  style.includes('upgradeDescriptionPreviewLength: 260') &&
    style.includes('upgradeDescriptionsExpanded: false') &&
    style.includes("style.upgradeDescriptionsExpanded = document.getElementById('quoteUpgradeDetailsDefault')?.value === 'expanded'") &&
    style.includes("setFieldValue('quoteUpgradeDetailsDefault', _quoteStyle.upgradeDescriptionsExpanded ? 'expanded' : 'collapsed')") &&
    style.includes("setFieldValue('quoteUpgradeDescriptionPreviewLength', _quoteStyle.upgradeDescriptionPreviewLength)"),
  'Upgrade-detail presentation should persist in quote style, default closed, and restore into the controls'
);

assert(
  style.includes("'quoteUpgradeDetailsDefault','quoteUpgradeDescriptionPreviewLength'") &&
    style.includes('updateUpgradeDescriptionPreviewControls();') &&
    style.includes('queueQuoteStudioStyleUpdate();'),
  'Both upgrade controls should update the live client preview'
);

assert(
  viewer.includes('function renderExpandableUpgradeDescription(text, id)') &&
    viewer.includes('viewerStyle.upgradeDescriptionPreviewLength') &&
    viewer.includes('if (!isFinite(limit)) limit = fallbackLimit;') &&
    viewer.includes('resolveViewerDocumentStyle().upgradeDescriptionsExpanded === true') &&
    viewer.includes("(descriptionsExpanded ? '' : 'd-none ')") &&
    viewer.includes("(descriptionsExpanded ? 'Hide' : 'Details')"),
  'The client viewer should honor both settings and retain legacy length fallbacks'
);

assert(
  !style.includes('upgradeDescriptionPreviewLength *') &&
    !viewer.includes('upgradeDescriptionPreviewLength *'),
  'Upgrade presentation settings must not participate in pricing calculations'
);

console.log('quote upgrade description settings static checks passed');
