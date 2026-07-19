const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const source = fs.readFileSync('supabase-v2.js', 'utf8');
const helperMatch = source.match(/function quotePortalLockedSaveError\(quoteData, row\) \{[\s\S]*?\n\}\n\nasync function verifyQuoteIsEditableBeforeSave\(userId, quoteData\) \{[\s\S]*?\n\}/);
const ownVersionMatch = source.match(/function qdAdoptOwnLatestQuoteVersion\(quoteData, row\) \{[\s\S]*?\n\}/);

assert(helperMatch, 'Supabase saves should define a reusable stored-row portal lock guard');
assert(ownVersionMatch, 'Quote saves should define a same-editor version adoption guard');

function makeSupabase(response, calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      const chain = {
        select(columns) { calls.push(['select', columns]); return chain; },
        eq(column, value) { calls.push(['eq', column, value]); return chain; },
        maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(response); }
      };
      return chain;
    }
  };
}

(async function() {
  const calls = [];
  const lockEvents = [];
  const context = {
    _supabase: makeSupabase({ data: null, error: null }, calls),
    CustomEvent: function(type, options) { return { type, detail: options.detail }; },
    dispatchEvent(event) { lockEvents.push(event); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(helperMatch[0] + '\n' + ownVersionMatch[0] + '\nthis.verifyQuoteIsEditableBeforeSave = verifyQuoteIsEditableBeforeSave; this.quotePortalLockedSaveError = quotePortalLockedSaveError; this.qdAdoptOwnLatestQuoteVersion = qdAdoptOwnLatestQuoteVersion;', context);

  const unsaved = await context.verifyQuoteIsEditableBeforeSave('user-1', {});
  assert.strictEqual(unsaved.editable, true, 'A new unsaved quote should remain editable');
  assert.strictEqual(calls.length, 0, 'A new unsaved quote should not perform a cloud lock lookup');

  context._supabase = makeSupabase({
    data: { id: 'quote-1', data: { portal_visible: true }, updated_at: '2026-07-18T00:00:00Z' },
    error: null
  }, calls);
  const locked = await context.verifyQuoteIsEditableBeforeSave('user-1', { supabaseId: 'quote-1' });
  assert.strictEqual(locked.editable, false, 'The stored portal flag must lock a known quote even when local data is stale');

  context._supabase = makeSupabase({ data: { id: 'quote-1', data: { portal_visible: false } }, error: null }, calls);
  const editable = await context.verifyQuoteIsEditableBeforeSave('user-1', { supabaseId: 'quote-1' });
  assert.strictEqual(editable.editable, true, 'An active draft should remain editable');

  const lockedRow = { id: 'quote-1', data: { portal_visible: true } };
  const lockError = context.quotePortalLockedSaveError({ supabaseId: 'quote-1' }, lockedRow);
  assert.strictEqual(lockError.error.code, 'PORTAL_LOCKED');
  assert.strictEqual(lockEvents.length, 1, 'A stored portal lock should notify the active builder immediately');
  assert.strictEqual(lockEvents[0].type, 'quotedr-quote-portal-locked');
  assert.strictEqual(lockEvents[0].detail.row, lockedRow);

  const sameEditorQuote = { _editorInstanceId: 'tab-1', _serverUpdatedAt: 'old-version' };
  assert.strictEqual(context.qdAdoptOwnLatestQuoteVersion(sameEditorQuote, {
    updated_at: 'new-version',
    data: { _saveMeta: { sourceInstanceId: 'tab-1' } }
  }), true, 'a quote should adopt a newer cloud version written by this same editor instance');
  assert.strictEqual(sameEditorQuote._serverUpdatedAt, 'new-version');

  const otherEditorQuote = { _editorInstanceId: 'tab-1', _serverUpdatedAt: 'old-version' };
  assert.strictEqual(context.qdAdoptOwnLatestQuoteVersion(otherEditorQuote, {
    updated_at: 'other-version',
    data: { _saveMeta: { sourceInstanceId: 'tab-2' } }
  }), false, 'a different editor instance must remain a genuine conflict candidate');
  assert.strictEqual(otherEditorQuote._serverUpdatedAt, 'old-version');

  const saveBlock = source.slice(source.indexOf('async function saveQuote(quoteData)'), source.indexOf('// Get all invoices for current user'));
  const sharingBlock = source.slice(source.indexOf('async function saveQuoteForSharing(quoteData)'), source.indexOf('// Delete a quote from Supabase'));
  assert(
    saveBlock.indexOf('verifyQuoteIsEditableBeforeSave') < saveBlock.indexOf('prepareQuoteMediaForCloudSave'),
    'Normal quote saves should reject stored portal locks before uploading or writing quote data'
  );
  assert(
    sharingBlock.indexOf('verifyQuoteIsEditableBeforeSave') < sharingBlock.indexOf('prepareQuoteMediaForCloudSave'),
    'Share saves should reject stored portal locks before uploading or writing quote data'
  );
  assert(
    saveBlock.includes('qdAdoptOwnLatestQuoteVersion(quoteData, editCheck.row)') &&
      sharingBlock.includes('qdAdoptOwnLatestQuoteVersion(quoteData, editCheck.row)'),
    'Normal and share saves should safely adopt only their own latest acknowledged cloud version'
  );

  console.log('quote portal save guard behavior tests passed');
})().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
