const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="clientFilesViewBtn"') &&
    dashboard.includes('openClientFilesPicker()') &&
    dashboard.includes('<i class="fas fa-users me-1"></i>Clients'),
  'Dashboard should add a Clients picker button beside List and Board'
);

assert(
  dashboard.includes('id="clientFilesModal"') &&
    dashboard.includes('id="clientFilesSearch"') &&
    dashboard.includes('id="clientFilesList"'),
  'Dashboard should include a searchable client files picker modal'
);

assert(
  dashboard.includes('function getClientFileGroups()') &&
    dashboard.includes('function renderClientFilesPicker()') &&
    dashboard.includes('function selectClientFilesFilter(') &&
    dashboard.includes('function clearClientFilesFilter()'),
  'Dashboard should provide client grouping and selection helpers'
);

assert(
  dashboard.includes('var selectedClientFilesFilter = null') &&
    dashboard.includes('quoteMatchesSelectedClient(quote)') &&
    dashboard.includes('updateClientFilesFilterBadge(filtered.length)'),
  'Dashboard filtering should combine search/status filters with the selected client filter'
);

assert(
  dashboard.includes('id="clientFilesFilterBadge"') &&
    dashboard.includes('Clear client filter'),
  'Dashboard should show a clearable badge when a client filter is active'
);
