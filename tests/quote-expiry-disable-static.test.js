const fs = require('fs');
const path = require('path');

const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const quoteStyle = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('data-no-expiry="true"'), 'quote expiry controls should include a no-expiry preset button');
assert(builder.includes('No expiry'), 'quote expiry controls should label the no-expiry button clearly');
assert(quoteStyle.includes('function clearQuoteExpiry'), 'quote style module should expose a helper to clear quote expiry');
assert(quoteStyle.includes("expiryEl.value = ''"), 'clear quote expiry should blank the date input');
assert(quoteStyle.includes('function updateQuoteExpiryPresetButtons'), 'quote style module should centralize expiry preset active states');
assert(quoteStyle.includes("btn.getAttribute('data-no-expiry') === 'true'"), 'expiry preset state should recognize the no-expiry button');
assert(quoteStyle.includes("btn.classList.toggle('active', !expiryValue)"), 'no-expiry button should become active when expiry date is blank');
assert(quoteStyle.includes('window.clearQuoteExpiry = clearQuoteExpiry'), 'clear quote expiry helper should be callable from the modal button');

console.log('quote expiry disable static test passed');
