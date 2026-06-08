const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  /function qdCanonicalInvoiceNumber\(value\)[\s\S]*replace\(\s*\/\(\?:-INV\)\+\$\/i,\s*'-INV'\s*\)/.test(supabase),
  'Invoice sharing should canonicalize repeated -INV suffixes instead of creating -INV-INV'
);

assert(
  /quote_number:\s*invoiceQuoteNumber/.test(supabase),
  'Invoice rows should save the canonical invoice number'
);

assert(
  /function portalDocumentTitle\(quote\)[\s\S]*data\.quoteTitle[\s\S]*data\.invoiceTitle[\s\S]*quote\?\.quote_number/.test(portal),
  'Client portal cards should prefer the user-assigned document title before the quote/invoice number'
);

assert(
  /class="quote-number portal-document-title"/.test(portal) &&
  /portalDocumentNumberLine\(quote,\s*docType\)/.test(portal),
  'Client portal cards should show the saved title as the bold heading and the document number as smaller metadata'
);

assert(
  /function dedupePortalDocuments\(quotes\)/.test(portal) &&
  /canonicalPortalInvoiceNumber/.test(portal) &&
  /dedupePortalDocuments\(portalResult\.documents \|\| \[\]\)/.test(portal),
  'Client portal should dedupe repeated invoice records before rendering and summary calculations'
);

assert(
  /quoteTitle:\s*document\.getElementById\('quoteTitle'\)\?\.value/.test(builder),
  'Invoice data built from the quote builder should preserve the user-assigned quote title'
);

assert(
  /function findPortalInvoiceDuplicate\(target,\s*portal\)/.test(dashboard) &&
  /var duplicateInPortal = findPortalInvoiceDuplicate\(target,\s*portal\);/.test(dashboard) &&
  /clearPortalAssignmentForEdit\(row\.data \|\| \{\}\)/.test(dashboard),
  'Adding an invoice to a portal should replace a matching existing portal duplicate instead of keeping both visible'
);
