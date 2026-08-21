const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  builder.includes('<body class="quote-builder-document-closed">') &&
    builder.includes('id="quoteBuilderLauncher"') &&
    builder.includes('id="quoteBuilderWorkspace" class="container-fluid py-4" inert aria-hidden="true"') &&
    builder.includes('id="quoteBuilderStartNewBtn"') &&
    builder.includes('id="quoteBuilderOpenExistingBtn"'),
  'The builder must start in a closed launcher state with only New and Open entry points'
);

assert(
  storage.includes("workspace.toggleAttribute('inert', !isOpen)") &&
    storage.includes("workspace.setAttribute('aria-hidden', isOpen ? 'false' : 'true')"),
  'Closed builder controls must be inert to pointer and keyboard interaction'
);

assert(
  builder.includes('The builder only opens after a quote has been created or selected.') &&
    builder.includes('quoteStorageStartNewQuoteFlow()') &&
    builder.includes('quoteStorageOpenExistingFlow()'),
  'The launcher should explain the document requirement and wire both choices'
);

assert(
  builder.includes('quote-storage.js?v=2026082001') &&
    !builder.includes('generateQuoteNumber()') &&
    !builder.includes('randomizeQuoteNumber()') &&
    !builder.includes('nextQuoteNumber()'),
  'The builder must load the guarded storage bundle without manufacturing browser-only document numbers'
);

assert(
  storage.includes("var quoteStorageDocumentState = 'closed'") &&
    storage.includes("return quoteStorageDocumentState === 'open'") &&
    storage.includes("reason: 'no_open_quote'"),
  'Quote storage must use an explicit closed/open document contract'
);

assert(
  /function markUnsaved\(\) \{[\s\S]*?if \(!quoteStorageHasOpenDocument\(\)\) return;/.test(storage) &&
    /function saveSessionQuote\(\) \{[\s\S]*?if \(!quoteStorageHasOpenDocument\(\)\) return;/.test(storage) &&
    /async function doAutoSave\(options\) \{[\s\S]*?if \(!quoteStorageHasOpenDocument\(\)\) return \{ state: 'skipped', reason: 'no_open_quote' \};/.test(storage),
  'Dirty tracking, session snapshots, and autosave must remain inert until a quote is open'
);

assert(
  /async function saveQuote\(\) \{\s*if \(!quoteStorageRequireOpenDocument\('saving'\)\) return;/.test(storage) &&
    /function downloadQuoteFallback\(\) \{\s*if \(!quoteStorageRequireOpenDocument\('exporting'\)\) return;/.test(storage),
  'Manual save and export must also fail closed without an open quote'
);

assert(
  storage.includes("await qdLeavePage('dashboard.html?new=1')") &&
    storage.includes("window.location.replace('dashboard.html?new=1')") &&
    !storage.includes("window.location.href = 'quote-builder.html?new=1'"),
  'Every new-quote path must use the dashboard client setup instead of creating an empty builder document'
);

assert(
  dashboard.includes("dashboardParams.get('new') === '1'") &&
    dashboard.includes("dashboardParams.delete('new')") &&
    dashboard.includes('openNewQuoteModal();'),
  'The dashboard must automatically open its canonical client-aware New Quote flow'
);

assert(
  storage.includes("quoteStorageSetDocumentState('open');") &&
    storage.includes("quoteStorageSetDocumentState('loading', 'Opening the selected quote...')") &&
    storage.includes('The last quote is no longer available. Choose another quote or start a new one.'),
  'Successful loads should unlock the builder while missing/stale quote IDs return to the launcher'
);

assert(
  /@media \(max-width: 576px\)[\s\S]*?\.quote-builder-launcher-actions \{\s*grid-template-columns: 1fr;/.test(builder),
  'Launcher actions should stack for mobile use'
);

console.log('quote builder launcher guard static test passed');
