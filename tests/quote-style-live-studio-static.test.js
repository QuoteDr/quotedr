const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const style = fs.readFileSync('quote-style.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  builder.includes('class="quote-style-studio-layout"') &&
    builder.includes('id="quoteStyleControlsPane"') &&
    builder.includes('id="quoteStylePreviewPane"') &&
    builder.includes('width: 96vw') &&
    builder.includes('height: 94dvh'),
  'Send Quote Settings should use a near-full-screen two-pane studio layout'
);

assert(
  builder.includes('id="quoteStyleMobileControlsBtn"') &&
    builder.includes('id="quoteStyleMobilePreviewBtn"') &&
    builder.includes('data-mobile-pane="controls"'),
  'Narrow screens should provide dedicated Controls and Preview views'
);

assert(
  builder.includes('id="quoteStylePreviewFrame"') &&
    builder.includes('src="about:blank"') &&
    builder.includes('interactive-quote-viewer.html?quote_studio=1&amp;preview=1&amp;admin_preview=1'),
  'The real quote viewer should be lazy-loaded in safe studio preview mode'
);

assert(!builder.includes('id="stylePreview"'), 'The old simulated preview card should be removed');

assert(
  builder.includes('body.quote-style-studio-open #qdAiBtn') &&
    style.includes("classList.add('quote-style-studio-open')") &&
    style.includes("classList.remove('quote-style-studio-open')"),
  'The floating AI assistant should stay behind the studio instead of covering mobile controls'
);

assert(
  style.includes("type: 'quotedr-quote-studio-document'") &&
    style.includes("type: 'quotedr-quote-studio-style'") &&
    style.includes('function buildQuoteStudioSnapshot()') &&
    style.includes('function queueQuoteStudioStyleUpdate()') &&
    style.includes('}, 100);'),
  'The builder should send one quote snapshot and lightweight debounced style updates'
);

assert(
  style.includes("event.origin !== window.location.origin") &&
    style.includes('event.source !== frame.contentWindow') &&
    style.includes("modalEl.addEventListener('shown.bs.modal', prepareQuoteStyleStudio"),
  'Studio messaging should validate its same-origin iframe and initialize only when opened'
);

assert(
  viewer.includes("const quoteStudioMode = quoteStudioParams.get('quote_studio') === '1'") &&
    viewer.includes("postQuoteStudioMessage('quotedr-quote-studio-ready')") &&
    viewer.includes("data.type === 'quotedr-quote-studio-document'") &&
    viewer.includes("data.type === 'quotedr-quote-studio-style'") &&
    viewer.includes('renderViewerDocument({ preserveScroll: true })'),
  'The real client viewer should accept live document and style updates while preserving scroll'
);

assert(
  /if \(quoteStudioMode\) \{\s*initializeQuoteStudioMode\(\);\s*return;\s*\}\s*\n\s*await loadQuoteFromURL\(\)/.test(viewer),
  'Studio mode should bypass normal URL and cloud quote loading'
);

assert(
  viewer.includes("!quoteStudioMode && typeof loadLogoFromSupabase === 'function'") &&
    viewer.includes("!quoteStudioMode && typeof loadBusinessProfile === 'function'"),
  'Studio mode should not make background logo or business-profile requests'
);

assert(
  /function submitUpgrades\(event\) \{\s*if \(isContractorPreviewView\(\)\)/.test(viewer) &&
    /async function declineChangeOrder\(\)[\s\S]*if \(isContractorPreviewView\(\)\)/.test(viewer) &&
    /async function handleDepositPayment\(\)[\s\S]*if \(isContractorPreviewView\(\)\)/.test(viewer),
  'Client submissions, declines, and payments should remain blocked in preview mode'
);

console.log('quote style live studio static checks passed');
