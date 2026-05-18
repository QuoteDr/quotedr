const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('id="newQuoteClientSuggestions"'),
  'New quote modal should include a datalist for saved client typeahead'
);

assert(
  /id="newQuoteClientName"[^>]*\blist="newQuoteClientSuggestions"/.test(dashboard),
  'Client name input should be connected to saved client suggestions'
);

[
  'getDashboardSavedClients',
  'refreshDashboardSavedClientsFromCloud',
  'populateNewQuoteClientSuggestions',
  'findNewQuoteClientByName',
  'applyNewQuoteClientSelection'
].forEach(function(fnName) {
  assert(dashboard.includes('function ' + fnName + '('), fnName + ' should be implemented');
});

assert(
  /newQuoteClientName['"],\s*['"]input['"],\s*applyNewQuoteClientSelection/.test(dashboard) ||
  /addEventListener\(['"]input['"],\s*applyNewQuoteClientSelection\)/.test(dashboard),
  'Client input should apply a saved-client selection as soon as a datalist option is picked'
);

assert(
  /clientEmail:\s*clientEmail/.test(dashboard) && /clientPhone:\s*clientPhone/.test(dashboard),
  'New quote payload should preserve saved client email and phone'
);

assert(
  dashboard.includes('listClientsFromSupabase') && dashboard.includes("localStorage.setItem('ald_clients'"),
  'Dashboard should refresh saved clients from cloud before showing new quote suggestions'
);
