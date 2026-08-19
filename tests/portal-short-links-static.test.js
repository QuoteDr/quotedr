const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8').replace(/\r\n/g, '\n');
const clientPortal = fs.readFileSync('client-portal.html', 'utf8').replace(/\r\n/g, '\n');
const edgeFunction = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
const redirects = fs.readFileSync('_redirects', 'utf8');

function sourceFunction(source, name, indentation) {
  const spacing = indentation || '';
  const syncPrefix = spacing + 'function ' + name + '(';
  const asyncPrefix = spacing + 'async function ' + name + '(';
  const syncStart = source.indexOf(syncPrefix);
  const asyncStart = source.indexOf(asyncPrefix);
  const start = syncStart >= 0 ? syncStart : asyncStart;
  const prefix = syncStart >= 0 ? syncPrefix : asyncPrefix;
  assert(start >= 0, name + ' should exist');
  const close = source.indexOf('\n' + spacing + '}\n', start + prefix.length);
  assert(close >= 0, name + ' should have a closing brace');
  return source.slice(start, close + spacing.length + 3);
}

assert(
  redirects.indexOf('/p/:company/:token /client-portal.html?p=:token 302') < redirects.indexOf('/p/* /client-portal.html?p=:splat 302'),
  'Branded portal paths should resolve before the permanent legacy route'
);

assert(
  redirects.includes('/p/* /client-portal.html?p=:splat 302'),
  'Cloudflare Pages should redirect clean portal paths to the portal page'
);

assert(
  clientPortal.includes("const portalShortToken = portalShortTokenFromLocation();") &&
    clientPortal.includes('resolveShortPortalContext') &&
    clientPortal.includes("action: 'portal'"),
  'Client portal should resolve a short token before loading portal data'
);

assert(
  dashboard.includes('async function ensurePortalStableShare(portal)') &&
    dashboard.includes("createSecureClientShareLink(anchor.id, '', { mode: 'portal' })") &&
    dashboard.includes('Preparing clean link...'),
  'Manage Portals should prepare and persist a clean link before offering it for copying'
);

assert(
  edgeFunction.includes('async function fetchQuoteByShareToken(token: string)') &&
    edgeFunction.includes('.eq("public_share_token_hash", tokenHash)') &&
    edgeFunction.includes('contractorId: anchor.user_id') &&
    edgeFunction.includes('anchorId: anchor.id'),
  'Client-document should resolve a short token through its stored hash and return portal context'
);

assert(
  edgeFunction.includes('createShareToken(16)') &&
    edgeFunction.includes('if (mode !== "portal")') &&
    !edgeFunction.includes('createShareToken(32)'),
  'New links should use compact 128-bit portal tokens and standalone document tokens should be retired'
);

const productionContext = {
  window: { location: { hostname: 'quotedr.io', origin: 'https://quotedr.io' } },
  encodeURIComponent,
  String
};
vm.createContext(productionContext);
vm.runInContext(
  sourceFunction(dashboard, 'shortPortalUrlForDashboard', '        ') + '\n' +
    sourceFunction(dashboard, 'portalUrlForDashboard', '        ') + '\n' +
    sourceFunction(dashboard, 'getClientPortalBaseUrl', '        ') + '\n' +
    'this.makePortalUrl = portalUrlForDashboard;',
  productionContext
);
const clientUrl = productionContext.makePortalUrl({
  secureToken: 'abc_DEF-123',
  secureAnchorId: 'anchor-id',
  contractorId: 'contractor-id',
  id: 'portal-id'
}, 'quote-id');
const adminUrl = productionContext.makePortalUrl({
  secureToken: 'abc_DEF-123',
  secureAnchorId: 'anchor-id',
  contractorId: 'contractor-id',
  id: 'portal-id'
}, 'quote-id', { admin: true });
const legacyUrl = productionContext.makePortalUrl({
  clientEmail: 'client@example.com',
  clientName: 'Example Client',
  contractorId: 'contractor-id',
  id: 'portal-id'
}, '');

assert.strictEqual(clientUrl, 'https://quotedr.io/p/abc_DEF-123', 'Client-facing portal URL should use the clean path');
assert(adminUrl.includes('/client-portal.html?') && adminUrl.includes('admin=1'), 'Admin preview should retain its explicit context URL');
assert(
  legacyUrl.includes('email=client%40example.com') && legacyUrl.includes('contractor=contractor-id') && legacyUrl.includes('portal=portal-id'),
  'Legacy portals without a secure token should retain their existing URL format'
);

const localContext = {
  window: { location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:8767' } },
  encodeURIComponent,
  String
};
vm.createContext(localContext);
vm.runInContext(
  sourceFunction(dashboard, 'shortPortalUrlForDashboard', '        ') + '\n' +
    sourceFunction(dashboard, 'portalUrlForDashboard', '        ') + '\n' +
    sourceFunction(dashboard, 'getClientPortalBaseUrl', '        ') + '\n' +
    'this.makePortalUrl = portalUrlForDashboard;',
  localContext
);
const localUrl = localContext.makePortalUrl({
  secureToken: 'local-token',
  secureAnchorId: 'local-anchor',
  contractorId: 'local-contractor',
  id: 'local-portal'
}, 'local-quote');
assert(
  localUrl.startsWith('http://127.0.0.1:8767/client-portal.html?') &&
    localUrl.includes('token=local-token') &&
    localUrl.includes('portal_anchor=local-anchor'),
  'Local previews should retain the full secure URL so they work before the Edge Function is deployed'
);

const pathContext = {
  window: { location: { pathname: '/p/abc_DEF-123' } },
  urlParams: new URLSearchParams(''),
  decodeURIComponent,
  String
};
vm.createContext(pathContext);
vm.runInContext(
  sourceFunction(clientPortal, 'portalShortTokenFromLocation', '    ') + '\nthis.readShortToken = portalShortTokenFromLocation;',
  pathContext
);
assert.strictEqual(pathContext.readShortToken(), 'abc_DEF-123', 'Client portal should read the token from a clean /p/ path');

pathContext.window.location.pathname = '/p/northline-renovations/branded_TOKEN-456';
assert.strictEqual(pathContext.readShortToken(), 'branded_TOKEN-456', 'Client portal should ignore a cosmetic company slug and read the final token');
const stableShareCalls = [];
let mintCount = 0;
const ensureContext = {
  createSecureClientShareLink: async (documentId, baseUrl, options) => {
    mintCount += 1;
    assert.strictEqual(documentId, 'quote-1');
    assert.strictEqual(baseUrl, '');
    assert.strictEqual(options.mode, 'portal');
    return { token: 'minted-token', portalAnchorId: 'quote-1' };
  },
  loadDashboardFullQuote: async (row) => row,
  quoteIsPortalPlaceholder: () => false,
  persistPortalStableShare: async (rows, share) => stableShareCalls.push({ rows, share }),
  Date,
  Error,
  String
};
vm.createContext(ensureContext);
vm.runInContext(
  sourceFunction(dashboard, 'ensurePortalStableShare', '        ') + '\nthis.ensureStableShare = ensurePortalStableShare;',
  ensureContext
);

(async () => {
  const portal = { quotes: [{ id: 'quote-1', data: {} }] };
  const created = await ensureContext.ensureStableShare(portal);
  assert.strictEqual(created.token, 'minted-token', 'Missing portal tokens should be minted');
  assert.strictEqual(portal.secureToken, 'minted-token', 'Minted token should be cached on the portal');
  assert.strictEqual(stableShareCalls.length, 1, 'Minted portal tokens should be persisted across portal rows');

  const existing = await ensureContext.ensureStableShare({
    secureToken: 'existing-token',
    secureAnchorId: 'existing-anchor',
    quotes: []
  });
  assert.strictEqual(existing.token, 'existing-token', 'Existing stable portal tokens should be reused');
  assert.strictEqual(mintCount, 1, 'Reopening an existing portal link should not rotate its token');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
