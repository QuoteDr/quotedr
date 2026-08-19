const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const memory = fs.readFileSync(path.join(root, 'property-memory.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');
const grants = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260521020743_tighten_private_table_anon_access.sql'), 'utf8');
const rls = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260808000732_team_accounts_rbac.sql'), 'utf8');

assert(builder.includes('id="managePropertyMemoryBtn"') && builder.includes('Manage Property Memory'), 'the address area needs an obvious manager entry point');
assert(builder.includes('id="propertyMemoryReminderArea"') && builder.includes('aria-live="polite"'), 'matching reminders need a non-destructive live region');
assert(builder.includes('property-memory.js?v=2026081001'), 'the builder must load the completed Property Memory module');
assert(builder.includes('@media (max-width: 767.98px)') && builder.includes('#propertyMemoryManagerModal .btn'), 'manager and destructive controls need mobile tap sizing');

[
  'id="propertyMemoryManagerModal"',
  'id="propertyMemoryManagerSearch"',
  'id="propertyMemoryManagerCurrentState"',
  'id="propertyMemoryManagerStatus"',
  'Review or edit',
  'Retry account sync'
].forEach(value => assert(memory.includes(value), `manager is missing ${value}`));
assert(memory.includes(".eq('user_id', user.id)") && memory.includes(".like('key', PROPERTY_MEMORY_KEY_PREFIX + '%')"), 'cloud listing must remain authenticated-user and namespace scoped');
assert(memory.includes('propertyMemoryScopedLocalKey(userId, normalizedAddress)'), 'device fallbacks must include the authenticated account ID');
assert(memory.includes("row.key !== propertyMemoryStorageKey(normalizedAddress)"), 'manager listing must reject mismatched cloud keys and values');

assert(memory.includes('normalized address: \' + normalizedAddress'), 'deletion confirmation must name the exact normalized address');
assert(memory.includes("filters: [{ column: 'key', value: propertyMemoryStorageKey(normalizedAddress) }]"), 'deletion must target only one exact Property Memory key');
assert(memory.includes("entityType: 'user_data'") && memory.includes("action: 'delete'"), 'deletion must use the durable authenticated user_data path');
const deleteStart = memory.indexOf('async function deleteEditingPropertyMemory()');
const deleteEnd = memory.indexOf('async function handlePropertyMemoryDeleteAcknowledgement', deleteStart);
const deleteBlock = memory.slice(deleteStart, deleteEnd);
assert(deleteBlock.indexOf('await removePropertyMemoryCloudRecord') < deleteBlock.indexOf('finishPropertyMemoryDeletion'), 'the device fallback must remain until cloud deletion is confirmed');
assert(deleteBlock.includes('account deletion is unconfirmed') && deleteBlock.includes('Retry removal for this address'), 'partial failure must remain truthful and retryable');
assert(deleteBlock.includes('Client CRM records, quote ownership') && deleteBlock.includes('current pricing will not change'), 'destructive confirmation must state the CRM/pricing boundary');

assert(memory.includes('Property work reminders'), 'the editor needs a structured reminders section');
assert(memory.includes('A trade or category') && memory.includes('A specific saved item or reference'), 'reminders need both supported target modes');
assert(memory.includes('function createPropertyReminderId') && memory.includes('function legacyPropertyReminderId'), 'new and legacy reminders need stable IDs');
assert(memory.includes('Edit reminder') && memory.includes('Remove reminder') && memory.includes('Update reminder'), 'reminder editing and removal must be explicit');
assert(memory.includes('Dismiss for this quote'), 'matching reminders need quote-scoped acknowledgement');
assert(memory.includes('function propertyReminderMatchesItem') && memory.includes('function findMatchingPropertyReminders'), 'reminder targeting must be independently structured');
const matchingStart = memory.indexOf('function findMatchingPropertyReminders');
const matchingEnd = memory.indexOf('function currentQuoteLineItems', matchingStart);
const matchingBlock = memory.slice(matchingStart, matchingEnd);
assert(matchingBlock.includes('normalizedRecord.normalizedAddress !== normalizedAddress'), 'reminder matching must verify the exact normalized property');
assert(!matchingBlock.includes('room.markup') && !matchingBlock.includes('.quantity =') && !matchingBlock.includes('.rate =') && !matchingBlock.includes('.total ='), 'reminder matching must not mutate quote values');

assert(storage.includes('propertyMemoryReminderAcknowledgements: Array.isArray(window._propertyMemoryReminderAcknowledgements)'), 'quote saves must own reminder acknowledgement state');
assert(storage.includes('Array.isArray(data.propertyMemoryReminderAcknowledgements)') && storage.includes(': [];'), 'legacy quotes without reminder fields must restore safely');
assert(storage.includes('setQuoteReminderAcknowledgements([])'), 'a new quote must not inherit another quote\'s dismissals');
assert(builder.includes('propertyMemoryReminderAcknowledgements: Array.isArray(window._propertyMemoryReminderAcknowledgements)'), 'legacy local draft saves must retain acknowledgements');
assert((builder.match(/setQuoteReminderAcknowledgements\(window\._propertyMemoryReminderAcknowledgements\)/g) || []).length >= 2, 'legacy draft loaders must restore quote-scoped acknowledgements');
assert(builder.includes('QuoteDrPropertyMemory.evaluateReminders()'), 'rerenders must reevaluate reminders without appending duplicate prompts');

assert(!memory.includes('service_role'), 'browser Property Memory code must never use the service role');
assert(!memory.includes(".from('clients')"), 'Property Memory must never query or mutate client CRM rows');
assert(grants.includes("'user_data'") && grants.includes('revoke all privileges on table public.%I from anon') && grants.includes('grant select, insert, update, delete on table public.%I to authenticated'), 'user_data must retain explicit authenticated grants and no anon table privileges');
assert(rls.includes('quotedr_user_data_owner_boundary') && rls.includes('using ((select auth.uid()) = user_id)') && rls.includes('with check ((select auth.uid()) = user_id)'), 'user_data RLS must retain the authenticated owner boundary');
assert(supabase.includes("if (target.ownerScoped !== false) query = query.eq('user_id', operation.userId)"), 'durable update/delete operations must owner-scope before exact filters');

console.log('property memory completion static tests passed');
