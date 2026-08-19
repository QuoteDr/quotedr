const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('const JUNK_RETENTION_DAYS = 30'),
  'Dashboard junk retention should be 30 days'
);

assert(
  dashboard.includes('id="junkCountBadge"') && dashboard.includes('function openJunkBox()'),
  'Dashboard should expose a Junk button and modal opener'
);

assert(
  dashboard.includes('id="junkBoxModal"') && dashboard.includes('id="junkBoxBody"'),
  'Dashboard should include a Junk modal'
);

assert(
  dashboard.includes('function quoteIsJunked(quote)') &&
  dashboard.includes('function setDashboardQuotesFromCloud(rows)') &&
  dashboard.includes('function purgeExpiredJunkQuotes(rows)'),
  'Dashboard should partition active and junk quotes and purge expired junk'
);

assert(
  dashboard.includes('data.junk_deleted_at = now.toISOString()') &&
  dashboard.includes('data.junk_delete_after = new Date(now.getTime() + JUNK_RETENTION_MS).toISOString()') &&
  dashboard.includes('data = await preparePortalDocumentForJunk(quote, dashboardPortalForDocument(quote))'),
  'Dashboard delete should preserve the portal before soft-deleting its document'
);

assert(
  dashboard.includes('function restoreQuoteFromJunk(quoteId)') &&
  dashboard.includes('delete data.junk_deleted_at') &&
  dashboard.includes('data.portal_visible = wasPortalVisible'),
  'Junk restore should remove junk metadata and restore prior portal visibility'
);

assert(
  dashboard.includes('function permanentlyDeleteQuote(quoteId)') &&
  dashboard.includes('deleteQuoteFromSupabase(quoteId)'),
  'Junk should still allow permanent deletion'
);
