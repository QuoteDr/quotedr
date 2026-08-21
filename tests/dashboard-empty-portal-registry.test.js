const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

function sourceFunction(name) {
  const plain = dashboard.indexOf('        function ' + name + '(');
  const asyncStart = dashboard.indexOf('        async function ' + name + '(');
  const start = plain >= 0 ? plain : asyncStart;
  assert(start >= 0, name + ' should exist in dashboard.html');
  const openingBrace = dashboard.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < dashboard.length; index += 1) {
    if (dashboard[index] === '{') depth += 1;
    if (dashboard[index] === '}') depth -= 1;
    if (depth === 0) return dashboard.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

const createPortalSource = sourceFunction('createPortalForQuote');
assert(
  createPortalSource.includes('upsertDashboardEmptyPortal({') &&
    !createPortalSource.includes('qdDurableQuoteRowInsert') &&
    !createPortalSource.includes('portal_placeholder') &&
    !createPortalSource.includes("quote_number: 'PORTAL-"),
  'Creating an empty portal should save portal metadata without inserting a synthetic quote'
);

assert(
  sourceFunction('saveDashboardEmptyPortals').includes("saveUserDataValue(DASHBOARD_EMPTY_PORTALS_KEY"),
  'Empty portals should persist in authenticated user data'
);

const filteringContext = {
  dashboardFullQuoteRows: {},
  junkQuotes: [],
  dashboardPortalPlaceholderRows: [],
  allQuotes: [],
  Object,
  Array,
  String,
  parseFloat,
  Date,
  async purgeExpiredJunkQuotes(rows) { return rows; },
  autocleanDuplicates(rows) { return rows; },
  updateJunkBadge() {}
};
vm.createContext(filteringContext);
vm.runInContext(
  sourceFunction('quoteData') + '\n' +
    sourceFunction('quoteIsJunked') + '\n' +
    sourceFunction('quoteIsPortalPlaceholder') + '\n' +
    sourceFunction('setDashboardQuotesFromCloud'),
  filteringContext
);

const realQuote = { id: 'real-1', quote_number: 'Q-100', total: 450, data: { rooms: [] } };
const namedPortalQuote = { id: 'real-2', quote_number: 'PORTAL-RENOVATION', total: 1200, data: { rooms: [] } };
const genuineZeroQuote = {
  id: 'real-3', quote_number: 'PORTAL-KITCHEN', total: 0,
  data: { quoteTitle: 'Kitchen planning', rooms: [] }
};
const flaggedPlaceholder = {
  id: 'placeholder-1', quote_number: 'PORTAL-ABC123', total: 0,
  data: { portal_placeholder: true, portal_visible: true, portal_id: 'portal-old', rooms: [] }
};
const legacyPlaceholder = {
  id: 'placeholder-2', quote_number: 'PORTAL-DEF45678', total: 0,
  data: { quoteTitle: 'Rosa and Doug Carrick Portal', portal_visible: false, rooms: [] }
};

(async () => {
  const queryCalls = [];
  const queryChain = {
    select(columns) { queryCalls.push(['select', columns]); return this; },
    eq(column, value) { queryCalls.push(['eq', column, value]); return this; },
    async maybeSingle() {
      queryCalls.push(['maybeSingle']);
      return { data: { value: [{ id: 'portal-query', name: 'Query Portal' }] }, error: null };
    }
  };
  const loadContext = {
    window: { currentUser: { id: 'user-1' } },
    _supabase: { from(table) { queryCalls.push(['from', table]); return queryChain; } },
    dashboardEmptyPortals: [],
    DASHBOARD_EMPTY_PORTALS_KEY: 'client_portals',
    console,
    Array,
    Object,
    String,
    Date
  };
  vm.createContext(loadContext);
  vm.runInContext(
    sourceFunction('normalizeDashboardEmptyPortal') + '\n' + sourceFunction('loadDashboardEmptyPortals'),
    loadContext
  );
  const loadedPortals = await loadContext.loadDashboardEmptyPortals();
  assert.strictEqual(loadedPortals[0].id, 'portal-query');
  assert.deepStrictEqual(queryCalls, [
    ['from', 'user_data'],
    ['select', 'value'],
    ['eq', 'user_id', 'user-1'],
    ['eq', 'key', 'client_portals'],
    ['maybeSingle']
  ], 'Portal registry reads should stay scoped to the authenticated user and registry key');

  const visibleRows = await filteringContext.setDashboardQuotesFromCloud([
    realQuote,
    namedPortalQuote,
    genuineZeroQuote,
    flaggedPlaceholder,
    legacyPlaceholder
  ]);
  assert.deepStrictEqual(
    visibleRows.map((row) => row.id),
    ['real-1', 'real-2', 'real-3'],
    'Legacy portal metadata rows should not appear as dashboard quotes'
  );
  assert.deepStrictEqual(
    filteringContext.dashboardPortalPlaceholderRows.map((row) => row.id),
    ['placeholder-1', 'placeholder-2'],
    'Legacy portal metadata rows should remain available to the portal manager'
  );

  const registryContext = {
    dashboardEmptyPortals: [{
      id: 'portal-empty', name: 'Rosa and Doug Carrick', clientName: 'Rosa and Doug Carrick',
      clientEmail: 'rosa@example.com', pin: '2468', theme: { layoutStyle: 'client-os' },
      secureToken: 'stable-token', secureAnchorId: 'anchor-1', secureCreatedAt: '2026-08-18T12:00:00Z'
    }],
    dashboardPortalPlaceholderRows: [flaggedPlaceholder],
    quotePortalKey(row) { return row.data.portal_id; },
    quoteClientName(row) { return row.client_name || row.data.portal_client_name || ''; },
    quoteClientEmail(row) { return row.data.portal_client_email || ''; },
    quoteIsPortalPlaceholder(row) { return row.data && row.data.portal_placeholder === true; },
    Object,
    String
  };
  vm.createContext(registryContext);
  vm.runInContext(
    sourceFunction('quoteIsPortalAnchorOnly') + '\n' + sourceFunction('buildPortalRegistry') + '\n' + sourceFunction('portalDocumentCount'),
    registryContext
  );
  const emptyRegistry = registryContext.buildPortalRegistry([]);
  const newPortal = emptyRegistry.find((portal) => portal.id === 'portal-empty');
  const legacyPortal = emptyRegistry.find((portal) => portal.id === 'portal-old');
  assert(newPortal, 'A portal with no documents should remain visible in Manage Portals');
  assert.strictEqual(newPortal.quoteIds.length, 0, 'An empty portal should have no synthetic quote ids');
  assert.strictEqual(registryContext.portalDocumentCount(newPortal), 0);
  assert.strictEqual(newPortal.secureToken, 'stable-token', 'Empty portal registry should retain its existing client link');
  assert.strictEqual(newPortal.secureAnchorId, 'anchor-1');
  assert(legacyPortal, 'Existing placeholder-backed portals should remain manageable');
  assert.strictEqual(registryContext.portalDocumentCount(legacyPortal), 0);

  const fields = {
    portalAssignClientName: { value: 'Rosa and Doug Carrick' },
    portalAssignClientEmail: { value: 'rosa@example.com' },
    portalAssignPortalName: { value: 'Rosa and Doug Carrick' },
    portalAssignCreateWrap: { style: {} }
  };
  const savedEmptyPortals = [];
  const quoteUpdates = [];
  const finishedPortalActions = [];
  const createContext = {
    window: { _portalAssignQuoteId: '' },
    allQuotes: [],
    document: { getElementById(id) { return fields[id]; } },
    makePortalId() { return 'portal-new'; },
    quoteClientName() { return 'Fallback client'; },
    quoteClientEmail() { return 'fallback@example.com'; },
    async upsertDashboardEmptyPortal(portal) { savedEmptyPortals.push(portal); },
    async refreshQuotes() {},
    async finishPendingDashboardPortalAction(quoteId) { finishedPortalActions.push(quoteId); },
    renderPortalAssignmentList() {},
    async loadDashboardFullQuote(quote) { return quote; },
    async confirmDashboardPortalZeroPricedItems() { return true; },
    stampPortalAddedAt(data) { data.portal_added_at = 'now'; },
    async qdDurableQuoteRowUpdate(id, values) { quoteUpdates.push({ id, values }); return { error: null }; },
    qdAlert(message) { throw new Error(message); },
    Math,
    Date,
    Object
  };
  vm.createContext(createContext);
  vm.runInContext(createPortalSource, createContext);

  await createContext.createPortalForQuote();
  assert.strictEqual(savedEmptyPortals.length, 1, 'Empty portal creation should write one portal record');
  assert.strictEqual(savedEmptyPortals[0].id, 'portal-new');
  assert.strictEqual(savedEmptyPortals[0].name, 'Rosa and Doug Carrick');
  assert.strictEqual(quoteUpdates.length, 0, 'Empty portal creation should not update or insert a quote');

  createContext.window._portalAssignQuoteId = 'quote-1';
  createContext.allQuotes.push({ id: 'quote-1', client_name: 'Rosa', data: {} });
  await createContext.createPortalForQuote();
  assert.strictEqual(savedEmptyPortals.length, 1, 'Creating a portal for a selected quote should not add an empty registry record');
  assert.strictEqual(quoteUpdates.length, 1, 'Creating a portal from a quote should preserve the existing assignment flow');
  assert.strictEqual(quoteUpdates[0].values.data.portal_id, 'portal-new');
  assert.deepStrictEqual(finishedPortalActions, ['quote-1'], 'a pending share action should resume after portal creation');

  console.log('dashboard empty portal registry test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
