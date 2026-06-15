const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const clients = fs.readFileSync('quote-clients.js', 'utf8');
const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const schema = fs.readFileSync('supabase-schema.sql', 'utf8');
const migration = fs.existsSync('supabase/migrations/20260614000000_add_client_crm_metadata.sql')
  ? fs.readFileSync('supabase/migrations/20260614000000_add_client_crm_metadata.sql', 'utf8')
  : '';

[
  'More Client Details',
  'id="newClientCrmNotes"',
  'id="newClientBirthday"',
  'id="newClientPreferredContact"',
  'id="newClientTags"',
  'id="newClientFollowUpDate"',
  'id="newClientReferralSource"'
].forEach(function(fragment) {
  assert(builder.includes(fragment), 'Client Database modal should include CRM field: ' + fragment);
});

assert(
  /data-bs-toggle="collapse"[\s\S]*data-bs-target="#clientCrmDetails"/.test(builder),
  'CRM fields should live in a collapsed More Client Details section'
);

assert(
  clients.includes('normalizeClientRecord') &&
    clients.includes('readClientCrmForm') &&
    clients.includes('writeClientCrmForm') &&
    clients.includes('newClientCrmNotes') &&
    clients.includes('newClientBirthday') &&
    clients.includes('newClientPreferredContact') &&
    clients.includes('newClientTags') &&
    clients.includes('newClientFollowUpDate') &&
    clients.includes('newClientReferralSource'),
  'Client module should normalize, read, and write CRM metadata fields'
);

const fillClientInfoBody = (clients.match(/function fillClientInfo\([^)]*\) \{([\s\S]*?)\n        \}/) || [])[1] || '';
assert(
  fillClientInfoBody.includes('clientPhone') &&
    fillClientInfoBody.includes('clientEmail') &&
    fillClientInfoBody.includes('projectAddress') &&
    !fillClientInfoBody.includes('newClientCrm') &&
    !fillClientInfoBody.includes('.crm'),
  'Quote-facing autofill should remain limited to standard client fields'
);

assert(
  clients.includes('getClientSearchText') &&
    clients.includes('crm.notes') &&
    clients.includes('crm.tags') &&
    clients.includes('crm.referralSource'),
  'Client list filtering should search CRM notes, tags, and referral/source'
);

assert(
  supabase.includes('crm:') &&
    /saveClientToSupabase[\s\S]*crm/.test(supabase) &&
    /saveAllClientsToSupabase[\s\S]*crm/.test(supabase),
  'Supabase client sync should preserve CRM metadata'
);

assert(
  /loadClientsFromSupabase[\s\S]*crm:\s*sc\.crm/.test(storage) &&
    /refreshDashboardSavedClientsFromCloud[\s\S]*crm:\s*client\.crm/.test(dashboard),
  'Cloud-loaded clients should preserve CRM metadata when merged into localStorage'
);

assert(
  migration.includes('alter table public.clients') &&
    migration.includes('add column if not exists crm jsonb not null default') &&
    migration.includes("'{}'::jsonb"),
  'Migration should add clients.crm jsonb metadata storage'
);

assert(
  /create table if not exists clients[\s\S]*crm jsonb not null default '\{\}'::jsonb/.test(schema),
  'Base Supabase schema should include clients.crm for fresh installs'
);
