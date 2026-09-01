const test = require('node:test');
const assert = require('node:assert/strict');
const decisions = require('../client-document-decisions.js');

async function policy() {
  return import('../supabase/functions/_shared/client-document-policy.mjs');
}

function quoteFixture() {
  const data = {
    quoteNumber: 'Q-SEC-100',
    quoteTitle: 'Secure kitchen quote',
    clientName: 'Priya Shah',
    projectAddress: '12 Northline Road',
    documentType: 'quote',
    taxRate: 0.13,
    taxLabel: 'HST',
    taxEnabled: true,
    quoteAdjustment: { name: 'Internal material markup 10%', type: 'markup', basis: 'percent', percent: 10 },
    paymentSettings: { stripeAccountId: 'acct_internal', access_token: 'payment-token' },
    integration_metadata: { quickbooksRealmId: 'realm-private', refresh_token: 'refresh-private' },
    qb_id: 'qb-private-id',
    checkout_session_id: 'cs_private',
    public_share_token_hash: 'hash-private',
    portal_share_token: 'portal-private',
    portal_pin: '1234',
    shareToken: 'legacy-share-private',
    portalToken: 'legacy-portal-private',
    _saveMeta: { editorInstanceId: 'private-editor' },
    businessProfile: {
      business_name: 'Northline Renovations',
      phone: '555-0100',
      website: 'https://northline.example',
      stripeSettings: { account: 'acct_nested' }
    },
    style: {
      accent: '#1a56a0',
      pricingMode: 'full',
      approvalMode: 'approve_or_changes',
      clientMessage: 'Please review your choices.',
      integrationToken: 'style-private'
    },
    payments: [{
      id: 'pay-private',
      type: 'deposit',
      status: 'paid',
      amount: 50,
      paid_at: '2026-08-08T12:00:00Z',
      payment_intent_id: 'pi_private'
    }],
    paymentsReceived: { name: 'Deposit paid', amount: 50, payment_intent_id: 'pi_summary_private' },
    balance_due_cents: 61376,
    deposit_shortfall_accepted: true,
    deposit_shortfall_accepted_at: '2026-08-08T12:05:00Z',
    deposit_shortfall_accepted_paid_cents: 5000,
    deposit_shortfall_required_cents: 10000,
    deposit_shortfall_accepted_by: 'contractor-user-id',
    signature_url: 'https://storage.example/signature.png?token=secret-signature-token',
    rooms: [{
      id: 'room-kitchen',
      name: 'Kitchen',
      markup: 30,
      hideMarkup: true,
      vendorAccount: 'vendor-private',
      items: [{
        id: 'item-regular',
        description: 'Cabinet installation',
        category: 'Cabinetry',
        unitType: 'each',
        quantity: 2,
        rate: 100,
        total: 200,
        markup: 20,
        materialCost: 45,
        supplierUrl: 'https://supplier.example/cabinet',
        savedItemId: '11111111-1111-4111-8111-111111111111',
        savedItemSource: { savedItemId: '11111111-1111-4111-8111-111111111111', name: 'Cabinet installation' },
        materialTakeoffSnapshot: {
          savedItemId: '11111111-1111-4111-8111-111111111111',
          totalCost: 90,
          priceMode: 'frozen',
          lines: [{
            supplierProductId: '22222222-2222-4222-8222-222222222222',
            supplierSku: 'CES-PRIVATE-100',
            materialName: 'Private supplier material',
            unitPrice: 45,
            extendedCost: 90,
            productUrl: 'https://supplier.example/private-product'
          }]
        },
        profitMargin: 44,
        _coOriginal: { quantity: 2, rate: 80, total: 160, materialCost: 30, supplierUrl: 'https://vendor.example/original' }
      }, {
        id: 'item-choice',
        description: 'Countertop',
        unitType: 'each',
        quantity: 1,
        rate: 100,
        total: 100,
        materialCost: 30,
        choiceGroup: {
          id: 'counter-choice',
          name: 'Countertop choice',
          type: 'single',
          defaultOptionId: 'counter-standard',
          selectedOptionIds: ['counter-standard'],
          options: [{
            id: 'counter-standard',
            name: 'Standard',
            rate: 100,
            materialCost: 35,
            supplierUrl: 'https://supplier.example/standard'
          }, {
            id: 'counter-premium',
            name: 'Premium',
            rate: 130,
            materialCost: 50,
            supplierUrl: 'https://supplier.example/premium',
            upgradeGroups: [{
              id: 'edge-options',
              name: 'Edge options',
              type: 'single_optional',
              selectedOptionIds: [],
              options: [{ id: 'edge-waterfall', name: 'Waterfall edge', rate: 40, materialCost: 15, supplierUrl: 'https://vendor.example/edge', upgradeType: 'add_on' }]
            }]
          }],
          enhancementGroups: [{
            id: 'counter-enhancements',
            name: 'Enhancements',
            type: 'multiple',
            selectedOptionIds: [],
            options: [{ id: 'counter-seal', name: 'Premium seal', rate: 20, materialCost: 4, supplierUrl: 'https://vendor.example/seal', upgradeType: 'add_on' }]
          }]
        }
      }, {
        id: 'item-upgrades',
        description: 'Sink install',
        unitType: 'each',
        quantity: 1,
        rate: 80,
        total: 80,
        materialCost: 25,
        upgradeGroups: [{
          id: 'sink-upgrades',
          name: 'Sink upgrades',
          type: 'multiple',
          selectedOptionIds: [],
          options: [{ id: 'sink-disposal', name: 'Disposal', rate: 50, materialCost: 22, supplierUrl: 'https://supplier.example/disposal', upgradeType: 'add_on' }]
        }]
      }, {
        id: 'item-optional',
        description: 'Optional backsplash',
        unitType: 'each',
        quantity: 1,
        rate: 60,
        total: 60,
        materialCost: 20,
        optional: true,
        optionalSelectedByDefault: false,
        _optionalSelected: false,
        _removed: true
      }]
    }]
  };
  data.original_rooms = JSON.parse(JSON.stringify(data.rooms));
  return {
    id: 'quote-secure-1',
    user_id: 'contractor-user-id',
    quote_number: 'Q-SEC-100',
    client_name: 'Priya Shah',
    status: 'sent',
    type: 'quote',
    total: 663.762,
    public_share_token_hash: 'row-share-hash',
    data
  };
}

function sensitiveSnapshot(value) {
  const entries = [];
  function visit(node, path) {
    if (Array.isArray(node)) return node.forEach((child, index) => visit(child, `${path}[${index}]`));
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const childPath = path ? `${path}.${key}` : key;
      if (
        normalized.includes('cost') || normalized.includes('markup') || normalized.includes('margin') ||
        normalized.includes('profit') || normalized.includes('supplier') || normalized.includes('vendor') ||
        normalized.includes('integration') || normalized.includes('token') || normalized.startsWith('qb') ||
        normalized.includes('quickbooks') || normalized.includes('paymentintent') || normalized.includes('checkoutsession')
      ) entries.push([childPath, child]);
      visit(child, childPath);
    }
  }
  visit(value, '');
  return JSON.stringify(entries);
}

function forbiddenClientPaths(value) {
  const paths = [];
  function visit(node, path) {
    if (Array.isArray(node)) return node.forEach((child, index) => visit(child, `${path}[${index}]`));
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const childPath = path ? `${path}.${key}` : key;
      if (
        normalized.includes('materialcost') || normalized === 'cost' || normalized.endsWith('cost') ||
        normalized.includes('markup') || normalized.includes('margin') || normalized.includes('profit') ||
        normalized.includes('supplier') || normalized.includes('vendor') || normalized.includes('integration') ||
        normalized.includes('token') || normalized.startsWith('qb') || normalized.includes('quickbooks') ||
        normalized.includes('paymentintent') || normalized.includes('checkoutsession') || normalized.includes('stripe')
      ) paths.push(childPath);
      visit(child, childPath);
    }
  }
  visit(value, '');
  return paths;
}

test('client projection is non-mutating, redacts every nested internal field, and preserves rendered prices', async () => {
  const api = await policy();
  const source = quoteFixture();
  const before = JSON.stringify(source);
  const projected = api.sanitizeClientDocumentRow(source);

  assert.equal(JSON.stringify(source), before, 'view projection must not mutate the contractor row');
  assert.deepEqual(forbiddenClientPaths(projected), []);
  assert.equal(projected.user_id, undefined, 'contractor account ids are not required by the secure document renderer');
  assert.equal(projected.public_share_token_hash, undefined);
  assert.equal(projected.data.paymentSettings, undefined);
  assert.equal(projected.data.integration_metadata, undefined);
  assert.equal(projected.data.signature_url, '');
  assert.deepEqual(projected.data.businessProfile, {
    business_name: 'Northline Renovations',
    phone: '555-0100',
    website: 'https://northline.example/'
  });

  const room = projected.data.rooms[0];
  assert.equal(room.markup, undefined);
  assert.equal(room.items[0].rate, 150);
  assert.equal(room.items[0].total, 300);
  assert.equal(room.items[0]._coOriginal.rate, 104);
  assert.equal(room.items[0]._coOriginal.total, 208);
  assert.equal(room.items[0]._coOriginal.quantity, 2);
  assert.equal(room.items[0].materialCost, undefined);
  assert.equal(room.items[0].supplierUrl, undefined);
  assert.equal(room.items[0].savedItemId, undefined);
  assert.equal(room.items[0].savedItemSource, undefined);
  assert.equal(room.items[0].materialTakeoffSnapshot, undefined);

  const choice = room.items[1].choiceGroup;
  assert.equal(choice.options[1].rate, 169);
  assert.equal(choice.options[1].materialCost, undefined);
  assert.equal(choice.options[1].upgradeGroups[0].options[0].rate, 52);
  assert.equal(choice.enhancementGroups[0].options[0].rate, 26);
  assert.equal(projected.data.original_rooms[0].items[1].choiceGroup.options[1].rate, 169);
  assert.deepEqual(projected.data.quoteAdjustment, { name: 'Adjustment', type: 'addition', basis: 'amount', amount: 53.4 });
  assert.deepEqual(projected.data.payments[0], {
    type: 'deposit', status: 'paid', paid_at: '2026-08-08T12:00:00Z', amount: 50
  });
  assert.equal(projected.data.balance_due_cents, 61376);
  assert.equal(projected.data.deposit_shortfall_accepted, true);
  assert.equal(projected.data.deposit_shortfall_accepted_paid_cents, 5000);
  assert.equal(projected.data.deposit_shortfall_required_cents, 10000);
  assert.equal(projected.data.deposit_shortfall_accepted_by, undefined, 'the contractor account id must remain private');

  const sourceTotals = api.calculateClientDocumentTotals(source.data, { documentType: 'quote' });
  const projectedTotals = api.calculateClientDocumentTotals(projected.data, { documentType: 'quote' });
  assert.equal(sourceTotals.documentTotal, 663.762);
  assert.equal(projectedTotals.documentTotal, sourceTotals.documentTotal);
});

test('client view to approval round trip submits no quote data and preserves hidden fields byte-for-byte', async () => {
  const api = await policy();
  const source = quoteFixture();
  const clientView = api.sanitizeClientDocumentRow(source).data;
  const rooms = clientView.rooms;

  rooms[0].items[1].choiceGroup.selectedOptionIds = ['counter-premium'];
  rooms[0].items[1].choiceGroup.enhancementGroups[0].selectedOptionIds = ['counter-seal'];
  rooms[0].items[1].upgradeGroups = rooms[0].items[1].choiceGroup.options[1].upgradeGroups;
  rooms[0].items[1].upgradeGroups[0].selectedOptionIds = ['edge-waterfall'];
  rooms[0].items[2].upgradeGroups[0].selectedOptionIds = ['sink-disposal'];
  rooms[0].items[3]._optionalSelected = true;
  rooms[0].items[3]._removed = false;

  const minimal = decisions.collect(rooms, { 0: 'Please schedule after September 1.' });
  minimal.status = 'accepted';
  minimal.signature = {
    method: 'typed',
    signerName: 'Priya Shah',
    evidenceDataUrl: 'data:image/png;base64,AAAA',
    evidenceUrl: '',
    termsAccepted: true
  };

  const serializedDecision = JSON.stringify(minimal);
  assert(!serializedDecision.includes('rooms'));
  assert(!serializedDecision.includes('rate'));
  assert(!serializedDecision.includes('total'));
  assert(!serializedDecision.includes('materialCost'));
  assert(!serializedDecision.includes('supplier'));
  assert(!serializedDecision.includes('markup'));

  const beforeSource = JSON.stringify(source.data);
  const beforeSensitive = sensitiveSnapshot(source.data);
  const result = api.applyClientDocumentDecision(source.data, minimal, { applySelections: true });
  assert.equal(JSON.stringify(source.data), beforeSource, 'decision merge must not mutate the fetched source object');
  assert.equal(sensitiveSnapshot(result.data), beforeSensitive, 'all internal pricing and integration values must remain byte-equivalent');
  assert.equal(result.data.rooms[0].items[1].choiceGroup.selectedOptionIds[0], 'counter-premium');
  assert.equal(result.data.rooms[0].items[1].choiceGroup.enhancementGroups[0].selectedOptionIds[0], 'counter-seal');
  assert.equal(result.data.rooms[0].items[1].choiceGroup.options[1].upgradeGroups[0].selectedOptionIds[0], 'edge-waterfall');
  assert.equal(result.data.rooms[0].items[2].upgradeGroups[0].selectedOptionIds[0], 'sink-disposal');
  assert.equal(result.data.rooms[0].items[3]._removed, false);
  assert.equal(result.data._roomNotes[0], 'Please schedule after September 1.');

  const totals = api.calculateClientDocumentTotals(result.data, { documentType: 'quote' });
  assert.equal(totals.subtotal, 794);
  assert.equal(totals.adjustmentAmount, 79.4);
  assert.equal(totals.documentTotal, 986.942);

  const safeAfterApproval = api.projectClientDocumentData(result.data, { documentType: 'quote' });
  assert.deepEqual(forbiddenClientPaths(safeAfterApproval), []);
  assert.equal(api.calculateClientDocumentTotals(safeAfterApproval, { documentType: 'quote' }).documentTotal, totals.documentTotal);
  assert.equal(safeAfterApproval.rooms[0].items[1].choiceGroup.options[1].name, 'Premium');
  assert.equal(safeAfterApproval.rooms[0].items[1].choiceGroup.options[1].rate, 169);
});

test('authoritative totals do not double-apply saved discounts or already-materialized upgrades', async () => {
  const api = await policy();
  const data = {
    documentType: 'quote', taxEnabled: false,
    rooms: [{
      name: 'Totals', markup: 25, items: [{
        id: 'discounted', quantity: 2, rate: 75, total: 135,
        discountType: 'percent', discountValue: 10
      }, {
        id: 'grouped', quantity: 1, rate: 140, total: 140, _baseRate: 100,
        upgradeGroups: [{
          id: 'extras', type: 'multiple', selectedOptionIds: ['extra'],
          options: [{ id: 'extra', name: 'Extra', rate: 40, upgradeType: 'add_on' }]
        }]
      }, {
        id: 'legacy', quantity: 2, rate: 35, total: 70, _baseRate: 30,
        upgraded: true, upgrade: { name: 'Add-on', rate: 5, type: 'add_on' }
      }]
    }]
  };

  const authoritative = api.calculateClientDocumentTotals(data, { documentType: 'quote' });
  assert.equal(authoritative.subtotal, 431.25);
  assert.equal(authoritative.documentTotal, 431.25);

  const projected = api.projectClientDocumentData(data, { documentType: 'quote' });
  assert.equal(projected.rooms[0].markup, undefined);
  assert.equal(projected.rooms[0].items[1]._baseRate, 125);
  assert.equal(projected.rooms[0].items[1].upgradeGroups[0].options[0].rate, 50);
  assert.equal(api.calculateClientDocumentTotals(projected, { documentType: 'quote' }).documentTotal, authoritative.documentTotal);
});

test('manual quantities are emitted and accepted only for selected manual options', async () => {
  const api = await policy();
  const item = {
    id: 'manual-item',
    upgradeGroups: [{
      id: 'manual-group', selectedOptionIds: ['manual-selected'],
      options: [
        { id: 'manual-selected', quantityMode: 'manual', manualQuantity: 3 },
        { id: 'manual-not-selected', quantityMode: 'manual', manualQuantity: 99 }
      ]
    }]
  };
  const collected = decisions.collectItems([{ id: 'room', items: [item] }]);
  assert.deepEqual(collected[0].upgradeGroups[0].manualQuantities, [{ optionId: 'manual-selected', quantity: 3 }]);
  assert.throws(() => api.normalizeClientDocumentDecision({
    items: [{
      roomIndex: 0, itemIndex: 0,
      upgradeGroups: [{
        groupId: 'manual-group', selectedOptionIds: ['manual-selected'],
        manualQuantities: [{ optionId: 'manual-not-selected', quantity: 99 }]
      }]
    }]
  }), /only describe selected options/);
});

test('branding and signature URLs reject embedded credentials and token query parameters', async () => {
  const api = await policy();
  assert.equal(api.sanitizeClientMediaUrl('https://storage.example/logo.png?token=secret'), '');
  assert.equal(api.sanitizeClientMediaUrl('https://user:secret@example.com/logo.png'), '');
  assert.equal(api.sanitizeClientMediaUrl('https://cdn.example/logo.png'), 'https://cdn.example/logo.png');
  assert.deepEqual(api.sanitizeClientBusinessProfile({
    business_name: 'Northline',
    website: 'https://northline.example/?access_token=secret',
    integration: { token: 'private' }
  }), { business_name: 'Northline' });
  assert.throws(() => api.normalizeClientDocumentDecision({
    signature: {
      method: 'typed', signerName: 'Priya Shah', termsAccepted: true,
      evidenceUrl: 'https://storage.example/signature.png?token=secret'
    }
  }), /Signature URL is invalid/);
});

test('request-change validation can summarize decisions without changing authoritative rooms', async () => {
  const api = await policy();
  const source = quoteFixture();
  const view = api.sanitizeClientDocumentRow(source).data;
  view.rooms[0].items[2].upgradeGroups[0].selectedOptionIds = ['sink-disposal'];
  const decision = decisions.collect(view.rooms, { 0: 'Can this be completed sooner?' });
  const beforeRooms = JSON.stringify(source.data.rooms);
  const result = api.applyClientDocumentDecision(source.data, decision, { applySelections: false });

  assert.equal(JSON.stringify(result.data.rooms), beforeRooms);
  assert.equal(result.selectedData.rooms[0].items[2].upgradeGroups[0].selectedOptionIds[0], 'sink-disposal');
  assert.equal(result.summaries.itemUpgradeSelections[0].option, 'Disposal');
  assert.equal(result.data._roomNotes[0], 'Can this be completed sooner?');
});

test('decision schema rejects document patches, forged prices, stale targets, and incompatible selection shapes', async () => {
  const api = await policy();
  const source = quoteFixture();
  const base = { roomIndex: 0, itemIndex: 1, roomId: 'room-kitchen', itemId: 'item-choice' };
  assert.throws(() => api.normalizeClientDocumentDecision({ rooms: source.data.rooms }), /Unsupported decision field: rooms/);
  assert.throws(() => api.normalizeClientDocumentDecision({ items: [{ ...base, rate: 1 }] }), /Unsupported items\[0\] field: rate/);
  assert.throws(() => api.applyClientDocumentDecision(source.data, { items: [{ ...base, itemId: 'forged', choice: { groupId: 'counter-choice', selectedOptionIds: ['counter-standard'], enhancementGroups: [] } }] }), /selected item is stale/);
  assert.throws(() => api.applyClientDocumentDecision(source.data, { items: [{ ...base, choice: { groupId: 'counter-choice', selectedOptionIds: ['counter-standard', 'counter-premium'], enhancementGroups: [] } }] }), /Only one base choice/);
  assert.throws(() => api.normalizeClientDocumentDecision({
    signature: {
      method: 'typed', signerName: 'Priya Shah', termsAccepted: true,
      evidenceDataUrl: 'data:image/png;base64,AAAA', signed_at: 'client-controlled'
    }
  }), /Unsupported signature field: signed_at/);
});

test('change-order projection redacts original snapshots while preserving net and updated totals', async () => {
  const api = await policy();
  const row = {
    id: 'co-1', user_id: 'owner-1', type: 'change_order', status: 'sent', total: 33,
    data: {
      documentType: 'change_order', parentQuoteTotal: 1000, taxRate: 0.13, taxEnabled: true,
      rooms: [{
        id: 'co-room', name: 'Kitchen', markup: 30, items: [{
          id: 'co-item', description: 'Changed cabinet', quantity: 1, rate: 120, total: 20,
          markup: 20, materialCost: 60, supplierUrl: 'https://supplier.example/co',
          changeOrderNote: 'Changed additional item markup none to 20%.',
          _coOriginal: { description: 'Original cabinet', quantity: 1, rate: 100, total: 100, materialCost: 45, supplierUrl: 'https://vendor.example/original' },
          _coChangeStatus: 'changed'
        }]
      }]
    }
  };
  const before = JSON.stringify(row);
  const totals = api.calculateClientDocumentTotals(row.data, { documentType: 'change_order' });
  assert.equal(totals.documentTotal, 33.9);
  assert.equal(totals.updatedTotal, 1033.9);
  const projected = api.sanitizeClientDocumentRow(row);
  assert.equal(JSON.stringify(row), before);
  assert.deepEqual(forbiddenClientPaths(projected), []);
  assert.equal(projected.data.rooms[0].items[0].rate, 180);
  assert.equal(projected.data.rooms[0].items[0].total, 30);
  assert.equal(projected.data.rooms[0].items[0]._coOriginal.rate, 130);
  assert.equal(projected.data.rooms[0].items[0]._coOriginal.total, 130);
  assert.equal(projected.data.rooms[0].items[0].changeOrderNote, undefined, 'generated notes must not disclose markup percentages');
  assert.equal(projected.data.grandTotal, totals.documentTotal);
  assert.equal(projected.total, totals.documentTotal);
  assert.equal(projected.data.changeOrderPriceSummary.updatedTotal, totals.updatedTotal);
  const projectedTotals = api.calculateClientDocumentTotals(projected.data, { documentType: 'change_order' });
  assert.equal(projectedTotals.documentTotal, totals.documentTotal);
  assert.equal(projectedTotals.updatedTotal, totals.updatedTotal);

  const clientChangedRow = JSON.parse(JSON.stringify(row));
  clientChangedRow.data.rooms[0].items[0]._clientDecisionApplied = true;
  const clientChangedTotals = api.calculateClientDocumentTotals(clientChangedRow.data, { documentType: 'change_order' });
  assert.equal(clientChangedTotals.documentTotal, 56.5, 'current and original hidden markups must be applied independently');
  const clientChangedProjection = api.sanitizeClientDocumentRow(clientChangedRow);
  assert.equal(api.calculateClientDocumentTotals(clientChangedProjection.data, { documentType: 'change_order' }).documentTotal, clientChangedTotals.documentTotal);
});

test('change-order inherited choices stay locked unless the contractor explicitly reopens them', async () => {
  const api = await policy();
  const inheritedChoice = {
    id: 'co-floor-choice',
    description: 'Flooring labour',
    quantity: 100,
    unitType: 'sq ft',
    rate: 2,
    total: 0,
    _coOriginal: { description: 'Flooring labour', quantity: 100, unitType: 'sq ft', rate: 2, total: 200 },
    _coChangeStatus: 'unchanged',
    choiceGroup: {
      id: 'floor-choice',
      name: 'Flooring choice',
      type: 'single',
      selectedOptionIds: ['laminate'],
      options: [
        { id: 'laminate', name: 'Laminate', rate: 2, unitType: 'sq ft' },
        { id: 'hardwood', name: 'Hardwood', rate: 2.5, unitType: 'sq ft' }
      ]
    }
  };
  const data = {
    documentType: 'change_order',
    taxEnabled: false,
    rooms: [{ id: 'co-room', name: 'Flooring', items: [inheritedChoice] }]
  };
  const changedChoice = {
    items: [{
      roomIndex: 0,
      itemIndex: 0,
      roomId: 'co-room',
      itemId: 'co-floor-choice',
      choice: { groupId: 'floor-choice', selectedOptionIds: ['hardwood'], enhancementGroups: [] }
    }]
  };

  assert.deepEqual(
    decisions.collectItems(data.rooms, { documentType: 'change_order' }),
    [],
    'locked historical choices must not be included in the client decision payload'
  );
  assert.throws(
    () => api.applyClientDocumentDecision(data, changedChoice, { applySelections: true }),
    /contractor must explicitly reopen/i,
    'the authoritative merge must reject a forged change to a locked historical choice'
  );

  const reopened = JSON.parse(JSON.stringify(data));
  reopened.rooms[0].items[0]._coClientChoiceReopened = true;
  const collected = decisions.collectItems(reopened.rooms, { documentType: 'change_order' });
  assert.equal(collected.length, 1, 'reopened choices should be submitted for approval');
  const applied = api.applyClientDocumentDecision(reopened, changedChoice, { applySelections: true });
  assert.deepEqual(applied.data.rooms[0].items[0].choiceGroup.selectedOptionIds, ['hardwood']);
  assert.equal(applied.data.rooms[0].items[0]._clientDecisionApplied, true);

  const ordinaryQuote = JSON.parse(JSON.stringify(data));
  ordinaryQuote.documentType = 'quote';
  assert.equal(
    decisions.collectItems(ordinaryQuote.rooms, { documentType: 'quote' }).length,
    1,
    'historical metadata on an ordinary quote must not accidentally suppress its choices'
  );
});

test('change-order custom highlight legends are client-safe and limited to non-semantic colours', async () => {
  const api = await policy();
  const projected = api.projectClientDocumentData({
    documentType: 'change_order',
    highlightLegend: {
      yellow: 'Client decision required',
      blue: 'Existing finish retained',
      purple: 'Allowance pending',
      orange: 'Must not override Changed',
      green: 'Must not override Added',
      pink: 'Must not override Removed'
    },
    changeOrderHighlightLegend: {
      yellow: 'Client decision required',
      blue: 'Existing finish retained',
      purple: 'Allowance pending',
      orange: 'Must not override Changed',
      green: 'Must not override Added',
      pink: 'Must not override Removed'
    },
    rooms: []
  }, { documentType: 'change_order' });
  assert.deepEqual(projected.highlightLegend, {
    yellow: 'Client decision required',
    blue: 'Existing finish retained',
    purple: 'Allowance pending'
  });
  assert.deepEqual(projected.changeOrderHighlightLegend, {
    yellow: 'Client decision required',
    blue: 'Existing finish retained',
    purple: 'Allowance pending'
  });
});

test('ordinary quote highlight legends are client-safe and support every builder colour', async () => {
  const api = await policy();
  const projected = api.projectClientDocumentData({
    documentType: 'quote',
    highlightLegend: {
      yellow: 'Client decision required',
      green: 'Included upgrade',
      blue: 'Existing finish retained',
      pink: 'Owner supplied',
      orange: 'Allowance item',
      purple: 'Schedule coordination',
      red: 'Not a supported highlighter colour',
      constructor: 'Must not escape the allowlist'
    },
    rooms: [{
      name: 'Main Floor',
      items: [{ description: 'Paint', highlightColor: 'orange', highlightDescriptionOnItem: false, quantity: 1, rate: 100 }]
    }]
  }, { documentType: 'quote' });
  assert.deepEqual(projected.highlightLegend, {
    yellow: 'Client decision required',
    green: 'Included upgrade',
    blue: 'Existing finish retained',
    pink: 'Owner supplied',
    orange: 'Allowance item',
    purple: 'Schedule coordination'
  });
  assert.equal(projected.rooms[0].items[0].highlightColor, 'orange');
  assert.equal(projected.rooms[0].items[0].highlightDescriptionOnItem, false);
});

test('accepted legacy quote projects the authoritative signed total instead of stale pre-upgrade rooms', async () => {
  const api = await policy();
  const row = {
    id: 'accepted-legacy-upgrade',
    type: 'quote',
    status: 'accepted',
    total: 4340.15,
    data: {
      status: 'accepted',
      signed_at: '2026-08-18T12:00:00.000Z',
      client_upgraded: true,
      accepted_total_cents: 361945,
      subtotal: 3203.05,
      taxAmount: 416.40,
      taxRate: 0.13,
      taxEnabled: true,
      rooms: [{ id: 'room-legacy', name: 'Project', items: [{ id: 'line-legacy', name: 'Base scope', quantity: 1, rate: 3203.05, total: 3203.05 }] }]
    }
  };
  const snapshot = api.acceptedClientTotalSnapshot(row);
  assert.deepEqual(snapshot, {
    subtotalCents: 384084,
    adjustmentCents: 0,
    taxCents: 49931,
    totalCents: 434015
  });
  const projected = api.sanitizeClientDocumentRow(row);
  assert.equal(projected.total, 4340.15);
  assert.equal(projected.data.subtotal, 3840.84);
  assert.equal(projected.data.taxAmount, 499.31);
  assert.equal(projected.data.grandTotal, 4340.15);
  assert.equal(projected.data.accepted_total_cents, 434015);
  assert.equal(projected.data.accepted_payable_total_cents, 434015);
  assert.equal(projected.data.accepted_subtotal_cents + projected.data.accepted_tax_cents, 434015);

  const taxExempt = api.acceptedClientTotalSnapshot({
    ...row,
    id: 'accepted-tax-exempt',
    total: 100.01,
    data: { ...row.data, taxEnabled: false, subtotal: 80, taxAmount: 0, rooms: [] }
  });
  assert.deepEqual(taxExempt, { subtotalCents: 10001, adjustmentCents: 0, taxCents: 0, totalCents: 10001 });

  const percentDiscount = api.acceptedClientTotalSnapshot({
    ...row,
    id: 'accepted-percent-discount',
    total: 1017,
    data: {
      ...row.data,
      subtotal: 800,
      taxAmount: 93.6,
      quoteAdjustment: { name: 'Courtesy discount', type: 'discount', basis: 'percent', percent: 10 },
      rooms: []
    }
  });
  assert.deepEqual(percentDiscount, { subtotalCents: 100000, adjustmentCents: -10000, taxCents: 11700, totalCents: 101700 });
});
