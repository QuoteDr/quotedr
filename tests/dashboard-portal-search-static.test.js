const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="portalAssignSearch"') &&
    dashboard.includes('Search portal name, client, or email'),
  'Manage Portals should include a portal search input'
);

assert(
  dashboard.includes('function portalMatchesAssignmentSearch(portal, query)') &&
    dashboard.includes('portal && portal.name') &&
    dashboard.includes('portal && portal.clientName') &&
    dashboard.includes('portal && portal.clientEmail'),
  'Portal search should match portal name, client name, and client email'
);

assert(
  /id="portalAssignSearch"[^>]*oninput="renderPortalAssignmentList\(\)"/.test(dashboard),
  'Portal search should filter the list as the user types'
);

assert(
  dashboard.includes('No portals match your search.') &&
    dashboard.includes('function clearPortalAssignmentSearch()'),
  'Portal search should provide an empty state and a clear action'
);

assert(
  /var visiblePortals = portals\.filter\(function\(portal\)/.test(dashboard) &&
    /visiblePortals\.map\(function\(portal\)/.test(dashboard),
  'Manage Portals should render only portals matching the search'
);
function dashboardFunctionSource(name) {
  const start = dashboard.indexOf('        function ' + name + '(');
  assert(start >= 0, name + ' should exist in dashboard.html');
  const next = dashboard.indexOf('\n        function ', start + 1);
  return dashboard.slice(start, next < 0 ? dashboard.length : next);
}

const searchContext = {};
vm.runInNewContext(
  dashboardFunctionSource('normalizePortalDashboardValue') + '\n' +
    dashboardFunctionSource('portalMatchesAssignmentSearch') + `
      const testPortal = {
        name: 'Kitchen Renovation Portal',
        clientName: 'Alexandra Rawlings',
        clientEmail: 'arawlings777@icloud.com'
      };
      searchResults = [
        portalMatchesAssignmentSearch(testPortal, normalizePortalDashboardValue('kitchen')),
        portalMatchesAssignmentSearch(testPortal, normalizePortalDashboardValue('RAWLINGS')),
        portalMatchesAssignmentSearch(testPortal, normalizePortalDashboardValue('777@ICLOUD')),
        portalMatchesAssignmentSearch(testPortal, normalizePortalDashboardValue('unrelated'))
      ];
    `,
  searchContext
);

assert.strictEqual(searchContext.searchResults[0], true, 'Portal name search should match');
assert.strictEqual(searchContext.searchResults[1], true, 'Client name search should be case-insensitive');
assert.strictEqual(searchContext.searchResults[2], true, 'Client email search should support partial matches');
assert.strictEqual(searchContext.searchResults[3], false, 'Unrelated searches should not match');
