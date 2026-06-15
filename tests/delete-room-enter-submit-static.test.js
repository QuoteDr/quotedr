const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');

assert(
  dialogs.includes('opts.enterSubmits') &&
    dialogs.includes("event.key !== 'Enter'") &&
    dialogs.includes('ok.click()') &&
    dialogs.includes("el.removeEventListener('keydown', onEnterSubmit)"),
  'QuoteDr dialogs should support an opt-in Enter key primary action'
);

assert(
  builder.includes("title: 'Delete Room'") &&
    builder.includes("okText: 'Delete'") &&
    builder.includes('enterSubmits: true'),
  'Delete Room confirmation should opt into Enter submitting the Delete button'
);
