const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

[
  'function getNewQuoteClientDraft()',
  'function isNewQuoteClientDraftSaveable(',
  'function dashboardClientExistsForDraft(',
  'function saveNewQuoteClientDraft(',
  'function maybePromptSaveNewQuoteClient('
].forEach(function(fragment) {
  assert(dashboard.includes(fragment), fragment + ' should be implemented for saving new dashboard clients');
});

assert(
  dashboard.includes('Would you like to save this client information to the database?') &&
    /maybePromptSaveNewQuoteClient\(clientDraft\)/.test(dashboard),
  'New quote creation should ask to save unknown client info before opening the builder'
);

assert(
  /saveNewQuoteClientDraft[\s\S]*localStorage\.setItem\('ald_clients'/.test(dashboard) &&
    /saveNewQuoteClientDraft[\s\S]*saveClientToSupabase\(client\)/.test(dashboard),
  'Accepting the prompt should save the client locally and sync through the existing Supabase helper'
);

assert(
  /dashboardClientExistsForDraft[\s\S]*findNewQuoteClientByName/.test(dashboard) &&
    /dashboardClientExistsForDraft[\s\S]*findDashboardClientByEmail/.test(dashboard),
  'Prompt should be skipped for clients already known by name or email'
);

assert(
  /function isNewQuoteClientDraftSaveable\(client\) \{\s*return !!\(client && client\.name\);/.test(dashboard),
  'A new client name should be enough to offer saving to the database'
);

assert(
  /if \(!clientName\)/.test(dashboard) &&
    dashboard.indexOf('if (!clientName)') < dashboard.indexOf('maybePromptSaveNewQuoteClient(clientDraft)'),
  'Prompt should not appear before required client name validation'
);
