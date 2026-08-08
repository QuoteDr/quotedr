const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const read = (path) => fs.readFileSync(path, 'utf8');
const portal = read('client-portal.html');
const dashboard = read('dashboard.html');
const settings = read('settings.html');
const studio = read('portal-theme-studio.html');
const builder = read('quote-builder.html');
const invoice = read('invoice-viewer.html');
const interactiveQuote = read('interactive-quote-viewer.html');
const supabase = read('supabase-v2.js');
const clientDocument = read('supabase/functions/client-document/index.ts');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'Missing function ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unclosed function ' + name);
}

function resolveInvoiceBranding(documentData, fallback, secureFallback) {
  const context = {
    invoiceData: documentData,
    invoiceBrandingFallback: fallback,
    invoiceSecureBrandingFallback: secureFallback || null,
    result: null,
  };
  vm.runInNewContext([
    extractFunction(invoice, 'invoiceHasBrandingSnapshot'),
    extractFunction(invoice, 'invoiceBrandingFallbackValue'),
    extractFunction(invoice, 'resolvedInvoiceBusinessProfile'),
    extractFunction(invoice, 'resolvedInvoiceBusinessLogo'),
    'result = { logo: resolvedInvoiceBusinessLogo(), profile: resolvedInvoiceBusinessProfile() };',
  ].join('\n'), context);
  return context.result;
}

const issued = resolveInvoiceBranding(
  { businessLogo: 'old-issued-logo', businessProfile: { business_name: 'Issued Co' } },
  { businessLogo: 'current-logo', businessProfile: { business_name: 'Current Co' } },
);
assert.equal(issued.logo, 'old-issued-logo', 'An issued invoice logo snapshot must remain authoritative');
assert.equal(issued.profile.business_name, 'Issued Co', 'An issued invoice profile snapshot must remain authoritative');

const explicitNoLogo = resolveInvoiceBranding(
  { businessLogo: '', businessProfile: {} },
  { businessLogo: 'current-logo', businessProfile: { business_name: 'Current Co' } },
);
assert.equal(explicitNoLogo.logo, '', 'An explicit no-logo snapshot must not acquire a future account logo');
assert.equal(Object.keys(explicitNoLogo.profile).length, 0, 'An explicit empty profile snapshot must not be replaced retroactively');

const legacy = resolveInvoiceBranding(
  {},
  {},
  { businessLogo: 'current-logo', businessProfile: { business_name: 'Current Co' } },
);
assert.equal(legacy.logo, 'current-logo', 'A legacy invoice without a logo field should use the secure current-brand fallback');
assert.equal(legacy.profile.business_name, 'Current Co', 'A legacy invoice without a profile field should use the secure current-brand fallback');

const secureLegacy = resolveInvoiceBranding(
  {},
  { businessLogo: 'stale-browser-logo', businessProfile: { business_name: 'Stale Browser Co' } },
  { businessLogo: 'secure-current-logo', businessProfile: { business_name: 'Secure Current Co' } },
);
assert.equal(secureLegacy.logo, 'secure-current-logo', 'Token-scoped branding must win over stale local browser branding');
assert.equal(secureLegacy.profile.business_name, 'Secure Current Co', 'Token-scoped profile must win over stale local browser data');

const secureNoLogo = resolveInvoiceBranding(
  {},
  { businessLogo: 'stale-browser-logo', businessProfile: { business_name: 'Stale Browser Co' } },
  { businessLogo: '', businessProfile: {} },
);
assert.equal(secureNoLogo.logo, '', 'A token-scoped no-logo result must suppress stale browser branding');
assert.equal(Object.keys(secureNoLogo.profile).length, 0, 'A token-scoped empty profile must suppress stale browser profile data');

function resolveQuoteBranding(documentData, fallback, secureFallback) {
  const context = {
    quoteData: documentData,
    quoteBrandingFallback: fallback,
    quoteSecureBrandingFallback: secureFallback || null,
    result: null,
  };
  vm.runInNewContext([
    extractFunction(interactiveQuote, 'quoteHasBrandingSnapshot'),
    extractFunction(interactiveQuote, 'quoteBrandingFallbackValue'),
    extractFunction(interactiveQuote, 'resolvedQuoteBusinessProfile'),
    extractFunction(interactiveQuote, 'resolvedQuoteBusinessLogo'),
    'result = { logo: resolvedQuoteBusinessLogo(), profile: resolvedQuoteBusinessProfile() };',
  ].join('\n'), context);
  return context.result;
}

const quoteBranding = resolveQuoteBranding(
  { businessProfile: { business_name: 'Issued Quote Co' } },
  { businessLogo: 'stale-browser-logo', businessProfile: { business_name: 'Stale Browser Co' } },
  { businessLogo: 'secure-current-logo', businessProfile: { business_name: 'Current Co' } },
);
assert.equal(quoteBranding.logo, 'secure-current-logo', 'Legacy quote logos should use the token-scoped current company logo');
assert.equal(quoteBranding.profile.business_name, 'Issued Quote Co', 'An embedded quote profile snapshot must remain authoritative');

function resolvePortalTheme(defaultTheme, quotes) {
  const context = { defaultTheme, quotes, result: null };
  vm.runInNewContext([
    extractFunction(portal, 'normalizePortalTheme'),
    extractFunction(portal, 'portalThemeOverrideFromQuotes'),
    extractFunction(portal, 'mergePortalTheme'),
    'result = mergePortalTheme(defaultTheme, portalThemeOverrideFromQuotes(quotes));',
  ].join('\n'), context);
  return context.result;
}

assert.equal(
  resolvePortalTheme({ headerColor: '#112233' }, [{ data: { portal_theme: { useDefault: true } } }]).headerColor,
  '#112233',
  'Portals using the default must inherit newly saved default colours',
);
assert.equal(
  resolvePortalTheme({ headerColor: '#112233' }, [{ data: { portal_theme: { headerColor: '#445566' } } }]).headerColor,
  '#445566',
  'A portal-specific theme must remain authoritative',
);
const logoOnlyOverride = resolvePortalTheme(
  { headerColor: '#112233' },
  [{ data: { portal_theme: { useDefault: true, portalLogo: 'portal-logo' } } }],
);
assert.equal(logoOnlyOverride.headerColor, '#112233', 'A logo-only override must continue inheriting default colours');
assert.equal(logoOnlyOverride.portalLogo, 'portal-logo', 'A portal-specific logo must remain authoritative');

assert(portal.includes('<title>Client Portal</title>'), 'The portal should use a neutral initial browser title');
assert(!portal.includes('<title>QuoteDr'), 'The client portal browser title must not show QuoteDr');
assert(!portal.includes('quotedr-logo.svg'), 'The portal PIN screen must not hard-code the QuoteDr logo');
assert(!portal.includes('rel="manifest"'), 'The client portal must not inherit the QuoteDr PWA manifest or app icon');
assert(portal.includes('id="portalFavicon"') && portal.includes('favicon.href = requestedLogo'), 'The portal tab icon should follow contractor branding with a neutral fallback');
assert(portal.includes('id="pinBrandLogo"') && portal.includes('function renderPortalPinBranding(theme)'), 'The PIN screen should render contractor branding');
assert(portal.includes('renderPortalPinBranding(t);'), 'Per-portal theme application should also update the PIN screen');
assert(portal.includes("document.title = companyName + ' - Client Portal';"), 'The portal browser title should use the contractor name');
assert(!portal.includes('Video link - hosted outside QuoteDr'), 'Client-visible portal asset labels should be product-neutral');
const contractorBrandingStart = portal.indexOf('async function getContractorName()');
const contractorBrandingEnd = portal.indexOf('function normalizePortalTheme', contractorBrandingStart);
const contractorBrandingSource = portal.slice(contractorBrandingStart, contractorBrandingEnd);
assert(contractorBrandingSource.includes("action: 'portal'") && contractorBrandingSource.includes('secureResult.branding'), 'Secure portals should obtain branding through their validated share token');
assert(!contractorBrandingSource.includes('localStorage'), 'Public portal branding must not fall back to stale browser account data');

assert(settings.includes('Portals set to use the default update when this is saved.'), 'Settings should explain default-theme inheritance');
assert(dashboard.includes('future default color and layout changes update this portal'), 'Manage Portals should explain inheritance and overrides');
assert(settings.includes('portal-specific overrides stay unchanged') && studio.includes('portal-specific overrides stay unchanged'), 'Both default-theme editors should explain override preservation');

assert(builder.includes('businessLogo: getLocalBusinessLogoSnapshot()'), 'Invoice generation should always create an explicit logo snapshot field');
assert(builder.includes('var loadedBusinessLogo = await loadLogoFromSupabase();'), 'Invoice generation should refresh the logo before snapshotting');
assert(builder.includes('brandingSnapshotVersion: 1') && builder.includes('brandingCapturedAt'), 'Invoice branding snapshots should be identifiable');
assert(invoice.includes('<title>Invoice</title>') && !invoice.includes('quotedr-logo.svg'), 'Public invoices should have neutral initial branding and no QuoteDr logo fallback');
assert(!invoice.includes('rel="manifest"'), 'Public invoices must not inherit the QuoteDr PWA manifest or app icon');
assert(invoice.includes('id="invoiceFavicon"') && invoice.includes('favicon.href = source'), 'The invoice tab icon should follow the resolved invoice branding');
assert(invoice.includes('invoiceSecureBrandingFallback = result.branding'), 'Public invoices should consume the token-scoped branding fallback');
assert(interactiveQuote.includes('<title>Your Quote</title>') && !interactiveQuote.includes('quotedr-logo.svg'), 'Public quotes should have neutral initial branding and no QuoteDr logo fallback');
assert(!interactiveQuote.includes('rel="manifest"'), 'Public quotes must not inherit the QuoteDr PWA manifest or app icon');
assert(interactiveQuote.includes('id="quoteFavicon"') && interactiveQuote.includes('function renderQuoteBranding()'), 'Public quotes should render contractor branding and a matching tab icon');
assert(interactiveQuote.includes('quoteSecureBrandingFallback = result.branding'), 'Public quotes should consume the token-scoped branding fallback');
assert(supabase.includes('branding: data.branding || null'), 'The secure-document client should pass through branding fallbacks');

const viewStart = clientDocument.indexOf('async function viewDocument(');
const viewEnd = clientDocument.indexOf('async function portalDocuments(', viewStart);
const viewSource = clientDocument.slice(viewStart, viewEnd);
assert(viewSource.indexOf('assertTokenAccess') >= 0, 'Secure invoice viewing must validate the share token');
assert(viewSource.indexOf('loadDocumentBrandingFallback') > viewSource.indexOf('assertTokenAccess'), 'Branding fallback reads must happen only after token validation');
assert(clientDocument.includes('sanitizePublicBusinessProfile'), 'Current profile fallback must be explicitly allowlisted');
assert(clientDocument.includes('sanitizePublicPortalTheme'), 'Portal default-theme branding must be explicitly allowlisted');
const portalDocumentsStart = clientDocument.indexOf('async function portalDocuments(');
const portalDocumentsEnd = clientDocument.indexOf('async function signedStorageUrl', portalDocumentsStart);
const portalDocumentsSource = clientDocument.slice(portalDocumentsStart, portalDocumentsEnd);
assert(portalDocumentsSource.indexOf('assertTokenAccess') < portalDocumentsSource.indexOf('loadPortalBranding'), 'Portal branding reads must happen only after token validation');
const needsBrandingStart = clientDocument.indexOf('function documentNeedsBrandingFallback(');
const needsBrandingEnd = clientDocument.indexOf('function cardPaymentEnabledForDocument', needsBrandingStart);
assert(!clientDocument.slice(needsBrandingStart, needsBrandingEnd).includes('documentTypeLabel'), 'Missing-branding fallback should cover public quotes and change orders as well as invoices');
const brandingStart = clientDocument.indexOf('async function loadDocumentBrandingFallback(');
const brandingEnd = clientDocument.indexOf('function cardPaymentEnabledForDocument', brandingStart);
assert(!clientDocument.slice(brandingStart, brandingEnd).includes('.update('), 'The public branding fallback must not mutate issued documents or branding records');

assert(settings.includes("await saveLogoToSupabase('')"), 'Removing a company logo should clear the cloud branding row as well as local cache');
assert(supabase.includes("else localStorage.removeItem('ald_company_logo');"), 'A successful empty cloud logo read should clear a stale browser logo');

console.log('branding consistency static checks passed');
