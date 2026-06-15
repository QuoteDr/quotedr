const fs = require('fs');
const assert = require('assert');

const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');

assert(
  dialogs.includes('opts.enterSubmits = opts.enterSubmits !== false') &&
    dialogs.includes("opts.okText = opts.okText || 'Got it'") &&
    dialogs.includes('return qdDialog(opts);'),
  'QuoteDr alerts should let Enter trigger the Got it button by default'
);

assert(
  dialogs.includes('function onEnterSubmit(event)') &&
    dialogs.includes('ok.click()'),
  'QuoteDr dialog should include the shared Enter submit handler'
);
