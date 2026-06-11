const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="newQuoteClientDropdown"'),
  'New quote modal should include a custom dropdown for saved client typeahead'
);

assert(
  /id="newQuoteClientName"[^>]*autocomplete="off"/.test(dashboard) &&
    !/id="newQuoteClientName"[^>]*\blist=/.test(dashboard),
  'Client name input should use the dashboard typeahead dropdown instead of a plain datalist'
);

assert(
  dashboard.includes('id="newQuoteClientEmail"') &&
    dashboard.includes('id="newQuoteClientPhone"'),
  'New quote modal should include email and phone fields from the builder client information'
);

[
  'getDashboardSavedClients',
  'refreshDashboardSavedClientsFromCloud',
  'searchNewQuoteClients',
  'showNewQuoteClientSuggestions',
  'hideNewQuoteClientSuggestions',
  'findNewQuoteClientByName',
  'findDashboardClientByEmail',
  'applyNewQuoteClientSelection'
].forEach(function(fnName) {
  assert(dashboard.includes('function ' + fnName + '('), fnName + ' should be implemented');
});

assert(
  /showNewQuoteClientSuggestions\(\)/.test(dashboard) &&
    /applyNewQuoteClientSelection\(client\)/.test(dashboard),
  'Client input should show saved-client matches and apply the clicked client'
);

assert(
  /newQuoteClientEmail['"],\s*['"]newQuoteClientPhone/.test(dashboard) ||
    /newQuoteClientEmail/.test(dashboard) && /newQuoteClientPhone/.test(dashboard) && /createAndOpenQuote/.test(dashboard),
  'Email and phone fields should participate in new quote creation'
);

assert(
  /var clientEmail\s*=\s*document\.getElementById\('newQuoteClientEmail'\)\.value\.trim\(\)/.test(dashboard) &&
    /var clientPhone\s*=\s*document\.getElementById\('newQuoteClientPhone'\)\.value\.trim\(\)/.test(dashboard),
  'New quote creation should save the visible email and phone fields'
);

assert(
  /clientEmail:\s*clientEmail/.test(dashboard) && /clientPhone:\s*clientPhone/.test(dashboard),
  'New quote payload should preserve client email and phone'
);

assert(
  dashboard.includes('listClientsFromSupabase') && dashboard.includes("localStorage.setItem('ald_clients'"),
  'Dashboard should refresh saved clients from cloud before showing new quote suggestions'
);
