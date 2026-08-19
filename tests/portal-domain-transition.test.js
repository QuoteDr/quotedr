const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

function browserPortalConfig(primaryOrigin) {
  const source = fs.readFileSync('supabase-v2.js', 'utf8').replace(/\r\n/g, '\n');
  const configuredDeclaration = "const QUOTEDR_PRIMARY_CLIENT_PORTAL_ORIGIN = 'https://myprojectview.ca';";
  const start = source.indexOf(configuredDeclaration);
  const endMarker = 'window.QuoteDrPortalLinks = Object.freeze({';
  const objectStart = source.indexOf(endMarker, start);
  const end = source.indexOf('\n});', objectStart) + 4;
  assert(start >= 0 && objectStart >= 0 && end > objectStart, 'browser portal-link configuration should remain extractable');
  const snippet = source.slice(start, end).replace(
    configuredDeclaration,
    `const QUOTEDR_PRIMARY_CLIENT_PORTAL_ORIGIN = '${primaryOrigin || 'https://myprojectview.ca'}';`
  );
  const context = {
    window: { location: { hostname: 'quotedr.io', origin: 'https://quotedr.io' } },
    Object,
    String,
    encodeURIComponent
  };
  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.window.QuoteDrPortalLinks;
}

(async () => {
  const configured = browserPortalConfig();
  assert.strictEqual(
    configured.shortUrl('same_TOKEN-123', 'Northline Rénovations'),
    'https://myprojectview.ca/p/northline-renovations/same_TOKEN-123',
    'newly generated links should use myprojectview.ca and a cosmetic company slug'
  );
  assert.deepStrictEqual(
    Array.from(configured.legacyOrigins),
    ['https://quotedr.io', 'https://www.quotedr.io'],
    'switching the primary domain must not remove either legacy QuoteDr origin'
  );
  assert.strictEqual(
    configured.shortUrl('local_TOKEN-123', 'Northline', { hostname: '127.0.0.1', origin: 'http://127.0.0.1:8767' }),
    'http://127.0.0.1:8767/client-portal.html?p=local_TOKEN-123',
    'local portal testing should stay local'
  );

  const shared = await import(pathToFileURL(require('node:path').resolve('supabase/functions/_shared/client-portal-url.mjs')).href);
  assert(shared.CLIENT_PORTAL_PRODUCTION_HOSTS.includes('quotedr.io'), 'legacy apex hostname must remain accepted');
  assert(shared.CLIENT_PORTAL_PRODUCTION_HOSTS.includes('www.quotedr.io'), 'legacy www hostname must remain accepted');
  assert(shared.CLIENT_PORTAL_PRODUCTION_HOSTS.includes('myprojectview.ca'), 'new client portal apex hostname must be accepted');
  assert(shared.isProductionClientPortalUrl(new URL('https://myprojectview.ca/p/northline/new-token')), 'new branded portal links must be accepted');
  assert(shared.isProductionClientPortalUrl(new URL('https://quotedr.io/p/existing-token')), 'existing QuoteDr links must remain accepted');
  assert.strictEqual(shared.portalTokenFromUrl('https://quotedr.io/p/existing_TOKEN-123'), 'existing_TOKEN-123');
  assert.strictEqual(shared.portalTokenFromUrl('https://clientspace.test/p/northline/new_TOKEN-456'), 'new_TOKEN-456');
  assert.strictEqual(shared.portalTokenFromUrl('https://clientspace.test/p/company/extra/token'), '', 'unexpected path shapes must fail closed');

  const redirects = fs.readFileSync('_redirects', 'utf8').replace(/\r\n/g, '\n');
  assert(redirects.includes('/p/:company/:token /client-portal.html?p=:token 302'));
  assert(redirects.includes('/p/* /client-portal.html?p=:splat 302'));
  assert(redirects.indexOf('/p/:company/:token') < redirects.indexOf('/p/*'), 'specific branded route must precede the legacy wildcard');

  const clientDocument = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
  const sendEmail = fs.readFileSync('supabase/functions/send-quote-email/index.ts', 'utf8');
  const payment = fs.readFileSync('supabase/functions/document-payment/index.ts', 'utf8');
  for (const [name, source] of [['client-document', clientDocument], ['send-quote-email', sendEmail], ['document-payment', payment]]) {
    assert(source.includes('../_shared/client-portal-url.mjs'), `${name} should use the shared strict origin contract`);
  }

  console.log('portal domain transition test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
