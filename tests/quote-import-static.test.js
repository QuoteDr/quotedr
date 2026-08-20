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
assert(builderHtml.includes('image/jpeg') && builderHtml.includes('image/png') && builderHtml.includes('image/webp'), 'quote import should accept supported quote photos');
assert(builderHtml.includes('crop unrelated information'), 'photo import should warn users to remove unrelated sensitive information');
assert(builderHtml.includes('quoteImportImagePreview'), 'photo import should preview the selected document image');
assert(builderHtml.includes('id="quoteImportParseBtn"'), 'quote import should identify the parse action so duplicate AI requests can be blocked');
assert(builderHtml.includes('function openAiVoiceDestinationModal(preparedRooms, options)'), 'quote import should reuse the configurable AI Voice room destination flow');
assert(builderHtml.includes('modalEl._aiVoiceDestinationRooms = destinationRooms'), 'the shared destination chooser should validate against the rooms offered to that workflow');
assert(builderHtml.includes('quote-import.js?v=2026082002'), 'quote builder should cache-bust the importer destination update');

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
assert(edgeSource.includes("'scanned_pdf', 'image'"), 'quote-import edge function should support photos and scanned PDFs');
assert(edgeSource.includes("type: 'image_url'"), 'quote-import edge function should send validated photos as OpenAI image inputs');
assert(edgeSource.includes("detail: 'high'"), 'handwriting extraction should request high-detail image analysis');
assert(edgeSource.includes('MAX_TOTAL_IMAGE_DATA_URL_CHARS'), 'quote-import edge function should bound total image payload size');
assert(edgeSource.includes('must be JPEG, PNG, or WebP image data'), 'quote-import edge function should reject arbitrary image URLs and unsupported formats');
assert(edgeSource.includes('Payment history will not be applied automatically'), 'historical payment mismatches should remain review-only');
assert(edgeSource.includes('OPENAI_QUOTE_IMPORT_VISION_MODEL'), 'photo import should support a dedicated vision model override');

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
assert(typeof importer.mergeSavedItemCandidates === 'function', 'mergeSavedItemCandidates should be exported');
assert(typeof importer.buildPdfPageTextFromItems === 'function', 'PDF page text builder should be exported for testing');
assert(typeof importer.buildSheetTextFromRows === 'function', 'spreadsheet text builder should be exported for testing');
assert(typeof importer.splitQuoteImportText === 'function', 'frontend should split large quote imports before calling the Edge Function');
assert(typeof importer.mergeImportedQuotePayloads === 'function', 'frontend should merge parsed import chunks');
assert(typeof importer.buildImportedQuoteCsv === 'function', 'frontend should build a CSV-friendly imported quote export');
assert(typeof importer.buildQuoteImportDebugPayload === 'function', 'frontend should build an import debug export bundle');
assert(typeof importer.getQuoteImportDebugPayload === 'function', 'frontend should expose the current debug payload for troubleshooting');
assert(typeof importer.recoverMissingSourceRows === 'function', 'frontend should recover clean source rows the AI missed');
assert(typeof importer.prepareRoomsForBuilder === 'function', 'frontend should expose final import room preparation for regression testing');
assert(typeof importer.buildQuoteImportDestinationRooms === 'function', 'frontend should expose imported room destination planning for regression testing');
assert(typeof importer.detectFileType === 'function', 'frontend should expose image file detection for testing');
assert(typeof importer.buildQuoteImportRequests === 'function', 'frontend should build mixed text/photo import requests');
assert(typeof importer.collectQuoteImportReviewIssues === 'function', 'frontend should expose handwriting and arithmetic review checks');
assert(source.includes('clientChunkIndex'), 'frontend should send chunk position metadata to the Edge Function');
assert(source.includes('clientChunkTotal'), 'frontend should send chunk total metadata to the Edge Function');
assert(source.includes('clipboard.writeText'), 'debug export should copy JSON to clipboard as a fallback');
assert(source.includes('quoteImportDebugOutput'), 'debug export should write JSON into the modal as a visible fallback');
assert(source.includes('copyQuoteImportDebugJson'), 'debug export should provide an explicit copy button fallback');
assert(source.includes('execCommand'), 'debug export copy fallback should support browsers without clipboard permissions');
assert(source.includes('Select recommended'), 'importer should provide a fast opt-in for reusable high-confidence items');
assert(source.includes('will not be applied to the new QuoteDr quote'), 'detected historical payments should be visibly review-only');
assert(source.includes('parseButton.disabled = true') && source.includes('parseButton.disabled = false'), 'the parse action should be disabled while the AI import request is running');
assert(source.includes('await global.openAiVoiceDestinationModal'), 'applying an import should wait for the shared room destination choice');
assert(source.includes("destinationRooms: mode === 'append' ? existingRooms : []"), 'replacement imports should not offer rooms that will be removed');

assert(importer.detectFileType({ name: 'paper-invoice.JPG', type: 'image/jpeg' }) === 'image', 'JPEG photos should route to visual import');
assert(importer.detectFileType({ name: 'scan.webp', type: 'image/webp' }) === 'image', 'WebP photos should route to visual import');
const visualRequests = importer.buildQuoteImportRequests('', [{ dataUrl: 'data:image/jpeg;base64,AAAA', label: 'Front page' }]);
assert(visualRequests.length === 1, 'one document photo should produce one visual import request');
assert(visualRequests[0].text === '' && visualRequests[0].images.length === 1, 'visual import should not put base64 image data into extracted text');

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

const builderReadyRooms = importer.prepareRoomsForBuilder([{
  name: 'LOFT',
  items: [{
    category: 'Flooring',
    description: 'Flooring - Floating Vinyl 265 Square Feet',
    quantity: 265,
    unitType: 'sq ft',
    rate: 2.2,
    total: 583,
    itemDescription: 'Includes labour to install 265 square feet of vinyl floating flooring. Flooring not included, labour to install only.',
    notes: 'Includes labour to install 265 square feet of vinyl floating flooring. Flooring not included, labour to install only.'
  }, {
    category: 'Fan Replacement',
    description: 'Fan Replacement',
    quantity: 1,
    unitType: 'ls',
    rate: 165,
    total: 165,
    notes: 'Includes removal and installation of a replacement fan.'
  }]
}], 0);
assert(builderReadyRooms[0].items[0].itemDescription.includes('Flooring not included'), 'builder prep should preserve imported description text');
assert(builderReadyRooms[0].items[0].notes === '', 'builder prep should remove duplicated imported descriptions from job notes');
assert(builderReadyRooms[0].items[1].itemDescription.includes('replacement fan'), 'builder prep should move import-provided notes into reusable descriptions when needed');
assert(builderReadyRooms[0].items[1].notes === '', 'builder prep should keep imported job notes blank even when AI returned a notes field');

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

const handwrittenInvoice = importer.normalizeImportedQuote({
  quote: {
    quoteTitle: 'Kitchen renovation and living room lighting',
    clientName: 'Synthetic Test Client',
    projectAddress: '48 Example Drive, Hamilton',
    rooms: [{
      name: 'Electrical work',
      items: [
        { category: 'Administration', description: 'Permit and admin fee', quantity: 1, unit: 'ea', rate: 300, total: 300, confidence: 0.98, sourceExcerpt: 'Permit + admin fee' },
        { category: 'Lighting', description: '4 inch pot lights', quantity: 11, unit: 'ea', rate: 95, total: 1045, confidence: 0.94, sourceExcerpt: '11 4 inch potlights' },
        { category: 'Electrical', description: 'Low voltage wiring for under-cabinet lighting', quantity: 1, unit: 'ea', rate: 300, total: 300, confidence: 0.9 },
        { category: 'Electrical', description: 'Convert switch to 3-way and relocate door light', quantity: 1, unit: 'ea', rate: 250, total: 250, confidence: 0.82, reviewReasons: ['Handwritten description crosses two lines.'] },
        { category: 'Electrical', description: 'Relocate countertop receptacles', quantity: 1, unit: 'ea', rate: 175, total: 175, confidence: 0.91 },
      ],
    }],
  },
  sourceTotals: { subtotal: 2070, tax: 269.10, total: 2339.10, amountPaid: 1000, balanceDue: 1339.10, taxLabel: 'HST', taxRate: 13 },
  sourceDocument: { documentType: 'invoice', handwritten: true, confidence: 0.91 },
});
assert(handwrittenInvoice.quote.clientName === 'Synthetic Test Client', 'handwritten import should preserve extracted client metadata for review');
assert(handwrittenInvoice.quote.rooms[0].items.length === 5, 'handwritten invoice fixture should preserve every priced line');
assert(handwrittenInvoice.quote.rooms[0].items.reduce((sum, item) => sum + item.total, 0) === 2070, 'handwritten line items should reconcile to the source subtotal');
assert(handwrittenInvoice.sourceTotals.tax === 269.10 && handwrittenInvoice.sourceTotals.total === 2339.10, 'handwritten import should keep tax separate from the final total');
assert(handwrittenInvoice.sourceTotals.amountPaid === 1000 && handwrittenInvoice.sourceTotals.balanceDue === 1339.10, 'handwritten import should detect payment history separately from line items');
assert(handwrittenInvoice.sourceTotals.amountPaid + handwrittenInvoice.sourceTotals.balanceDue === handwrittenInvoice.sourceTotals.total, 'detected payment plus balance should reconcile to the source total');
const handwritingIssues = importer.collectQuoteImportReviewIssues(handwrittenInvoice);
assert(handwritingIssues.some((issue) => /Low-confidence handwriting/.test(issue)), 'low-confidence handwritten rows should require review');
assert(handwritingIssues.some((issue) => /crosses two lines/.test(issue)), 'AI review reasons should remain visible to the user');
const handwrittenCandidates = importer.extractSavedItemCandidates(handwrittenInvoice.quote);
assert(handwrittenCandidates.find((item) => item.name === 'Permit and admin fee').recommended === false, 'permit and admin fees should not be recommended as reusable library items');
assert(handwrittenCandidates.find((item) => item.name === '4 inch pot lights').recommended === true, 'clear high-confidence services should be recommended for reusable-library opt-in');
const incompleteAiCandidates = [{
  category: 'Lighting',
  name: '4 inch pot lights',
  unitType: 'ea',
  rate: 95,
  confidence: 0.94,
  recommended: true,
}, {
  category: 'AI guess',
  name: 'Unverified extra service',
  unitType: 'ea',
  rate: 999,
  confidence: 0.99,
  recommended: true,
}];
const completeHandwrittenCandidates = importer.mergeSavedItemCandidates(handwrittenInvoice.quote, incompleteAiCandidates);
assert(completeHandwrittenCandidates.length === 5, 'an incomplete AI candidate list must not hide extracted billable lines');
assert(completeHandwrittenCandidates.some((item) => item.name === 'Low voltage wiring for under-cabinet lighting' && item.recommended === true), 'clear wiring work omitted by the AI should still be recommended');
assert(completeHandwrittenCandidates.some((item) => item.name === 'Relocate countertop receptacles' && item.recommended === true), 'clear receptacle work omitted by the AI should still be recommended');
assert(completeHandwrittenCandidates.some((item) => item.name === 'Convert switch to 3-way and relocate door light' && item.recommended === false), 'low-confidence extracted work should remain visible for review');
assert(completeHandwrittenCandidates.some((item) => item.name === 'Permit and admin fee' && item.recommended === false), 'permit fees should remain visible without being selected as recommended');
assert(!completeHandwrittenCandidates.some((item) => item.name === 'Unverified extra service'), 'AI-only candidates without an extracted line item must not enter the reusable-library review');
const currentQuoteForImport = {
  rooms: [{ id: 7, name: 'Existing Kitchen', scopeNotes: '', items: [{ description: 'Existing work', quantity: 1, rate: 50, total: 50 }] }],
  roomCounter: 7,
};
const existingRoomDestination = importer.buildQuoteImportDestinationRooms(
  handwrittenInvoice.quote.rooms,
  { mode: 'existing', roomId: 7 },
  currentQuoteForImport,
  'append',
);
assert(existingRoomDestination.rooms.length === 1, 'adding an import to an existing room should not create another room');
assert(existingRoomDestination.rooms[0].items.length === 6, 'adding to an existing room should preserve existing work and append every imported line');
assert(currentQuoteForImport.rooms[0].items.length === 1, 'destination planning must not mutate the active quote before confirmation');
const newRoomDestination = importer.buildQuoteImportDestinationRooms(
  handwrittenInvoice.quote.rooms,
  { mode: 'new', roomName: 'Electrical Renovation' },
  currentQuoteForImport,
  'append',
);
assert(newRoomDestination.rooms.length === 2, 'creating a destination room should preserve existing rooms');
assert(newRoomDestination.rooms[1].name === 'Electrical Renovation' && newRoomDestination.rooms[1].items.length === 5, 'a named destination room should receive every imported item');
const parsedRoomDestination = importer.buildQuoteImportDestinationRooms(
  handwrittenInvoice.quote.rooms,
  { mode: 'parsed', roomNames: ['Imported Electrical'] },
  currentQuoteForImport,
  'append',
);
assert(parsedRoomDestination.rooms[1].name === 'Imported Electrical', 'parsed import rooms should be renameable before adding');
const replacementDestination = importer.buildQuoteImportDestinationRooms(
  handwrittenInvoice.quote.rooms,
  { mode: 'new', roomName: 'Replacement Room' },
  currentQuoteForImport,
  'replace',
);
assert(replacementDestination.rooms.length === 1 && replacementDestination.rooms[0].id === 1, 'replacement imports should start a fresh room sequence');
assert(importer.buildQuoteImportDestinationRooms(handwrittenInvoice.quote.rooms, { mode: 'existing', roomId: 7 }, currentQuoteForImport, 'replace') === null, 'replacement imports must not target a room that will be removed');
const cleanedHandwrittenRooms = importer.prepareRoomsForBuilder(handwrittenInvoice.quote.rooms, 0);
assert(cleanedHandwrittenRooms[0].items.every((item) => !Object.prototype.hasOwnProperty.call(item, 'confidence')), 'confidence metadata should not leak into saved quote line items');
assert(!cleanedHandwrittenRooms[0].items.some((item) => /payment|balance/i.test(item.description)), 'payment history should never become a quote line item');

console.log('quote import static test passed');
