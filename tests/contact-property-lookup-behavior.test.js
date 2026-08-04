const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const clientsSource = fs.readFileSync(path.join(root, 'quote-clients.js'), 'utf8');
const lookupSource = fs.readFileSync(path.join(root, 'quote-contact-property-lookup.js'), 'utf8');

function normalizedAddress(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function makeContext() {
  const fields = {
    clientName: { value: '', dataset: {}, setAttribute() {}, removeAttribute() {} },
    projectAddress: { value: '', dataset: {}, setAttribute() {}, removeAttribute() {} },
    clientPhone: { value: '', dataset: {}, setAttribute() {}, removeAttribute() {} },
    clientEmail: { value: '', dataset: {}, setAttribute() {}, removeAttribute() {} }
  };
  const saved = {
    'Maya Patel': {
      id: 'client-maya',
      name: 'Maya Patel',
      phone: '(416) 555-1000',
      email: 'maya@example.com',
      address: '10 King Street',
      city: 'Toronto',
      crm: {
        tags: 'repeat client',
        quoteDrProperties: [
          { id: 'property-king', label: 'Home', address: '10 King Street', city: 'Toronto' },
          { id: 'property-queen', label: 'Rental', address: '22 Queen Avenue', city: 'Toronto', phone: '647-555-2200' }
        ]
      }
    },
    'Robin Lee': {
      name: 'Robin Lee',
      phone: '905-555-5000',
      email: 'shared@example.com',
      address: '5 Lake Road'
    }
  };
  const store = { ald_clients: JSON.stringify(saved) };
  const counters = { propertyRefresh: 0, unsaved: 0 };
  const windowObject = {
    QuoteDrPropertyMemory: {
      __test: { normalizeAddress: normalizedAddress },
      refreshForCurrentAddress() { counters.propertyRefresh += 1; }
    },
    setTimeout
  };
  const context = {
    window: windowObject,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) { return fields[id] || null; }
    },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    },
    console,
    setTimeout,
    clearTimeout,
    alert() {},
    confirm() { return true; },
    markUnsaved() { counters.unsaved += 1; }
  };
  windowObject.window = windowObject;
  vm.createContext(context);
  vm.runInContext(clientsSource, context);
  vm.runInContext(lookupSource, context);
  return { context, window: windowObject, fields, store, counters };
}

const fixture = makeContext();
const clientApi = fixture.window;
const lookup = fixture.window.QuoteDrContactLookup.__test;
const clients = clientApi.getAllClients();

assert.strictEqual(clients['Maya Patel'].properties.length, 2, 'legacy primary address and stored properties should de-duplicate');
assert.strictEqual(clients['Maya Patel'].crm.tags, 'repeat client', 'personal CRM metadata should remain on the client');
assert.deepStrictEqual(
  Object.keys(clients['Maya Patel'].properties[0]).sort(),
  ['address', 'city', 'email', 'id', 'label', 'phone'].sort(),
  'property associations should contain only relationship/contact fields'
);

const rows = lookup.buildRows(clients);
assert.strictEqual(rows.filter(row => row.clientName === 'Maya Patel').length, 2, 'a client with two properties should produce two explicit choices');

assert.strictEqual(lookup.search('maya', 'clientName', clients)[0].clientName, 'Maya Patel');
assert(lookup.search('queen', 'projectAddress', clients)[0].address.includes('22 Queen Avenue'), 'address fragments should match a property');
assert.strictEqual(lookup.search('647555', 'clientPhone', clients)[0].propertyId, 'property-queen', 'partial phone digits should match property-specific contact details');
assert(lookup.search('maya@exam', 'clientEmail', clients).every(row => row.clientName === 'Maya Patel'), 'partial email matching should work');

const duplicateClients = {
  first: { name: 'First Contact', email: 'shared@example.com', address: '1 First Street' },
  second: { name: 'Second Contact', email: 'shared@example.com', address: '2 Second Street' }
};
const duplicateResults = lookup.search('shared@', 'clientEmail', duplicateClients);
assert.strictEqual(JSON.stringify(Array.from(duplicateResults, row => row.clientName).sort()), JSON.stringify(['First Contact', 'Second Contact']), 'duplicate contact details should remain separate, clearly identified results');

fixture.fields.clientName.value = 'manual name';
fixture.fields.projectAddress.value = 'manual address';
lookup.search('queen', 'projectAddress', clients);
assert.strictEqual(fixture.fields.clientName.value, 'manual name', 'searching alone must not overwrite client fields');
assert.strictEqual(fixture.fields.projectAddress.value, 'manual address', 'searching alone must preserve manual address entry');

const queenResult = lookup.search('queen', 'projectAddress', clients)[0];
lookup.selectSuggestion(queenResult);
assert.strictEqual(fixture.fields.clientName.value, 'Maya Patel');
assert.strictEqual(fixture.fields.projectAddress.value, '22 Queen Avenue, Toronto');
assert.strictEqual(fixture.fields.clientPhone.value, '647-555-2200');
assert.strictEqual(fixture.fields.clientEmail.value, 'maya@example.com');
assert.strictEqual(fixture.fields.projectAddress.dataset.selectedPropertyId, 'property-queen');
assert.strictEqual(fixture.counters.propertyRefresh, 1, 'selecting an address should refresh its separate Property Memory badge');
assert.strictEqual(fixture.counters.unsaved, 1, 'an explicit selection should enter the normal quote save flow');

fixture.fields.projectAddress.value = '99 New Property Drive';
fixture.fields.clientPhone.value = '416-555-9999';
fixture.fields.clientEmail.value = 'maya@example.com';
clientApi.saveCurrentClient();
const updatedMaya = clientApi.getAllClients()['Maya Patel'];
assert.strictEqual(updatedMaya.properties.length, 3, 'saving the same client at a new address should retain prior properties');
assert(updatedMaya.properties.some(property => property.address === '99 New Property Drive'));

console.log('contact/property lookup behavior tests passed');
