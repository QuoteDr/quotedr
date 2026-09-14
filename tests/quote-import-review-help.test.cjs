const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'quote-import.js'), 'utf8');
const state = { parsed: { quote: { rooms: [{}] } }, requiresReviewAcknowledgement: true };
let focused = 0, scrolled = 0, warning = '';
const button = { setAttribute(name, value) { this[name] = value; }, classList: { toggle() {} } };
const checkbox = { checked: false, scrollIntoView() { scrolled++; }, focus() { focused++; } };
const help = { hidden: true };
const elements = { quoteImportApplyBtn: button, quoteImportReviewAcknowledged: checkbox, quoteImportApplyHelp: help };
const context = { _quoteImportState: state, document: { getElementById: id => elements[id] }, setImportStatus: text => { warning = text; } };
vm.createContext(context);
for (const name of ['refreshQuoteImportApplyAvailability', 'showQuoteImportRequiredReview', 'applyImportedQuote']) {
  const start = source.search(new RegExp('    (?:async )?function ' + name + '\\('));
  const end = source.indexOf('\n    }', start) + 6;
  vm.runInContext(source.slice(start, end), context);
}
(async () => {
  context.refreshQuoteImportApplyAvailability();
  assert.equal(button.disabled, false, 'review-blocked button remains reachable by keyboard/touch');
  assert.equal(button['aria-disabled'], 'true');
  assert.equal(help.hidden, false);
  assert.match(button.title, /review checkbox/);
  await context.applyImportedQuote();
  assert.equal(focused, 1);
  assert.equal(scrolled, 1);
  assert.match(warning, /confirm the review checkbox/);
  assert.equal(checkbox.checked, false, 'navigation never acknowledges review for the user');
  checkbox.checked = true;
  context.refreshQuoteImportApplyAvailability();
  assert.equal(button['aria-disabled'], 'false');
  assert.equal(help.hidden, true);
  assert.equal(button.title, '');
  state.parsed = null;
  context.refreshQuoteImportApplyAvailability();
  assert.equal(button.disabled, true);
  assert.equal(help.hidden, true);
  console.log('Quote import review help and blocked-apply guard tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
