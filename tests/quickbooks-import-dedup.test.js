const assert = require('assert');
const importer = require('../quickbooks-import.js');

function allItems(store) {
  return Object.values(store).flatMap(group => Array.isArray(group) ? group : []);
}

const itemLibrary = {
  Painting: [{
    name: 'Interior Wall Paint',
    unitType: 'sq ft',
    rate: 1.25,
    materialCost: 0.35,
    itemDescription: 'Two finish coats with careful prep.',
    photos: ['https://example.test/original.webp'],
    upgradeGroups: [{ name: 'Paint quality', options: [{ name: 'Premium' }] }]
  }],
  QuickBooks: [{
    name: 'interior wall paint',
    unitType: 'service',
    rate: 1.6,
    materialCost: 0.45,
    description: 'QuickBooks description',
    photos: ['https://example.test/imported.webp'],
    qb_id: 'qb-item-42',
    source: 'quickbooks'
  }]
};

const qbItem = {
  id: 'qb-item-42',
  name: 'Interior Wall Paint',
  unitType: 'service',
  rate: 1.6,
  materialCost: 0.45,
  description: 'Current QuickBooks description'
};

const itemAnalysis = importer.analyzeRecord('items', itemLibrary, qbItem);
assert.equal(itemAnalysis.status, 'duplicate', 'a QuickBooks-linked copy plus one normalized original should be a safe duplicate group');
assert.equal(itemAnalysis.duplicateCount, 1);
assert.equal(itemAnalysis.priceConflict, true, 'the preview should flag old/current rate conflicts');

const keepQuoteDr = importer.applyImport('items', itemLibrary, [qbItem], {
  pricePolicy: 'keep_quotedr',
  importedAt: '2026-08-08T12:00:00.000Z'
});
const keptItems = allItems(keepQuoteDr.data);
assert.equal(keptItems.length, 1, 'duplicate cleanup should leave one item across all categories');
assert.equal(keepQuoteDr.data.Painting.length, 1, 'the established QuoteDr category should win');
assert.equal(keepQuoteDr.data.Painting[0].rate, 1.25, 'QuoteDr rate should remain when that explicit policy is selected');
assert.equal(keepQuoteDr.data.Painting[0].qb_id, 'qb-item-42', 'the surviving item should be linked to its QuickBooks ID');
assert.equal(keepQuoteDr.data.Painting[0].itemDescription, 'Two finish coats with careful prep.', 'the QuoteDr description should not be overwritten');
assert.deepEqual(
  keepQuoteDr.data.Painting[0].photos.sort(),
  ['https://example.test/imported.webp', 'https://example.test/original.webp'].sort(),
  'photo collections from both duplicate copies should be retained'
);
assert.equal(keepQuoteDr.data.Painting[0].upgradeGroups.length, 1, 'upgrade groups should be retained');
assert.equal(keepQuoteDr.summary.duplicatesRemoved, 1);
assert.equal(keepQuoteDr.summary.priceConflicts, 1);

const useQuickBooks = importer.applyImport('items', itemLibrary, [qbItem], {
  pricePolicy: 'use_quickbooks',
  importedAt: '2026-08-08T12:00:00.000Z'
});
assert.equal(useQuickBooks.data.Painting[0].rate, 1.6, 'QuickBooks rate should win only under the explicit QuickBooks policy');
assert.equal(useQuickBooks.data.Painting[0].materialCost, 0.45);

const rerun = importer.applyImport('items', keepQuoteDr.data, [qbItem], {
  pricePolicy: 'keep_quotedr',
  importedAt: '2026-08-08T13:00:00.000Z'
});
assert.equal(allItems(rerun.data).length, 1, 're-running an import must be idempotent for item identity');

const ambiguousItems = {
  Painting: [{ name: 'Labour', rate: 50 }],
  Carpentry: [{ name: 'labour', rate: 65 }]
};
const ambiguousRecord = { id: 'qb-labour', name: 'Labour', rate: 60 };
assert.equal(importer.analyzeRecord('items', ambiguousItems, ambiguousRecord).status, 'ambiguous');
const ambiguousResult = importer.applyImport('items', ambiguousItems, [ambiguousRecord], { importedAt: '2026-08-08T12:00:00.000Z' });
assert.equal(ambiguousResult.changed, false, 'ambiguous same-name matches must not be modified automatically');
assert.equal(ambiguousResult.summary.ambiguousSkipped, 1);

const clients = {
  'Amanda  Chen': {
    name: 'Amanda  Chen',
    phone: '416-555-0101',
    email: '',
    crm: { notes: 'Prefers text messages' },
    properties: [{ address: '10 Main St' }]
  },
  'amanda chen': {
    name: 'amanda chen',
    phone: '',
    email: 'amanda@truecolour.example',
    qb_id: 'qb-client-9',
    source: 'quickbooks',
    crm: { quickbooks: { id: 'qb-client-9' } }
  }
};
const qbClient = {
  id: 'qb-client-9',
  name: 'Amanda Chen',
  phone: '416-555-9999',
  email: 'amanda@truecolour.example',
  address: '10 Main St'
};
assert.equal(importer.analyzeRecord('clients', clients, qbClient).status, 'duplicate');
const clientResult = importer.applyImport('clients', clients, [qbClient], { importedAt: '2026-08-08T12:00:00.000Z' });
const mergedClients = Object.values(clientResult.data);
assert.equal(mergedClients.length, 1, 'client import should consolidate a linked copy with one normalized original');
assert.equal(mergedClients[0].phone, '416-555-0101', 'existing QuoteDr contact details should not be silently overwritten');
assert.equal(mergedClients[0].email, 'amanda@truecolour.example', 'QuickBooks should fill missing contact details');
assert.equal(mergedClients[0].crm.notes, 'Prefers text messages', 'CRM metadata should be preserved');
assert.equal(mergedClients[0].crm.quickbooks.id, 'qb-client-9', 'QuickBooks identity should live in cloud-safe CRM metadata');
assert.equal(mergedClients[0].properties.length, 1, 'property metadata should be retained');

const clientUndo = importer.createUndoSnapshot('clients', clients, clientResult.data, {
  id: 'client-batch-1',
  createdAt: '2026-08-08T12:00:00.000Z'
});
const cloudShapedClient = {
  [mergedClients[0].name]: {
    id: 'database-row-id',
    user_id: 'user-id',
    name: mergedClients[0].name,
    phone: mergedClients[0].phone,
    email: mergedClients[0].email,
    address: mergedClients[0].address,
    city: mergedClients[0].city || '',
    notes: mergedClients[0].crm.notes || '',
    crm: Object.assign({}, mergedClients[0].crm, { quoteDrProperties: mergedClients[0].properties }),
    updated_at: '2026-08-08T12:01:00.000Z'
  }
};
assert.equal(importer.canUndo(clientUndo, cloudShapedClient), true, 'client undo should survive a cloud reload that changes storage shape');

assert.equal(
  importer.fingerprint({ b: 2, a: 1 }),
  importer.fingerprint({ a: 1, b: 2 }),
  'undo fingerprints should not depend on object key order'
);
const undo = importer.createUndoSnapshot('items', itemLibrary, keepQuoteDr.data, {
  id: 'batch-1',
  createdAt: '2026-08-08T12:00:00.000Z',
  importedIds: ['qb-item-42']
});
assert.equal(importer.canUndo(undo, keepQuoteDr.data), true, 'undo should be available while the library still matches the imported result');
assert.equal(importer.canUndo(undo, rerun.data), false, 'undo should be blocked after a later item change');

console.log('QuickBooks duplicate-safe import behavior tests passed');
