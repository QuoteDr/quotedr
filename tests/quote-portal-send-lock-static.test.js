const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const quoteStyle = fs.readFileSync('quote-style.js', 'utf8');

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
    builder.includes("document.documentElement.setAttribute('data-quote-portal-locked', 'true')") &&
    builder.includes('setTimeout(redirectPortalLockedQuoteBuilderToDashboard, 0)'),
  'After publishing, the builder should immediately arm the dashboard redirect and mark the page locked'
);

assert(
  /function redirectPortalLockedQuoteBuilderToDashboard\(\) \{[\s\S]*?clearPortalLockedBuilderRestoreState\(\)[\s\S]*?window\.location\.replace\('dashboard\.html'\)/.test(builder) &&
    !builder.includes('quotePortalLockModalStillOpen()'),
  'Portal publication should clear editable restore state and leave for the dashboard without waiting for a modal to close'
);

assert(
  /function armQuotePortalLockRedirect\(quoteData\) \{[\s\S]*?if \(window\._resumeQuoteEmailAfterPortal\) \{[\s\S]*?window\._quotePortalRedirectAfterEmail = true;[\s\S]*?if \(window\._resumeQuotePortalAction\) \{[\s\S]*?window\._quotePortalRedirectAfterShare = true;[\s\S]*?setTimeout\(redirectPortalLockedQuoteBuilderToDashboard, 0\)/.test(builder) &&
    builder.includes('function finishDeferredQuotePortalRedirect()') &&
    builder.includes('function finishDeferredQuotePortalShareRedirect()') &&
    /async function sendQuoteByEmail\(\) \{[\s\S]*?Please enter a valid email address[\s\S]*?finishDeferredQuotePortalRedirect\(\)[\s\S]*?portalUrl = window\._currentQuotePortalUrl \|\| await ensureQuotePortalUrl\(resultEl\)[\s\S]*?quoteUrl: portalUrl[\s\S]*?finally \{[\s\S]*?finishDeferredQuotePortalRedirect\(\)/.test(builder) &&
    /async function shareCurrentQuotePortal\(action\) \{[\s\S]*?window\._resumeQuotePortalAction = action[\s\S]*?openQuotePortalAssignment\(\{ resumeQuotePortalAction: action \}\)[\s\S]*?performQuotePortalAction\(portalUrl, action\)/.test(builder),
  'Portal-assisted email should finish sending before the locked builder redirects'
);

assert(
  builder.includes('window._loadedQuoteData = Object.assign({}, window._loadedQuoteData || {}, quoteData);'),
  'Published portal metadata should update loaded quote state so autosave and builder lock guards see portal_visible'
);

assert(
  /async function ensureQuotePortalUrl\(statusEl, portal\) \{[\s\S]*?window\._quotePortalPublishInProgress = true;[\s\S]*?portalSaveConfirmed = [^;]+;[\s\S]*?finally \{[\s\S]*?window\._quotePortalPublishInProgress = false;[\s\S]*?quoteStorageExitPortalLockedBuilder\(lockedData\)/.test(builder),
  'ensureQuotePortalUrl should defer the lock exit until portal save and secure-link work settle'
);

assert(
  storage.includes("window.addEventListener('quotedr-quote-portal-locked'") &&
    /function applyQuoteCloudAcknowledgement\(event\) \{[\s\S]*?operation\.payload\.portal_visible === true[\s\S]*?quoteStorageExitPortalLockedBuilder\(operation\.payload\)/.test(storage) &&
    /function quoteStorageHandleRemoteSignal\(signal\) \{[\s\S]*?quoteIsPortalLockedForBuilder\(latest\.data\)[\s\S]*?quoteStorageExitPortalLockedBuilder\(latest\.data\)/.test(storage),
  'Conflict recovery acknowledgements and remote portal locks should both eject the active builder'
);

assert(
  /function quoteStoragePortalExitActive\(\) \{[\s\S]*?data-quote-portal-locked/.test(storage) &&
    /function saveSessionQuote\(\) \{[\s\S]*?quoteStoragePortalExitActive\(\)/.test(storage) &&
    /async function doAutoSave\(options\) \{[\s\S]*?reason: 'portal_locked'/.test(storage) &&
    (builder.match(/beforeunload[\s\S]{0,220}quoteStoragePortalExitActive/g) || []).length >= 2,
  'Portal lock exit should cancel autosave/session restore and suppress both unload handlers'
);

assert(
  /target\.requireCurrentQuoteBase === true && current\.data && current\.data\.portal_visible === true/.test(supabase) &&
    /operationPublishesPortalQuote\(operation\)[\s\S]*?deleteStoreValue\(OUTBOX_STORE, current\.key\)/.test(coordinator) &&
    /isPortalLockedError\(error\)[\s\S]*?markPortalLocked\(latest, error\)/.test(coordinator),
  'Queued builder writes should be discarded and blocked after the portal lock without blocking dashboard portal management'
);

assert(
  (quoteStyle.match(/err && err\.code === 'PORTAL_LOCKED'/g) || []).length >= 2 &&
    /err && err\.code === 'PORTAL_LOCKED'[\s\S]*?return;[\s\S]*?alert\('Failed to save quote to cloud:/.test(quoteStyle),
  'Generate and preview should redirect a server-confirmed portal lock without showing the obsolete native save-failure alert'
);
