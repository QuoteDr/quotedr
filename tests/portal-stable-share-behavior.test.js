const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const supabaseSource = fs.readFileSync('supabase-v2.js', 'utf8');
const match = source.match(/function findBuilderPortalStableShare\(documentData, portal\) \{[\s\S]*?\r?\n        \}\r?\n\r?\n        function applyBuilderPortalStableShare[\s\S]*?\r?\n        \}\r?\n\r?\n        function builderPortalUrlFromStableShare[\s\S]*?\r?\n        \}/);
assert(match, 'builder stable-share helpers should remain extractable');

const context = {
  window: { location: { href: 'https://quotedr.io/quote-builder.html' } },
  getClientPortalBaseUrl: () => 'https://quotedr.io/client-portal',
  URL,
  Set,
  Array,
  String,
  Date
};
vm.createContext(context);
vm.runInContext(`${match[0]}; this.findShare = findBuilderPortalStableShare; this.applyShare = applyBuilderPortalStableShare; this.buildUrl = builderPortalUrlFromStableShare;`, context);

const portal = {
  rows: [
    { id: 'anchor-1', data: { portal_share_token: 'stable-token', portal_share_anchor_id: 'anchor-1', portal_share_created_at: '2026-08-08T12:00:00Z' } },
    { id: 'document-2', data: {} }
  ]
};
const share = context.findShare({}, portal);
assert.deepStrictEqual(JSON.parse(JSON.stringify(share)), {
  token: 'stable-token',
  anchorId: 'anchor-1',
  createdAt: '2026-08-08T12:00:00Z'
});

const documentData = {};
context.applyShare(documentData, share);
assert.strictEqual(documentData.portal_share_token, 'stable-token');
assert.strictEqual(documentData.portal_share_anchor_id, 'anchor-1');

const url = new URL(context.buildUrl(share));
assert.strictEqual(url.origin + url.pathname, 'https://quotedr.io/client-portal');
assert.strictEqual(url.searchParams.get('id'), 'anchor-1');
assert.strictEqual(url.searchParams.get('token'), 'stable-token');
assert.strictEqual(url.searchParams.get('portal_anchor'), 'anchor-1');
assert(!url.searchParams.has('admin'), 'client portal links must never contain admin mode');

const stale = context.findShare({ portal_share_token: 'old', portal_share_anchor_id: 'removed-anchor' }, portal);
assert.strictEqual(stale.token, 'stable-token', 'a current portal anchor should win over stale document metadata');

const mergeMatch = supabaseSource.match(/function qdMergeExistingPortalData\(nextData, existingData\) \{[\s\S]*?\r?\n\}/);
assert(mergeMatch, 'invoice portal metadata merge helper should remain extractable');
vm.runInContext(`${mergeMatch[0]}; this.mergePortalData = qdMergeExistingPortalData;`, context);
const merged = context.mergePortalData(
  { rooms: [{ name: 'Updated room' }], portal_visible: false },
  { rooms: [{ name: 'Old room' }], portal_visible: true, portal_id: 'portal-1', portal_share_token: 'stable-token' }
);
assert.strictEqual(merged.rooms[0].name, 'Updated room', 'regeneration should keep the new invoice contents');
assert.strictEqual(merged.portal_visible, true, 'regeneration should preserve portal visibility');
assert.strictEqual(merged.portal_id, 'portal-1', 'regeneration should preserve portal assignment');
assert.strictEqual(merged.portal_share_token, 'stable-token', 'regeneration should preserve the stable portal link');

console.log('portal stable share behavior test passed');
