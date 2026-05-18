const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('id="mobileActionBar"'), 'quote builder should include the mobile action bar');
assert(
  /body\.modal-open\s+#mobileActionBar\s*\{[^}]*display:\s*none\s*!important/i.test(source),
  'mobile action bar should hide while Bootstrap modals are open'
);

console.log('mobile action bar modal static test passed');
