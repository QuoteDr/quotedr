const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const clients = fs.readFileSync(path.join(root, 'quote-clients.js'), 'utf8');
const lookup = fs.readFileSync(path.join(root, 'quote-contact-property-lookup.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');

[
  ['clientName', 'clientDropdown'],
  ['projectAddress', 'projectAddressDropdown'],
  ['clientPhone', 'clientPhoneDropdown'],
  ['clientEmail', 'clientEmailDropdown']
].forEach(([fieldId, dropdownId]) => {
  assert(builder.includes(`id="${fieldId}"`), `missing lookup field ${fieldId}`);
  assert(builder.includes(`aria-controls="${dropdownId}"`), `${fieldId} should own an accessible suggestion list`);
  assert(builder.includes(`id="${dropdownId}"`) && builder.includes('role="listbox"'), `missing listbox ${dropdownId}`);
});

assert(builder.includes('quote-contact-property-lookup.js?v=2026080301'), 'Quote Builder should load the shared contact/property lookup module');
assert(!builder.includes('onkeyup="showClientSuggestions()"'), 'the old name-only inline autocomplete should be replaced');
assert(builder.includes('.contact-lookup-dropdown') && builder.includes('@media (max-width: 575.98px)'), 'suggestions should include responsive mobile styling');

['clientName', 'projectAddress', 'clientPhone', 'clientEmail'].forEach(fieldId => {
  assert(lookup.includes(`${fieldId}: {`), `lookup module should bind ${fieldId}`);
});
assert(lookup.includes("event.key === 'ArrowDown'") && lookup.includes("event.key === 'ArrowUp'") && lookup.includes("event.key === 'Enter'") && lookup.includes("event.key === 'Escape'"), 'lookup should support complete keyboard selection behavior');
assert(lookup.includes("input.addEventListener('input'") && lookup.includes("input.addEventListener('focus'") && lookup.includes("input.addEventListener('blur'"), 'all fields should support typing, refocus, and accessible dismissal');
assert(lookup.includes("option.setAttribute('role', 'option')") && lookup.includes("input.setAttribute('aria-activedescendant'"), 'active suggestions should expose combobox option semantics');
assert(lookup.includes('result.clientName') && lookup.includes('result.address') && lookup.includes('result.phone') && lookup.includes('result.email'), 'each suggestion should identify the client, property, and contact details');

const searchStart = lookup.indexOf('function searchClientProperties');
const searchEnd = lookup.indexOf('function getInput', searchStart);
const searchBlock = lookup.slice(searchStart, searchEnd);
assert(searchBlock && !searchBlock.includes('fillClientInfo'), 'searching must not populate linked fields before an explicit selection');
assert(lookup.includes('function selectSuggestion') && lookup.includes('window.fillClientInfo'), 'selection should use the existing linked-field population flow');
assert(lookup.includes('clearSelectedRelationship();') && !lookup.includes('generalSiteNotes'), 'manual edits should clear stale relationship IDs without copying Property Memory data');

assert(clients.includes('normalizeClientProperties') && clients.includes('upsertClientProperty'), 'legacy client records should gain compatible multi-property associations');
assert(clients.includes('source.crm.quoteDrProperties'), 'cloud-backed property associations should load from the existing CRM JSON column');
const propertyStart = clients.indexOf('function normalizeClientProperty(property)');
const propertyEnd = clients.indexOf('function normalizeClientProperties', propertyStart);
const propertyBlock = clients.slice(propertyStart, propertyEnd);
['address', 'city', 'phone', 'email', 'label'].forEach(field => assert(propertyBlock.includes(field), `property relationship should retain ${field}`));
assert(!propertyBlock.includes('notes:') && !propertyBlock.includes('crm:'), 'personal client preferences and notes must not enter property associations');

const fillStart = clients.indexOf('function fillClientInfo');
const fillEnd = clients.indexOf('function saveCurrentClient', fillStart);
const fillBlock = clients.slice(fillStart, fillEnd);
['clientName', 'projectAddress', 'clientPhone', 'clientEmail'].forEach(field => assert(fillBlock.includes(field), `explicit selection should populate ${field}`));
assert(fillBlock.includes('QuoteDrPropertyMemory.refreshForCurrentAddress()'), 'address selection should refresh the separate Property Memory entry');
assert(fillBlock.includes("typeof markUnsaved === 'function'"), 'explicit selection should mark the quote changed');

assert(supabase.includes('function qdClientCrmForStorage') && supabase.includes('crm.quoteDrProperties = properties'), 'linked properties should sync through the existing clients.crm JSON without a migration');
assert(/saveClientToSupabase[\s\S]*crm:\s*qdClientCrmForStorage\(client\)/.test(supabase), 'individual client cloud saves should include linked properties');
assert(/saveAllClientsToSupabase[\s\S]*crm:\s*qdClientCrmForStorage\(c\)/.test(supabase), 'bulk client cloud saves should include linked properties');
assert(storage.includes('(normalizedCloud.properties || []).concat(normalizedLocal.properties || [])'), 'cloud startup should merge property relationships without overwriting local client fields');

console.log('contact/property lookup static tests passed');
