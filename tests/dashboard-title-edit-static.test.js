const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('function isTitleEditing('),
  'Dashboard should have a central title edit state check'
);

assert(
  dashboard.includes('if (isTitleEditing(quoteId)) return;'),
  'openQuote should not navigate while that quote title is being edited'
);

assert(
  dashboard.includes('onclick="event.stopPropagation()"') &&
    dashboard.includes('onmousedown="event.stopPropagation()"'),
  'Title edit container should stop clicks and pointer events from bubbling to the quote opener'
);

assert(
  dashboard.includes('event.stopPropagation();saveTitle(') &&
    dashboard.includes('event.stopPropagation();cancelEditTitle('),
  'Title edit check/cancel buttons should finish editing without opening the quote'
);

console.log('dashboard title edit static test passed');
