const test = require('node:test');
const assert = require('node:assert/strict');

async function policy() {
  return import('../supabase/functions/_shared/account-data-policy.mjs');
}

function sensitiveQuote() {
  return {
    id: 'quote-1',
    user_id: 'owner-user-id',
    created_by_user_id: 'actor-user-id',
    updated_by_user_id: 'actor-user-id',
    total: 286,
    data: {
      quoteNumber: 'Q-100',
      paymentSettings: { stripeAccountId: 'acct_secret' },
      public_share_token_hash: 'share-hash',
      portalShareCreatedAt: '2026-08-07T00:00:00Z',
      companyMarginPercent: 32,
      defaultMarkupPercent: 20,
      overheadProfit: 500,
      businessProfile: {
        businessName: 'Northline Renovations',
        nested: {
          stripeSettings: { account: 'acct_nested_secret' },
          stripe_account_id: 'acct_snake_case_secret',
          quickbooks_access_token: 'qb_secret'
        }
      },
      portal_pin: '1234',
      rooms: [{
        id: 'room-1',
        _quotedrTeamRef: 'room-ref',
        name: 'Kitchen',
        markup: 20,
        hideMarkup: true,
        items: [{
          id: 'item-1',
          _quotedrTeamRef: 'item-ref',
          name: 'Cabinet install',
          quantity: 2,
          rate: 100,
          total: 190,
          discountType: 'amount',
          discountValue: 10,
          markup: 10,
          materialCost: 40,
          supplierUrl: 'https://supplier.example/private',
          upgrade: { rate: 25, materialCost: 8 }
        }]
      }]
    }
  };
}

test('restricted quote views flatten sell prices and remove protected fields', async () => {
  const api = await policy();
  const safe = api.sanitizeQuoteRow(sensitiveQuote(), { canReadPricing: false });
  const item = safe.data.rooms[0].items[0];
  assert.equal(item.rate, 130);
  assert.equal(item.total, 247);
  assert.equal(item.discountValue, 13);
  assert.equal(item.upgrade.rate, 32.5);
  assert.equal(item.materialCost, undefined);
  assert.equal(item.supplierUrl, undefined);
  assert.equal(safe.data.rooms[0].markup, undefined);
  assert.equal(safe.user_id, undefined);
  assert.equal(safe.created_by_user_id, undefined);
  assert.equal(safe.updated_by_user_id, undefined);
  assert.equal(safe.data.paymentSettings, undefined);
  assert.equal(safe.data.public_share_token_hash, undefined);
  assert.equal(safe.data.portalShareCreatedAt, undefined);
  assert.equal(safe.data.companyMarginPercent, undefined);
  assert.equal(safe.data.defaultMarkupPercent, undefined);
  assert.equal(safe.data.overheadProfit, undefined);
  assert.equal(safe.data.businessProfile.businessName, 'Northline Renovations');
  assert.equal(safe.data.businessProfile.nested.stripeSettings, undefined);
  assert.equal(safe.data.businessProfile.nested.stripe_account_id, undefined);
  assert.equal(safe.data.businessProfile.nested.quickbooks_access_token, undefined);
  assert.equal(safe.data.portal_pin, undefined);
  assert.deepEqual(api.findSensitiveFieldPaths(safe), []);
});

test('restricted edits preserve hidden pricing without compounding markup', async () => {
  const api = await policy();
  const original = sensitiveQuote();
  const safe = api.sanitizeQuoteRow(original, { canReadPricing: false });
  safe.data.rooms[0].items[0].rate = 143;
  safe.data.rooms[0].items[0].total = 260;
  safe.data.paymentSettings = { stripeAccountId: 'attacker-value' };
  safe.data.rooms[0].items[0].materialCost = 1;

  const merged = api.mergeRestrictedQuoteUpdate(original, safe);
  const mergedItem = merged.data.rooms[0].items[0];
  assert.equal(mergedItem.rate, 110);
  assert.equal(mergedItem.total, 200);
  assert.equal(mergedItem.materialCost, 40);
  assert.equal(mergedItem.supplierUrl, 'https://supplier.example/private');
  assert.equal(mergedItem.markup, 10);
  assert.equal(merged.data.rooms[0].markup, 20);
  assert.equal(merged.data.paymentSettings.stripeAccountId, 'acct_secret');
  assert.equal(merged.data.rooms[0]._quotedrTeamRef, undefined);

  const safeAgain = api.sanitizeQuoteRow(merged, { canReadPricing: false });
  assert.equal(safeAgain.data.rooms[0].items[0].rate, 143);
  assert.equal(safeAgain.data.rooms[0].items[0].total, 260);
});

test('pricing permission does not implicitly expose payment or integration secrets', async () => {
  const api = await policy();
  const safe = api.sanitizeQuoteRow(sensitiveQuote(), { canReadPricing: true });
  assert.equal(safe.data.rooms[0].items[0].materialCost, 40);
  assert.equal(safe.data.paymentSettings, undefined);
  assert.equal(safe.data.public_share_token_hash, undefined);
  assert.equal(safe.data.portalShareCreatedAt, undefined);
  assert.equal(safe.data.businessProfile.nested.stripe_account_id, undefined);
  assert.equal(safe.data.businessProfile.nested.quickbooks_access_token, undefined);
});

test('new lines inherit hidden room pricing but cannot inject cost or markup', async () => {
  const api = await policy();
  const original = sensitiveQuote();
  const safe = api.sanitizeQuoteRow(original, { canReadPricing: false });
  safe.data.rooms[0].items.push({
    id: 'new-item',
    name: 'New line',
    quantity: 1,
    rate: 120,
    total: 120,
    markup: 95,
    material_cost: 2,
    nested: { paymentSettings: { secret: true } }
  });
  const merged = api.mergeRestrictedQuoteUpdate(original, safe);
  const added = merged.data.rooms[0].items[1];
  assert.equal(added.rate, 100);
  assert.equal(added.total, 100);
  assert.equal(added.markup, undefined);
  assert.equal(added.material_cost, undefined);
  assert.deepEqual(added.nested, {});
});

test('opaque line references cannot be replayed to duplicate hidden pricing', async () => {
  const api = await policy();
  const original = sensitiveQuote();
  const safe = api.sanitizeQuoteRow(original, { canReadPricing: false });
  safe.data.rooms[0].items.push({
    ...safe.data.rooms[0].items[0],
    id: 'copied-item',
    name: 'Copied line'
  });
  const merged = api.mergeRestrictedQuoteUpdate(original, safe);
  assert.equal(merged.data.rooms[0].items[0].materialCost, 40);
  assert.equal(merged.data.rooms[0].items[1].materialCost, undefined);
  assert.equal(merged.data.rooms[0].items[1].markup, undefined);
});

test('missing or forged references cannot overwrite an existing line hidden fields', async () => {
  const api = await policy();
  const original = sensitiveQuote();
  const safe = api.sanitizeQuoteRow(original, { canReadPricing: false });
  delete safe.data.rooms[0].items[0]._quotedrTeamRef;
  assert.throws(
    () => api.mergeRestrictedQuoteUpdate(original, safe),
    (error) => error && error.code === 'stale_team_reference'
  );
});

test('saved items never expose material cost, supplier links, or nested margins', async () => {
  const api = await policy();
  const safe = api.sanitizeSavedItemRow({
    user_id: 'owner-user-id',
    updated_by_user_id: 'actor-user-id',
    name: 'Tile',
    rate: 12,
    material_cost: 4,
    supplier_url: 'https://supplier.example',
    baseCost: 3,
    itemMarkupPercent: 15,
    data: { profitMargin: 25, totalProfit: 8, description: 'Porcelain tile' }
  }, { canReadPricing: false });
  assert.equal(safe.rate, 12);
  assert.equal(safe.user_id, undefined);
  assert.equal(safe.updated_by_user_id, undefined);
  assert.equal(safe.material_cost, undefined);
  assert.equal(safe.supplier_url, undefined);
  assert.equal(safe.baseCost, undefined);
  assert.equal(safe.itemMarkupPercent, undefined);
  assert.deepEqual(safe.data, { description: 'Porcelain tile' });
});

test('field maps are default-deny and remove hidden contact and customer price values', async () => {
  const api = await policy();
  const quote = sensitiveQuote();
  quote.client_email = 'priya@example.com';
  quote.email = 'legacy-priya@example.com';
  quote.phone = '555-0100';
  quote.project_address = '12 Northline Road';
  quote.rooms = [{ name: 'Legacy room', items: [{ rate: 99 }] }];
  quote.grand_total = 286;
  quote.total = 286;
  quote.data.clientEmail = 'priya@example.com';
  quote.data.notes = 'Private owner note';
  const safe = api.sanitizeQuoteRow(quote, {
    canReadPricing: false,
    fieldAccess: {
      'quotes.number': 'read',
      'quotes.scope': 'read'
    }
  });
  assert.equal(safe.client_email, undefined);
  assert.equal(safe.email, undefined);
  assert.equal(safe.phone, undefined);
  assert.equal(safe.project_address, undefined);
  assert.equal(safe.rooms, undefined);
  assert.equal(safe.grand_total, undefined);
  assert.equal(safe.total, undefined);
  assert.equal(safe.data.clientEmail, undefined);
  assert.equal(safe.data.notes, undefined);
  assert.equal(safe.data.rooms[0].name, 'Kitchen');
  assert.equal(safe.data.rooms[0].items[0].name, 'Cabinet install');
  assert.equal(safe.data.rooms[0].items[0].rate, undefined);
  assert.equal(safe.data.rooms[0].items[0].total, undefined);
});

test('read-only and hidden quote fields are preserved while writable scope text can change', async () => {
  const api = await policy();
  const original = sensitiveQuote();
  original.quote_number = 'Q-100';
  original.client_email = 'priya@example.com';
  original.data.clientEmail = 'priya@example.com';
  const fieldAccess = {
    'quotes.number': 'read',
    'quotes.client_email': 'read',
    'quotes.scope': 'write',
    'quotes.customer_pricing': 'read'
  };
  const safe = api.sanitizeQuoteRow(original, { canReadPricing: false, fieldAccess });
  safe.quote_number = 'ATTACKER-NUMBER';
  safe.client_email = 'attacker@example.com';
  safe.data.clientEmail = 'attacker@example.com';
  safe.data.rooms[0].items[0].name = 'Updated scope text';
  safe.data.rooms[0].items[0].rate = 999;
  safe.data.rooms[0].items[0].total = 999;
  const merged = api.mergeRestrictedQuoteUpdate(original, safe, { fieldAccess });
  assert.equal(merged.quote_number, 'Q-100');
  assert.equal(merged.client_email, 'priya@example.com');
  assert.equal(merged.data.clientEmail, 'priya@example.com');
  assert.equal(merged.data.rooms[0].items[0].name, 'Updated scope text');
  assert.equal(merged.data.rooms[0].items[0].rate, 100);
  assert.equal(merged.data.rooms[0].items[0].total, 190);
});

test('client field visibility and write levels are enforced independently', async () => {
  const api = await policy();
  const existing = {
    id: 'client-1',
    user_id: 'owner-user-id',
    name: 'Priya Shah',
    phone: '555-0100',
    email: 'old@example.com',
    notes: 'Owner-only note',
    crm: { lifetimeValue: 25000 }
  };
  const fieldAccess = {
    'clients.name': 'read',
    'clients.email': 'write',
    'clients.notes': 'read'
  };
  const safe = api.sanitizeClientRow(existing, { fieldAccess });
  assert.equal(safe.name, 'Priya Shah');
  assert.equal(safe.email, 'old@example.com');
  assert.equal(safe.phone, undefined);
  assert.equal(safe.crm, undefined);
  const merged = api.mergeClientFieldAccess(existing, {
    name: 'Changed name',
    phone: '555-9999',
    email: 'new@example.com',
    notes: 'Changed note',
    crm: { injected: true }
  }, { fieldAccess });
  assert.equal(merged.name, 'Priya Shah');
  assert.equal(merged.phone, '555-0100');
  assert.equal(merged.email, 'new@example.com');
  assert.equal(merged.notes, 'Owner-only note');
  assert.deepEqual(merged.crm, { lifetimeValue: 25000 });
});

test('business and saved-item fields are projected from the role field map', async () => {
  const api = await policy();
  const profile = api.sanitizeBusinessProfile({
    business_name: 'Northline Renovations',
    owner_name: 'Priya Shah',
    phone: '555-0100',
    email: 'priya@example.com',
    hst_number: '123456789',
    tagline: 'Built carefully',
    unrecognized_private_value: 'never send this'
  }, {
    fieldAccess: {
      'business.company_name': 'read',
      'business.tagline': 'read'
    }
  });
  assert.deepEqual(profile, {
    business_name: 'Northline Renovations',
    tagline: 'Built carefully'
  });

  const items = api.sanitizeSavedItemRow({
    id: 'items-row',
    data: {
      Kitchens: [{
        name: 'Cabinet install',
        itemDescription: 'Install uppers',
        rate: 175,
        photo: 'data:image/png;base64,private'
      }]
    }
  }, {
    canReadPricing: false,
    fieldAccess: {
      'items.name': 'read',
      'items.description': 'read'
    }
  });
  assert.equal(items.data.Kitchens[0].name, 'Cabinet install');
  assert.equal(items.data.Kitchens[0].itemDescription, 'Install uppers');
  assert.equal(items.data.Kitchens[0].rate, undefined);
  assert.equal(items.data.Kitchens[0].photo, undefined);
});
