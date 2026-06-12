const fs = require('fs');
const assert = require('assert');

const storage = fs.readFileSync('quote-storage.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  storage.includes('function quoteDataIsPortalLockedForBuilder(data)'),
  'Quote storage should detect portal-locked quote data, not only Supabase rows'
);

assert(
  storage.includes('localStorage.removeItem("ald_session_quote")') &&
    storage.includes('clearPortalLockedBuilderRestoreState'),
  'Portal-locked builder loads should clear last-opened/session restore state'
);

assert(
  storage.includes('quoteDataIsPortalLockedForBuilder(session)') &&
    storage.includes('was not restored for editing'),
  'Startup session restore should refuse portal-locked documents'
);

assert(
  storage.includes('portal_visible: loadedData.portal_visible === true') &&
    storage.includes('portal_added_at: loadedData.portal_added_at || null') &&
    storage.includes('portal_theme: loadedData.portal_theme || null'),
  'collectQuoteData should preserve portal metadata from the loaded quote'
);

assert(
  storage.includes('[AutoSave] Skipping cloud save - this quote is locked in a client portal'),
  'Autosave should skip cloud writes for portal-locked quote data'
);

assert(
  supabase.includes("!quoteData.supabaseId && !quoteData.forceNew && !quoteData._forceNewQuote && quoteData.quoteNumber") &&
    supabase.includes(".eq('quote_number', quoteData.quoteNumber)") &&
    supabase.includes('quoteData.supabaseId = existingQuote.id'),
  'Supabase quote save should update matching quote numbers instead of inserting accidental duplicates'
);

assert(
  supabase.includes('existingQuote.data && existingQuote.data.portal_visible === true') &&
    supabase.includes('cannot be edited directly'),
  'Supabase duplicate guard should not silently overwrite portal-locked quotes'
);

assert(
  storage.includes('_saveDialogData.forceNew = true'),
  'Explicit Save as New should remain an intentional new-save path'
);

assert(
  builder.includes('currentSupabaseId = window._supabaseQuoteId || currentSupabaseId || null') &&
    builder.includes('window._supabaseQuoteId = data.id') &&
    builder.includes('localStorage.setItem("ald_active_quote_id", data.id)'),
  'Legacy draft save helper should reuse the active Supabase quote id instead of creating duplicates'
);
