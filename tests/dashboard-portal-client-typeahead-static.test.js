const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="portalAssignClientNameDropdown"') &&
  dashboard.includes('id="portalAssignClientEmailDropdown"'),
  'Portal assignment modal should include in-modal dropdowns for saved client suggestions'
);

assert(
  !/\bid="portalAssignClientName"[^>]*\blist=/.test(dashboard),
  'Portal client name input should not use the browser datalist UI'
);

assert(
  !/\bid="portalAssignClientEmail"[^>]*\blist=/.test(dashboard),
  'Portal client email input should not use the browser datalist UI'
);

[
  'populatePortalAssignClientSuggestions',
  'searchPortalAssignClients',
  'showPortalAssignClientSuggestions',
  'hidePortalAssignClientSuggestions',
  'findDashboardClientByEmail',
  'applyPortalAssignClientSelection'
].forEach(function(fnName) {
  assert(dashboard.includes('function ' + fnName + '('), fnName + ' should be implemented');
});

assert(
  dashboard.includes('populatePortalAssignClientSuggestions();') &&
  dashboard.includes('refreshDashboardSavedClientsFromCloud();'),
  'Portal modal should populate local suggestions and refresh cloud clients when opened'
);

assert(
  /portalAssignClientName[\s\S]*addEventListener\('input',\s*function\(\)\s*\{\s*showPortalAssignClientSuggestions\('name'\);/.test(dashboard),
  'Portal client name input should show saved-client suggestions'
);

assert(
  /portalAssignClientEmail[\s\S]*addEventListener\('input',\s*function\(\)\s*\{\s*showPortalAssignClientSuggestions\('email'\);/.test(dashboard),
  'Portal client email input should show saved-client suggestions'
);

assert(
  dashboard.includes('portal-client-dropdown') && dashboard.includes('portal-client-suggestion'),
  'Portal client typeahead should be styled as a contained modal dropdown'
);
