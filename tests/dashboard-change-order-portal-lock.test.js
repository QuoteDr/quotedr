const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8').replace(/\r\n/g, '\n');

function sourceFunction(name) {
  const starts = [
    dashboard.indexOf('        function ' + name + '('),
    dashboard.indexOf('        async function ' + name + '(')
  ].filter((index) => index >= 0);
  assert(starts.length, name + ' should exist in dashboard.html');
  const start = Math.min(...starts);
  const openingBrace = dashboard.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < dashboard.length; index += 1) {
    if (dashboard[index] === '{') depth += 1;
    if (dashboard[index] === '}') depth -= 1;
    if (depth === 0) return dashboard.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

assert(
  dashboard.includes('id="portalAssignLockWrap"') &&
    dashboard.includes('onclick="showDashboardChangeOrderPortalLockHelp()"') &&
    dashboard.includes('id="portalAssignAddNewBtn"') &&
    dashboard.includes('id="portalAssignMergeBtn"'),
  'Dashboard assignment should visibly explain and simplify a locked change-order destination'
);

assert(
  sourceFunction('openPortalAssignment').includes('resolveDashboardChangeOrderLockedPortal(quote)') &&
    sourceFunction('renderPortalAssignmentList').includes('String(portal && portal.id || \'\') === String(lockedPortal.id || \'\')'),
  'The dashboard modal should show only the original quote portal for a change order'
);

assert(
  sourceFunction('assignQuoteToPortal').includes('enforceDashboardChangeOrderPortalDestination(target, portal)') &&
    sourceFunction('shareDocumentThroughPortal').includes('resolveDashboardChangeOrderLockedPortal(quote)') &&
    sourceFunction('createPortalForQuote').includes('Change orders must use the original quote'),
  'Every dashboard publish path should fail closed instead of relying only on hidden controls'
);

const context = {
  window: {},
  QuoteDrChangeOrders: {
    isChangeOrder(row) { return (row.type || row.data && row.data.type) === 'change_order'; },
    parentQuoteId(row) { return row.parent_quote_id || row.data && row.data.parentQuoteId || ''; }
  },
  async loadDashboardFullQuote(id) {
    assert.strictEqual(id, 'parent-1');
    return {
      id: 'parent-1',
      quote_number: 'Q-2026-001',
      client_name: 'Client',
      data: { portal_visible: true, portal_id: 'portal-parent', portal_name: 'Client Project' }
    };
  },
  buildPortalRegistry() {
    return [{ id: 'portal-parent', name: 'Client Project', quoteIds: ['parent-1'], quotes: [], anchorRows: [] }];
  },
  allQuotes: [],
  quotePortalKey(row) { return row.data.portal_id; },
  quoteClientEmail() { return 'client@example.com'; },
  String,
  Object,
  Error
};

vm.createContext(context);
vm.runInContext(
  sourceFunction('dashboardDocumentIsChangeOrder') + '\n' +
    sourceFunction('dashboardChangeOrderParentId') + '\n' +
    sourceFunction('dashboardPortalFromParentQuote') + '\n' +
    sourceFunction('resolveDashboardChangeOrderLockedPortal') + '\n' +
    sourceFunction('enforceDashboardChangeOrderPortalDestination'),
  context
);

(async () => {
  const changeOrder = { id: 'co-1', type: 'change_order', parent_quote_id: 'parent-1', data: {} };
  const locked = await context.resolveDashboardChangeOrderLockedPortal(changeOrder);
  assert.strictEqual(locked.id, 'portal-parent');
  assert.strictEqual(locked.lockedToParentQuote, true);

  const allowed = await context.enforceDashboardChangeOrderPortalDestination(changeOrder, { id: 'portal-parent' });
  assert.strictEqual(allowed.id, 'portal-parent');

  await assert.rejects(
    context.enforceDashboardChangeOrderPortalDestination(changeOrder, { id: 'portal-other' }),
    /only be shared through the original quote's client portal/
  );

  console.log('dashboard change-order portal lock checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
