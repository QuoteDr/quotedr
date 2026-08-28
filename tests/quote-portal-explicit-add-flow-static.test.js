const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const quoteStyle = fs.readFileSync('quote-style.js', 'utf8');

assert(
  quoteStyle.includes('onclick="addCurrentQuoteToPortal()" id="openQuotePortalBtn"') &&
    quoteStyle.includes('<i class="fas fa-folder-plus me-1"></i>Add to Portal') &&
    !quoteStyle.includes('Choose Portal &amp; Open') &&
    !builder.includes('Open Locked Portal'),
  'The portal share modal should present one explicit Add to Portal action for normal quotes and change orders'
);

assert(
  quoteStyle.includes('id="sendQuoteEmailBtn" disabled') &&
    quoteStyle.includes('id="copyQuotePortalLinkBtn" disabled') &&
    quoteStyle.includes('Add to portal first to create your link!') &&
    /function setQuotePortalLinkActionsReady\(ready, message\) \{[\s\S]*?sendQuoteEmailBtn[\s\S]*?copyQuotePortalLinkBtn[\s\S]*?button\.disabled = ready !== true/.test(builder),
  'Email and copy controls should start disabled with a clear Add to Portal first explanation'
);

assert(
  /function renderQuotePortalShareContext\(quoteData, portal, error\) \{[\s\S]*?portalReady = !!window\._currentQuotePortalUrl && quoteData && quoteData\.portal_visible === true[\s\S]*?setQuotePortalLinkActionsReady\(portalReady\)[\s\S]*?setQuotePortalAddButtonState\(portalReady \? 'added' : 'ready'\)/.test(builder) &&
    /async function finishQuotePortalAssignment\(portal\) \{[\s\S]*?ensureQuotePortalUrl\(resultEl, portal\)[\s\S]*?renderQuotePortalShareContext\(window\._currentQuoteData \|\| getCurrentQuoteDataForPortal\(\), portal, null\)/.test(builder),
  'Successful portal publication should unlock link actions and mark the add step complete'
);

assert(
  /async function addCurrentQuoteToPortal\(\) \{[\s\S]*?window\._quotePortalHoldRedirectForSharing = true[\s\S]*?openQuotePortalAssignment\(\{ keepShareModalOpen: true \}\)/.test(builder) &&
    /async function openQuotePortalAssignment\(options\) \{[\s\S]*?quotePortalDocumentIsChangeOrder\(quoteData\)[\s\S]*?resolveChangeOrderLockedPortal\(quoteData\)[\s\S]*?finishQuotePortalAssignment\(lockedPortal\)/.test(builder),
  'Add to Portal should open the chooser for a normal quote and automatically publish a change order to its locked parent portal'
);

assert(
  /function armQuotePortalLockRedirect\(quoteData\) \{[\s\S]*?window\._quotePortalHoldRedirectForSharing[\s\S]*?window\._quotePortalRedirectAfterShareModal = true/.test(builder) &&
    /function finishQuotePortalShareModal\(\) \{[\s\S]*?window\._quotePortalHoldRedirectForSharing = false[\s\S]*?redirectPortalLockedQuoteBuilderToDashboard\(\)/.test(builder) &&
    quoteStyle.includes("finishQuotePortalShareModal()"),
  'The builder should lock immediately after publication while keeping only the share modal available until it closes'
);

assert(
  /async function shareCurrentQuotePortal\(action\) \{[\s\S]*?if \(!window\._currentQuotePortalUrl \|\| quoteData\.portal_visible !== true\) \{[\s\S]*?explainQuotePortalLinkGate\(\)[\s\S]*?performQuotePortalAction\(window\._currentQuotePortalUrl, action\)/.test(builder) &&
    /async function sendQuoteByEmail\(\) \{[\s\S]*?if \(!window\._currentQuotePortalUrl \|\| qData\.portal_visible !== true\) \{[\s\S]*?explainQuotePortalLinkGate\(\)/.test(builder),
  'Copy and email handlers should never create or choose a portal implicitly'
);

console.log('quote portal explicit add flow static checks passed');
