const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
const payment = fs.readFileSync('supabase/functions/document-payment/index.ts', 'utf8');
const portalViewer = fs.readFileSync('client-portal.html', 'utf8');

function sourceFunction(name) {
  const starts = ['        async function ' + name + '(', '        function ' + name + '('];
  const start = starts.map((needle) => dashboard.indexOf(needle)).find((index) => index >= 0);
  assert(Number.isInteger(start), name + ' should exist in dashboard.html');
  const openingBrace = dashboard.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < dashboard.length; index += 1) {
    if (dashboard[index] === '{') depth += 1;
    if (dashboard[index] === '}') depth -= 1;
    if (depth === 0) return dashboard.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

function sourceFunctionFrom(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name + ' should exist');
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

const saved = [];
const context = {
  Object, String, Date,
  findPortalStableShare() {
    return { token: 'stable-token', anchorId: 'quote-anchor', createdAt: '2026-08-18T12:00:00.000Z' };
  },
  portalRowsForDashboard(portal) { return portal.quotes.concat(portal.anchorRows || []); },
  portalDocumentCount(portal) { return portal.quotes.length; },
  portalThemeForDashboard() { return { layoutStyle: 'client-os' }; },
  async upsertDashboardEmptyPortal(record) { saved.push(record); },
  preservePortalAnchorForEdit(data) {
    return { ...data, portal_visible: false, portal_anchor_only: true };
  },
  clearPortalAssignmentForEdit(data) {
    const next = { ...data, portal_visible: false };
    delete next.portal_id;
    delete next.portal_share_token;
    delete next.portal_share_anchor_id;
    return next;
  }
};
vm.createContext(context);
vm.runInContext(sourceFunction('preparePortalDocumentRemoval'), context);

(async () => {
  const quote = {
    id: 'quote-anchor',
    data: {
      portal_visible: true,
      portal_id: 'portal-1',
      portal_name: 'Taylor Portal',
      portal_share_token: 'stable-token',
      portal_share_anchor_id: 'quote-anchor'
    }
  };
  const portal = {
    id: 'portal-1', name: 'Taylor Portal', clientName: 'Taylor', clientEmail: 'taylor@example.com',
    pin: '2468', quotes: [quote], anchorRows: [], registryRecord: null
  };

  const removed = await context.preparePortalDocumentRemoval(quote, portal);
  assert.strictEqual(saved.length, 1, 'removing the last document should persist the portal registry first');
  assert.strictEqual(saved[0].id, 'portal-1');
  assert.strictEqual(saved[0].secureToken, 'stable-token');
  assert.strictEqual(saved[0].secureAnchorId, 'quote-anchor');
  assert.strictEqual(removed.portal_visible, false);
  assert.strictEqual(removed.portal_anchor_only, true, 'the old link anchor should remain private and available');
  assert.strictEqual(removed.portal_id, 'portal-1');

  const nonAnchor = { id: 'quote-2', data: { portal_visible: true, portal_id: 'portal-1' } };
  portal.quotes.push(nonAnchor);
  const removedNonAnchor = await context.preparePortalDocumentRemoval(nonAnchor, portal);
  assert.strictEqual(removedNonAnchor.portal_visible, false);
  assert.strictEqual(removedNonAnchor.portal_id, undefined, 'a non-anchor document should fully leave a non-empty portal');
  assert.strictEqual(saved.length, 1, 'removing one of several documents should not create an empty registry entry');

  const builderContext = {
    Object, String, Array, Set,
    invoicePortalRowKey(row) { return row.data.portal_id; },
    invoicePortalRowClientName(row) { return row.data.portal_client_name || 'Client'; },
    invoicePortalRowClientEmail(row) { return row.data.portal_client_email || ''; }
  };
  vm.createContext(builderContext);
  vm.runInContext(
    sourceFunctionFrom(builder, 'buildInvoicePortalRegistry') + '\n' +
      sourceFunctionFrom(builder, 'findBuilderPortalStableShare'),
    builderContext
  );
  const anchorRow = {
    id: 'quote-anchor',
    data: {
      portal_visible: false,
      portal_anchor_only: true,
      portal_id: 'portal-1',
      portal_name: 'Taylor Portal',
      portal_client_name: 'Taylor',
      portal_share_token: 'stable-token',
      portal_share_anchor_id: 'quote-anchor'
    }
  };
  const builderPortals = builderContext.buildInvoicePortalRegistry([anchorRow], [saved[0]]);
  assert.strictEqual(builderPortals.length, 1, 'builder should show the saved empty portal once');
  assert.strictEqual(builderPortals[0].rows.length, 0, 'private anchor should not count as a portal document');
  assert.strictEqual(builderPortals[0].anchorRows.length, 1);
  const builderShare = builderContext.findBuilderPortalStableShare({}, builderPortals[0]);
  assert.strictEqual(builderShare.token, 'stable-token', 'builder should reuse the existing portal link');
  assert.strictEqual(builderShare.anchorId, 'quote-anchor');

  assert(edge.includes('portalAnchorAvailable(anchor) && anchor.public_share_token_hash === tokenHash'), 'portal shell should accept the retained anchor token');
  assert(edge.includes('portalVisible(target) && target.public_share_token_hash === tokenHash'), 'direct document access must still require a visible target');
  assert(edge.includes('.filter((row) => portalVisible(row) && samePortalGroup(anchor, row))'), 'removed anchor must be excluded from portal documents');
  assert(edge.includes('anchor: portalVisible(anchor) ? compactDocumentResult(anchor) : { id: anchor.id }'), 'an empty portal must not expose removed-document totals or status through anchor metadata');
  assert(payment.includes('portalAnchorAvailable(anchor)') && payment.includes('portalVisible(target)'), 'payments may use a retained anchor only for a still-visible target document');
  assert(portalViewer.includes('This portal is active, but there are no documents in it right now.'), 'empty portal UI should explain that the link remains active');
  assert(builder.includes(".eq('key', 'client_portals').maybeSingle()"), 'quote and invoice portal pickers should load saved empty portals');
  assert(builder.includes('portal && Array.isArray(portal.anchorRows)'), 'builder sharing should reuse a private anchor from an empty portal');
  assert(builder.includes('delete quoteData.portal_anchor_only'), 're-adding the edited quote should make it a visible document again');

  console.log('portal empty retention test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
