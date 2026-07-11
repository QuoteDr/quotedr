const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const quoteViewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');
const invoiceViewer = fs.readFileSync(path.join(root, 'invoice-viewer.html'), 'utf8');

assert(settings.includes('Quote Divider Wording'), 'settings should include the Quote Divider Wording preference');
assert(settings.includes('id="quoteDividerPreset"'), 'settings should include a divider wording preset selector');
assert(settings.includes('id="quoteDividerSingular"'), 'settings should include a singular divider wording field');
assert(settings.includes('id="quoteDividerPlural"'), 'settings should include a plural divider wording field');
assert(settings.includes('<option value="ask">Ask Every Time</option>'), 'settings should let users ask for divider wording on every new quote');
assert(settings.includes('dividerSingular'), 'settings should persist the singular divider label');
assert(settings.includes('dividerPlural'), 'settings should persist the plural divider label');
assert(settings.includes('dividerPromptMode'), 'settings should persist the divider prompt mode');
assert(settings.includes("presetEl.value === 'ask'"), 'settings should preserve ask mode when editing divider fields');

assert(dashboard.includes('id="quoteDividerPromptModal"'), 'dashboard should include a new quote divider wording prompt modal');
assert(dashboard.includes('function askQuoteDividerForNewQuote'), 'dashboard should prompt for divider wording when ask mode is enabled');
assert(dashboard.includes("dividerPromptMode === 'ask'"), 'dashboard should only prompt when ask mode is enabled');
assert(dashboard.includes('dividerSingular: dividerLabels.singular'), 'dashboard should save selected singular divider wording into new quote JSON');
assert(dashboard.includes('dividerPlural: dividerLabels.plural'), 'dashboard should save selected plural divider wording into new quote JSON');

assert(builder.includes('function getQuoteDividerLabels'), 'quote builder should read divider labels from quote preferences');
assert(builder.includes('function updateQuoteDividerLabels'), 'quote builder should refresh visible divider wording');
assert(builder.includes('id="changeQuoteDividerWordingBtn"'), 'quote builder add divider modal should include a Change Wording button');
assert(builder.includes('id="quoteDividerWordingModal"'), 'quote builder should include a per-quote divider wording modal');
assert(builder.includes('function openQuoteDividerWordingModal'), 'quote builder should open the per-quote divider wording modal');
assert(builder.includes('function setCurrentQuoteDividerLabels'), 'quote builder should save divider wording on the current quote only');
assert(builder.includes('window._currentQuoteData'), 'quote builder should prefer quote-specific divider labels before settings');
assert(builder.includes('data-divider-label="add-singular"'), 'quote builder toolbar should render Add with dynamic divider wording');
assert(builder.includes('data-divider-label="bottom-nav-plural"'), 'quote builder mobile nav should render dynamic plural divider wording');
assert(builder.includes("const emptyHeading = 'No ' + dividerLabels.pluralLower + ' yet'"), 'quote builder empty state should use dynamic divider wording');
assert(builder.includes("const emptyButton = 'Add Your First ' + dividerLabels.singular"), 'quote builder empty action should use dynamic divider wording');
assert(builder.includes("const addAnotherRoomLabel = 'Add Another ' + dividerLabels.singular"), 'quote builder bottom add-another action should use dynamic divider wording');

assert(quoteViewer.includes('function getQuoteDividerLabels'), 'interactive quote viewer should read divider labels from quote preferences');
assert(quoteViewer.includes('data-divider-label="find-singular"'), 'interactive quote viewer room finder should use dynamic divider wording');
assert(quoteViewer.includes('getQuoteRoomOptionPlaceholder'), 'interactive quote viewer should use a dynamic room picker placeholder');
assert(quoteViewer.includes('getQuoteDividerLabelSources'), 'interactive quote viewer should read divider labels from quote data and the loaded row');

assert(invoiceViewer.includes('function getQuoteDividerLabels'), 'invoice viewer should read divider labels from quote preferences');
assert(invoiceViewer.includes('data-divider-label="find-singular"'), 'invoice viewer room finder should use dynamic divider wording');
assert(invoiceViewer.includes('getQuoteRoomOptionPlaceholder'), 'invoice viewer should use a dynamic room picker placeholder');
assert(invoiceViewer.includes('getInvoiceDividerLabelSources'), 'invoice viewer should read divider labels from invoice data and the loaded row');

console.log('quote-divider-wording-static.test.js passed');
