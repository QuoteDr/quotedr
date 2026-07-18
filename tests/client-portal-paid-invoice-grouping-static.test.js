const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');

assert(
  /function documentNeedsAction\(quote\)\s*\{\s*if \(documentIsInvalid\(quote\)\) return false;\s*if \(documentIsCompleted\(quote\)\) return false;/.test(portal),
  'Invalid and paid/completed documents should never be classified as needing action'
);

assert(
  /show === 'needs_action'\) return needsAction && !documentIsCompleted\(quote\);/.test(portal),
  'Needs Action filter should exclude completed paid documents'
);

assert(
  /parents\.filter\(function\(q\) \{ return !documentIsInvalid\(q\) && documentNeedsAction\(q\) && !documentIsCompleted\(q\); \}\)/.test(portal),
  'Grouped Needs Action section should be mutually exclusive from invalid and Completed documents'
);
