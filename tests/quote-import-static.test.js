const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const importerPath = path.join(__dirname, '..', 'quote-import.js');
assert(fs.existsSync(importerPath), 'quote-import.js should exist');

const builderHtml = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
assert(builderHtml.includes('openQuoteImportModal()'), 'quote builder should expose Import Old Quote from the Tools menu');
assert(builderHtml.includes('id="quoteImportModal"'), 'quote builder should include the legacy quote import modal');
assert(builderHtml.includes('quote-import.js'), 'quote builder should load quote-import.js');
assert(builderHtml.includes('quoteImportExportDebugBtn'), 'quote import modal should include a debug export button');
assert(builderHtml.includes('quoteImportDebugOutput'), 'quote import modal should include a visible debug output fallback');

const edgeFunctionPath = path.join(__dirname, '..', 'supabase', 'functions', 'quote-import', 'index.ts');
assert(fs.existsSync(edgeFunctionPath), 'quote-import edge function should exist');
const edgeSource = fs.readFileSync(edgeFunctionPath, 'utf8');
assert(edgeSource.includes("feature: 'quote_import'"), 'quote-import edge function should use the quote_import AI feature key');
assert(edgeSource.includes('dailyLimit: 150'), 'quote-import edge function should use the soft daily fair-use cap');
assert(edgeSource.includes('maxInputChars: 250000'), 'quote-import edge function should accept full legacy spreadsheet exports before chunking');
assert(edgeSource.includes('savedItemCandidates'), 'quote-import edge function should request saved item candidates');
assert(!edgeSource.includes('../_shared/'), 'quote-import edge function should be paste-deployable without shared local imports');
assert(edgeSource.includes('splitLegacyQuoteText'), 'quote-import edge function should split long legacy quotes instead of relying on one AI pass');
assert(edgeSource.includes('mergeImportedQuotePayloads'), 'quote-import edge function should merge chunked quote import results');
assert(edgeSource.includes('clientChunkIndex'), 'quote-import edge function should understand client-side chunk metadata');
assert(edgeSource.includes('finish_reason'), 'quote-import edge function should detect truncated AI output');
assert(edgeSource.includes('Leave job-specific notes blank during import'), 'quote-import prompt should keep imported descriptions out of job notes');
assert(edgeSource.includes('If an item has no quantity or unit'), 'quote-import prompt should ask missing quantity/unit items to default to each');

const source = fs.readFileSync(importerPath, 'utf8');
assert(source.includes('This may take a few minutes depending on quote size'), 'import loading state should set expectations for large quotes');
assert(source.includes('progress-bar-striped'), 'import loading state should show a progress bar');
assert(source.includes('Source subtotal'), 'import preview should compare imported work against the source subtotal');
assert(source.includes('Source grand total'), 'import preview should show the source grand total separately');
assert(!source.includes('Source total: $'), 'import preview should not compare imported subtotal directly against source grand total');
const context = {
  console,
  window: {},
  document: {
    addEventListener() {},
  },
};
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(source, context);

const importer = context.window.QuoteDrQuoteImport;
assert(importer, 'QuoteDrQuoteImport should be exposed on window');
assert(typeof importer.normalizeImportedQuote === 'function', 'normalizeImportedQuote should be exported');
assert(typeof importer.extractSavedItemCandidates === 'function', 'extractSavedItemCandidates should be exported');
assert(typeof importer.buildPdfPageTextFromItems === 'function', 'PDF page text builder should be exported for testing');
assert(typeof importer.buildSheetTextFromRows === 'function', 'spreadsheet text builder should be exported for testing');
assert(typeof importer.splitQuoteImportText === 'function', 'frontend should split large quote imports before calling the Edge Function');
assert(typeof importer.mergeImportedQuotePayloads === 'function', 'frontend should merge parsed import chunks');
assert(typeof importer.buildImportedQuoteCsv === 'function', 'frontend should build a CSV-friendly imported quote export');
assert(typeof importer.buildQuoteImportDebugPayload === 'function', 'frontend should build an import debug export bundle');
assert(typeof importer.getQuoteImportDebugPayload === 'function', 'frontend should expose the current debug payload for troubleshooting');
assert(typeof importer.recoverMissingSourceRows === 'function', 'frontend should recover clean source rows the AI missed');
assert(source.includes('clientChunkIndex'), 'frontend should send chunk position metadata to the Edge Function');
assert(source.includes('clientChunkTotal'), 'frontend should send chunk total metadata to the Edge Function');
assert(source.includes('clipboard.writeText'), 'debug export should copy JSON to clipboard as a fallback');
assert(source.includes('quoteImportDebugOutput'), 'debug export should write JSON into the modal as a visible fallback');
assert(source.includes('copyQuoteImportDebugJson'), 'debug export should provide an explicit copy button fallback');
assert(source.includes('execCommand'), 'debug export copy fallback should support browsers without clipboard permissions');

const sheetText = importer.buildSheetTextFromRows([
  ['ALD Direct Inc.', '', '', '', '', 'INVOICE'],
  ['', '', '', '', '', ''],
  ['2ND FLOOR', '', '', '', '', ''],
  ['Flooring - Floating Vinyl', '', '796.5', 'sq ft', '$1.75', '$1,393.88'],
]);
assert(sheetText.includes('ALD Direct Inc. | INVOICE'), 'spreadsheet extraction should keep meaningful cells from the same row');
assert(sheetText.includes('Flooring - Floating Vinyl | 796.5 | sq ft | $1.75 | $1,393.88'), 'spreadsheet extraction should preserve item, quantity, unit, rate, and total order');
assert(!sheetText.includes(',,,,') && !sheetText.includes('||||'), 'spreadsheet extraction should remove noisy empty columns');

const longImportText = [
  '2ND FLOOR',
  'Drywall | 3793 | sq ft | $6.40 | $24,275.20',
  'MAIN FLOOR',
  'Painting | 3100 | sq ft | $1.75 | $5,425.00',
  'BASEMENT BATHROOM',
  'Tile | 120 | sq ft | $18.00 | $2,160.00',
].join('\n') + '\n' + Array(900).fill('General item | 1 | ls | $125.00 | $125.00').join('\n');
const importChunks = importer.splitQuoteImportText(longImportText);
assert(importChunks.length > 1, 'large quote text should be split into multiple client-side chunks');
assert(importChunks.every((chunk) => chunk.text.length <= 7200), 'client-side chunks should stay small enough for short Edge Function calls');

const mergedPayload = importer.mergeImportedQuotePayloads([
  {
    quote: {
      clientName: 'Amanda',
      rooms: [{ name: '2ND FLOOR', items: [{ description: 'Drywall', total: 100 }] }],
    },
    sourceTotals: { total: 100 },
    savedItemCandidates: [{ category: 'Drywall', name: 'Drywall', unitType: 'sq ft', rate: 6.4, defaultSelected: true }],
  },
  {
    quote: {
      rooms: [{ name: '2ND FLOOR', items: [{ description: 'Paint', total: 50 }] }],
    },
    sourceTotals: { total: 150 },
    savedItemCandidates: [{ category: 'Paint', name: 'Paint', unitType: 'sq ft', rate: 1.75, defaultSelected: true }],
  },
]);
assert(mergedPayload.quote.clientName === 'Amanda', 'merged chunk payload should preserve quote metadata');
assert(mergedPayload.quote.rooms.length === 1, 'merged chunk payload should combine matching room names');
assert(mergedPayload.quote.rooms[0].items.length === 2, 'merged chunk payload should retain items from every chunk');
assert(mergedPayload.sourceTotals.total === 150, 'merged chunk payload should keep the highest detected source total');
assert(mergedPayload.savedItemCandidates.every((item) => item.defaultSelected === false), 'merged candidates should always default to unchecked');

const debugCsv = importer.buildImportedQuoteCsv(mergedPayload.quote);
assert(debugCsv.includes('"room","category","description","quantity","unit","rate","total","notes"'), 'debug CSV should include stable headers');
assert(debugCsv.includes('"2ND FLOOR"') && debugCsv.includes('"Drywall"') && debugCsv.includes('"Paint"'), 'debug CSV should include flattened imported items');

const debugPayload = importer.buildQuoteImportDebugPayload({
  parsed: mergedPayload,
  extractedText: '2ND FLOOR\nDrywall | 1 | ls | $100 | $100',
  fileName: 'legacy.xlsx',
  fileType: 'xlsx',
});
assert(debugPayload.fileName === 'legacy.xlsx', 'debug export should preserve source file name');
assert(debugPayload.sourceCharacterCount > 0, 'debug export should include extracted source size');
assert(debugPayload.itemCount === 2, 'debug export should include imported item count');
assert(debugPayload.totals.importedSubtotal === 150, 'debug export should include imported subtotal');
assert(debugPayload.totals.sourceTotal === 150, 'debug export should include source total');
assert(debugPayload.totals.shortfallVsSourceSubtotal === 0, 'debug export should compare imported work against source subtotal');
assert(debugPayload.lineItemsCsv.includes('"Paint"'), 'debug export should include CSV line item text');

const recovered = importer.recoverMissingSourceRows(importer.normalizeImportedQuote({
  quote: {
    rooms: [{
      name: '2ND FLOOR',
      items: [{ category: 'Flooring', description: 'Floating Vinyl', quantity: 819.5, unit: 'sq ft', rate: 2, total: 1639 }],
    }],
  },
  sourceTotals: { subtotal: 4787.8, total: 5410.21 },
}), [
  '2ND FLOOR',
  'Flooring - Floating Vinyl 819.5 Square Feet | 819.5 | $2.00 | $1,639.00',
  'Includes labour to install flooring.',
  'Drywall 492 Square Feet | 492 | $6.40 | $3,148.80',
  'Includes 492 square feet of new drywall, material and labour.',
  'Thank you for your business! | SUBTOTAL | $4,787.80',
  'TOTAL | $5,410.21',
].join('\n'));
const recoveredDrywall = recovered.quote.rooms[0].items.find((item) => item.description === 'Drywall');
assert(recoveredDrywall, 'missing clean source row should be recovered into the matching room');
assert(recoveredDrywall.category === 'Drywall', 'recovered item should infer a useful category');
assert(recoveredDrywall.quantity === 492, 'recovered item should preserve source quantity');
assert(recoveredDrywall.unitType === 'sq ft', 'recovered item should infer source unit');
assert(recoveredDrywall.rate === 6.4, 'recovered item should preserve source rate');
assert(recoveredDrywall.total === 3148.8, 'recovered item should preserve source total');
assert(recoveredDrywall.itemDescription.includes('492 square feet'), 'recovered item should preserve the following source description as reusable description');
assert(recoveredDrywall.notes === '', 'recovered item should not duplicate source descriptions into job notes');
assert(recovered.warnings.some((warning) => /Recovered 1 priced source row/.test(warning)), 'recovery should warn the user that deterministic rows were added');

const rebuiltPageText = importer.buildPdfPageTextFromItems([
  { str: '$1,593.00', transform: [1, 0, 0, 1, 520, 700], width: 55 },
  { str: '796.5', transform: [1, 0, 0, 1, 310, 700], width: 28 },
  { str: '$2.00', transform: [1, 0, 0, 1, 450, 700], width: 35 },
  { str: 'Flooring - Floating Vinyl', transform: [1, 0, 0, 1, 40, 700], width: 145 },
  { str: '2ND FLOOR', transform: [1, 0, 0, 1, 40, 725], width: 80 },
]);
assert(
  rebuiltPageText.includes('2ND FLOOR\nFlooring - Floating Vinyl') &&
  rebuiltPageText.includes('796.5') &&
  rebuiltPageText.includes('$2.00') &&
  rebuiltPageText.includes('$1,593.00'),
  'PDF extraction should rebuild text by visual position, not PDF stream order'
);

const parsed = importer.normalizeImportedQuote({
  quote: {
    clientName: 'Amanda and David Maclennan',
    quoteNumber: '25.12',
    rooms: [
      {
        name: 'MAIN FLOOR',
        items: [
          {
            category: 'Drywall',
            description: 'Drywall',
            quantity: '3793',
            unit: 'Square Feet',
            rate: '$6.40',
            total: '$24,275.20',
            notes: 'Includes boarding, mudding, taping, sanding, and priming new drywall. Paint ready.',
          },
          {
            category: 'Counters',
            description: 'Countertops - To Be Determined',
            quantity: '',
            unit: '',
            rate: 'TBD',
            total: 'TBD',
          },
          {
            category: 'Totals',
            description: 'TOTAL',
            total: '$180,840.97',
          },
        ],
      },
      {
        name: 'BASEMENT BATHROOM',
        items: [
          {
            category: 'Finish Plumbing',
            description: 'Toilet Installation',
            total: '$150.00',
          },
        ],
      },
    ],
  },
  sourceTotals: {
    total: '$180,840.97',
  },
});

assert(parsed.quote.clientName === 'Amanda and David Maclennan', 'client name should be preserved');
assert(parsed.quote.quoteNumber === '25.12', 'quote number should be preserved');
assert(parsed.quote.rooms.length === 2, 'valid rooms should be preserved');
assert(parsed.quote.rooms[0].items.length === 1, 'TBD and total rows should be skipped');

const drywall = parsed.quote.rooms[0].items[0];
assert(drywall.description === 'Drywall', 'item description should be preserved');
assert(drywall.quantity === 3793, 'quantity should be numeric');
assert(drywall.unitType === 'sq ft', 'square feet should normalize to sq ft');
assert(drywall.rate === 6.4, 'rate should parse currency');
assert(drywall.total === 24275.2, 'total should parse currency');
assert(drywall.itemDescription.includes('Paint ready'), 'long imported descriptions should become reusable item descriptions');
assert(drywall.notes === '', 'imported descriptions should not be duplicated into job notes');

const toilet = parsed.quote.rooms[1].items[0];
assert(toilet.quantity === 1, 'total-only item should use quantity 1');
assert(toilet.unitType === 'ea', 'missing unit item should default to each');
assert(toilet.unit === 'ea', 'missing unit item should use ea for display');
assert(toilet.rate === 150, 'total-only item should use total as rate');
assert(toilet.total === 150, 'total-only item should preserve total');

const candidates = importer.extractSavedItemCandidates(parsed.quote);
assert(candidates.some((item) => item.name === 'Drywall' && item.defaultSelected === false), 'saved-item candidates should default to unchecked');
assert(candidates.some((item) => item.name === 'Toilet Installation'), 'lump sum item should still be available as a candidate');
assert(!candidates.some((item) => /total|tbd/i.test(item.name)), 'totals and TBD rows should not become saved-item candidates');

console.log('quote import static test passed');
