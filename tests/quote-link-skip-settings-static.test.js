const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes('id="quoteSkipSettingsOnGenerate"'), 'quote settings modal should include a skip-on-generate checkbox');
assert(html.includes('Skip this menu on quote link generation'), 'skip checkbox should use clear user-facing copy');
assert(styleSource.includes("skipSettingsOnGenerate: false"), 'quote style defaults should include the skip preference');
assert(styleSource.includes("setFieldValue('quoteSkipSettingsOnGenerate'"), 'saved skip preference should apply back to the modal control');
assert(styleSource.includes("document.getElementById('quoteSkipSettingsOnGenerate')?.checked === true"), 'modal control should be read into quote style state');
assert(styleSource.includes('async function saveQuoteStyleSkipPreference'), 'skip preference should persist without requiring full default save');
assert(styleSource.includes('skipSettingsOnGenerate: !!skip'), 'skip preference save should update only the skip flag');
assert(
  /async function generateInteractiveLink\(\)[\s\S]*await initStyleModal\(\)[\s\S]*if \(_quoteStyle\.skipSettingsOnGenerate\)[\s\S]*await confirmGenerateQuote\(\)[\s\S]*return[\s\S]*openQuoteSendSettingsModal\(false\)/.test(styleSource),
  'generate quote link should bypass the settings modal only when the saved skip preference is enabled'
);
assert(styleSource.includes("'quoteSkipSettingsOnGenerate'"), 'skip checkbox should be included in modal change/input bindings');

console.log('quote link skip settings static test passed');
