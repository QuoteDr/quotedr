const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');

assert(
  dashboard.includes('function openQuote(quoteId)') &&
    dashboard.includes('handlePortalLockedQuoteOpen(quote)'),
  'Dashboard openQuote should route portal-visible documents through the edit lock'
);

assert(
  dashboard.includes('This document is already in a client portal and cannot be edited directly.') &&
    dashboard.includes('Remove From Portal & Edit') &&
    dashboard.includes('Duplicate As Revision'),
  'Portal edit lock should explain why editing is blocked and offer remove/duplicate paths'
);

assert(
  dashboard.includes('async function removeQuoteFromPortalAndEdit(') &&
    dashboard.includes('async function duplicateQuoteAsRevision('),
  'Dashboard should support removing from portal before editing and duplicating as a revision'
);

assert(
  dashboard.includes('clearPortalAssignmentForEdit') &&
    dashboard.includes('portal_visible = false') &&
    dashboard.includes('delete data.portal_added_at'),
  'Removing or duplicating should clear portal assignment data before editing'
);

assert(
  dashboard.includes('Added to portal:') &&
    dashboard.includes('formatPortalAddedAt'),
  'Dashboard should show when portal documents were added'
);

assert(
  storage.includes('function quoteIsPortalLockedForBuilder(') &&
    storage.includes('handlePortalLockedBuilderLoad(q)'),
  'Quote builder load path should also block direct edits of portal-visible documents'
);
