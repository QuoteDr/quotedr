const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  builder.includes('function confirmQuotePortalLockBeforePublish(') &&
    builder.includes('You will not be able to edit this file once it is in the portal') &&
    builder.includes("okText: 'Continue'"),
  'Adding a quote to a portal from the send modal should warn that the quote will be locked'
);

assert(
  /async function ensureQuotePortalUrl\(statusEl, portal\) \{[\s\S]*?var quoteWillBecomePortalLocked = quoteData\.portal_visible !== true;[\s\S]*?await confirmQuotePortalLockBeforePublish\(quoteData\);[\s\S]*?quoteData = markQuoteForPortal\(quoteData, portal\);/.test(builder),
  'ensureQuotePortalUrl should confirm the lock before marking a quote portal-visible'
);

assert(
  builder.includes('function armQuotePortalLockRedirect(') &&
    builder.includes('window._quoteLockedAfterPortalPublish = true') &&
    builder.includes("hidden.bs.modal") &&
    builder.includes('quotePortalLockModalStillOpen()'),
  'After publishing, the builder should arm a dashboard redirect that waits until send/portal modals close'
);

assert(
  builder.includes('window._loadedQuoteData = Object.assign({}, window._loadedQuoteData || {}, quoteData);'),
  'Published portal metadata should update loaded quote state so autosave and builder lock guards see portal_visible'
);

assert(
  /window\._currentQuoteData = quoteData;[\s\S]*?window\._loadedQuoteData = Object\.assign\(\{\}, window\._loadedQuoteData \|\| \{\}, quoteData\);[\s\S]*?if \(quoteWillBecomePortalLocked\) armQuotePortalLockRedirect\(quoteData\);/.test(builder),
  'ensureQuotePortalUrl should preserve portal lock metadata and arm redirect after a successful save'
);
