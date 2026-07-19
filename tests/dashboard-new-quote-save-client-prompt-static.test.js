const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

[
  'function getNewQuoteClientDraft()',
  'function isNewQuoteClientDraftSaveable(',
  'function dashboardClientExistsForDraft(',
  'function saveNewQuoteClientDraft(',
  'function saveNewQuoteClientFromModal()',
  'function maybePromptSaveNewQuoteClient('
].forEach(function(fragment) {
  assert(dashboard.includes(fragment), fragment + ' should be implemented for saving new dashboard clients');
});

assert(
  dashboard.includes('Client not found. Do you want to save this client to your database?') &&
    /maybePromptSaveNewQuoteClient\(clientDraft\)/.test(dashboard),
  'New quote creation should ask to save unknown client info before opening the builder'
);

assert(
  /saveNewQuoteClientDraft[\s\S]*localStorage\.setItem\('ald_clients'/.test(dashboard) &&
    /saveNewQuoteClientDraft[\s\S]*saveClientToSupabase\(/.test(dashboard),
  'Accepting the prompt should save the client locally and sync through the existing Supabase helper'
);

const clientExistsImplementation = dashboard.split('function dashboardClientExistsForDraft(client) {')[1]
  .split('async function saveNewQuoteClientDraft')[0];
assert(
  clientExistsImplementation.includes('findNewQuoteClientByName(client.name)') &&
    !clientExistsImplementation.includes('findDashboardClientByEmail'),
  'Prompt should be based on whether the entered client name is already saved'
);

assert(
  dashboard.includes('id="newQuoteSaveClientBtn"') &&
    dashboard.includes('onclick="saveNewQuoteClientFromModal()"') &&
    dashboard.includes('Client saved to your database.'),
  'New quote modal should provide a visible Save Client action with confirmation feedback'
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
