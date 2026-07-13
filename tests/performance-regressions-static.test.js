const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const clientDocument = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
const summaryMigration = fs.readFileSync('supabase/migrations/20260712180000_quote_dashboard_summaries.sql', 'utf8');
const photoOptimizer = fs.readFileSync('supabase/functions/optimize-photo-storage/index.ts', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const quoteImport = fs.readFileSync('quote-import.js', 'utf8');

assert(supabase.includes(".rpc('quotedr_list_quote_summaries')"), 'Supabase helpers should request compact quote summaries');
assert(supabase.includes('Quote summary query failed; using compatibility fallback'), 'Dashboard summaries should fall back when the RPC fails');
assert(supabase.includes('Quote summary query returned no rows; using compatibility fallback'), 'Dashboard summaries should recover from an incorrect empty RPC result');
assert(dashboard.includes('listQuoteSummariesFromSupabase'), 'Dashboard should load quote summaries instead of every full quote');
assert(storage.includes('listQuoteSummariesFromSupabase'), 'Save and Open dialogs should load quote summaries');
assert(!builder.includes('var result = await listQuotes();'), 'Portal pickers should not download every full quote');
assert(dashboard.includes('loadDashboardFullQuote'), 'Dashboard mutations should fetch one complete quote on demand');
assert(supabase.includes(".select('id,user_id,status,type,quote_number,updated_at')"), 'Share saves should return compact metadata');
assert(supabase.includes('var loadQuoteFromSupabase = loadQuoteByIdFromSupabase;'), 'Opening one quote should use a point query instead of listing every quote');
assert(!supabase.includes('return listQuotes().then(function(result)'), 'Single quote loading must not download all quote payloads');
assert(supabase.includes('await prepareQuoteMediaForCloudSave(invoiceData)'), 'Invoice sharing should also migrate embedded thumbnails');
assert(summaryMigration.includes('q.user_id = auth.uid()'), 'Summary RPC must be scoped to the signed-in user');
assert(summaryMigration.includes("<> '__ITEMS_BACKUP__'"), 'Summary RPC must exclude the item backup pseudo-quote');

assert(items.includes('manage-items-render-mode'), 'Manage Items should distinguish collapsed and search render modes');
assert(items.includes('clearManageItemsRenderedContent'), 'Manage Items should release its hidden row DOM after closing');
assert(items.includes('QuoteDrMedia.createThumbnailBlob'), 'Manage Items should generate storage-backed thumbnails');
assert(dashboard.includes('schedulePhotoStorageOptimization'), 'Dashboard should resume legacy photo optimization in idle batches');
assert(photoOptimizer.includes('batchSize = Math.max(1, Math.min(3'), 'Photo migration batches must remain small');
assert(photoOptimizer.includes('firstFailedOffset'), 'Photo migration must resume from a failed row instead of skipping it');

assert(!viewer.includes('window._supabaseClient = supabase.createClient('), 'Viewer should not create a duplicate Supabase auth client');
assert(viewer.includes('startViewerBackgroundTasks'), 'Viewer tracking and payment reconciliation should run after initial rendering');
assert(viewer.includes('loading="lazy" decoding="async"'), 'Viewer site photos should decode lazily');

assert(clientDocument.includes('function compactDocumentResult'), 'Client document writes should return compact result metadata');
assert(clientDocument.includes('query.eq("data->>portal_id", activePortalId)'), 'Secure portals should fetch only documents in the active portal');
assert(!/return json\(\{ event: sanitizePortalDocumentEventRow\(loggedEvent\), document: sanitizeQuoteRow\(target\) \}\)/.test(clientDocument), 'Activity logging must not return the full quote again');

assert(!builder.includes('<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>'), 'PDF.js should not load until a PDF import is requested');
assert(!builder.includes('<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>'), 'XLSX should not load until a spreadsheet import is requested');
assert(!builder.includes('<script src="https://maps.googleapis.com/maps/api/js?'), 'Google Maps should load only when measurement tools open');
assert(quoteImport.includes('loadQuoteImportScript'), 'Quote import should load optional readers on demand');

console.log('performance regression static checks passed');
