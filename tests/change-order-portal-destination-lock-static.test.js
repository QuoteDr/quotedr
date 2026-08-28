const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const quoteStyle = fs.readFileSync('quote-style.js', 'utf8');

assert(
  quoteStyle.includes('id="changeOrderPortalLockHelpBtn"') &&
    quoteStyle.includes('onclick="showChangeOrderPortalLockHelp()"') &&
    quoteStyle.includes("await prepareQuotePortalShareContext()"),
  'The share modal should prepare and explain a change order locked destination before it opens'
);

assert(
  /async function resolveChangeOrderLockedPortal\(quoteData\) \{[\s\S]*?quotePortalParentId\(quoteData\)[\s\S]*?loadInvoicePortalCandidates\(\)[\s\S]*?String\(row && row\.id \|\| ''\) === parentId[\s\S]*?portalFromQuoteSummaryRow\(parentRow\)/.test(builder),
  'A change order destination should be resolved from its linked original quote, not by client-name guessing'
);

assert(
  /function portalFromQuoteSummaryRow\(row\) \{[\s\S]*?data\.portal_visible !== true[\s\S]*?invoicePortalRowKey\(row\)[\s\S]*?id: portalId[\s\S]*?secureToken: data\.portal_share_token/.test(builder),
  'The locked destination should require the original quote to be portal-visible, support legacy portals, and preserve its stable portal share'
);

assert(
  /async function ensureQuotePortalUrl\(statusEl, portal\) \{[\s\S]*?typeof enforceChangeOrderPortalDestination === 'function'[\s\S]*?portal = await enforceChangeOrderPortalDestination\(quoteData, portal\)/.test(builder) &&
    /async function enforceChangeOrderPortalDestination\(quoteData, requestedPortal\) \{[\s\S]*?requestedPortal\.id[\s\S]*?String\(lockedPortal\.id\)[\s\S]*?throw new Error\('Change orders can only be shared/.test(builder),
  'The central portal publish path should reject any destination other than the parent quote portal'
);

assert(
  /async function openQuotePortalAssignment\(options\) \{[\s\S]*?quotePortalDocumentIsChangeOrder\(quoteData\)[\s\S]*?finishQuotePortalAssignment\(lockedPortal\)/.test(builder) &&
    /async function createPortalForCurrentQuote\(\) \{[\s\S]*?quotePortalDocumentIsChangeOrder\(quoteData\)[\s\S]*?Change orders must use the original quote/.test(builder),
  'Change orders should skip portal choice/creation and automatically use the locked parent portal'
);

assert(
  builder.includes("title: 'Why This Portal Is Locked'") &&
    builder.includes('Duplicate As Revision') &&
    builder.includes("window.open('dashboard.html', '_blank', 'noopener')"),
  'The lock help should explain the revision workflow without discarding the in-progress change order'
);

assert(
  builder.includes('This change order is already assigned to a different portal. QuoteDr stopped the send') &&
    builder.includes('The original quote is not currently in a client portal.'),
  'Cross-portal mismatches and missing parent portals should fail closed'
);

console.log('change-order portal destination lock static checks passed');
