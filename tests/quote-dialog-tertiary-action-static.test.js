const fs = require('fs');
const assert = require('assert');

const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');

assert(dialogs.includes('id="qdDialogTertiary"'), 'branded dialogs should render an optional tertiary action');
assert(dialogs.includes("tertiary.style.display = opts.tertiaryText ? '' : 'none'"), 'tertiary action should remain hidden unless configured');
assert(dialogs.includes("opts.tertiaryValue !== undefined ? opts.tertiaryValue : 'tertiary'"), 'tertiary action should resolve its configured result');
assert(dialogs.includes('tertiary.onclick = null'), 'dialog cleanup should release the tertiary action handler');

console.log('quote dialog tertiary action static test passed');
