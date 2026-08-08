const ROOT_PROTECTED_KEYS = new Set([
  'paymentSettings', 'card_payment', 'cardPayment', 'paymentStatus', 'payments',
  'paymentsReceived', 'deposit_paid', 'deposit_paid_at', 'manual_payment_reported',
  'manual_payment_reported_at', 'manual_payment_report_id', 'manual_payment_method',
  'portal_pin', 'portalPin', 'share_token', 'shareToken', 'portal_token', 'portalToken',
  'portal_visible', 'portal_id', 'portal_name', 'portal_client_name', 'portal_client_email',
  'portal_added_at', 'portal_theme',
  'stripe', 'stripeSettings', 'billing', 'subscription', 'quickbooks', 'quickBooks',
  'qbSettings', 'integrationSettings', 'accepted_total_cents', 'deposit_due_cents'
]);

const WRITE_PROTECTED_KEYS = new Set([
  'businessProfile', 'hiddenProfileFields'
]);

const INTERNAL_METADATA_KEYS = new Set([
  'userid', 'createdbyuserid', 'updatedbyuserid'
]);

const PRICING_KEYS = new Set([
  'cost', 'unitcost', 'materialcost', 'basematerialcost', 'wholesalecost',
  'suppliercost', 'laborcost', 'labourcost', 'internalrate', 'costrate',
  'markup', 'hidemarkup', 'margin', 'marginpercent', 'profit', 'profitmargin',
  'supplierurl', 'supplierlink', 'vendorurl', 'vendorlink'
]);

const ITEM_PRICE_KEYS = new Set([
  'rate', 'total', 'originalTotal', '_baseRate', '_baseTotal', 'unitPrice',
  'price', 'amount', 'quotedAmount'
]);

export const ACCOUNT_FIELD = Object.freeze({
  QUOTE_NUMBER: 'quotes.number',
  QUOTE_TITLE: 'quotes.title',
  QUOTE_CLIENT_NAME: 'quotes.client_name',
  QUOTE_CLIENT_PHONE: 'quotes.client_phone',
  QUOTE_CLIENT_EMAIL: 'quotes.client_email',
  QUOTE_PROJECT_ADDRESS: 'quotes.project_address',
  QUOTE_SCOPE: 'quotes.scope',
  QUOTE_CUSTOMER_PRICING: 'quotes.customer_pricing',
  QUOTE_NOTES: 'quotes.notes',
  QUOTE_TERMS: 'quotes.terms',
  QUOTE_DATES: 'quotes.dates',
  CLIENT_NAME: 'clients.name',
  CLIENT_PHONE: 'clients.phone',
  CLIENT_EMAIL: 'clients.email',
  CLIENT_ADDRESS: 'clients.address',
  CLIENT_NOTES: 'clients.notes',
  CLIENT_CRM: 'clients.crm',
  BUSINESS_COMPANY_NAME: 'business.company_name',
  BUSINESS_TAGLINE: 'business.tagline',
  BUSINESS_OWNER_NAME: 'business.owner_name',
  BUSINESS_ADDRESS: 'business.address',
  BUSINESS_PHONE: 'business.phone',
  BUSINESS_EMAIL: 'business.email',
  BUSINESS_TAX_NUMBER: 'business.tax_number',
  BUSINESS_LOGO: 'business.logo',
  ITEM_NAME: 'items.name',
  ITEM_DESCRIPTION: 'items.description',
  ITEM_SELL_PRICE: 'items.sell_price',
  ITEM_PHOTOS: 'items.photos'
});

const QUOTE_ROW_FIELD_ALIASES = Object.freeze({
  [ACCOUNT_FIELD.QUOTE_NUMBER]: ['quote_number'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_NAME]: ['client_name', 'accepted_by'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_PHONE]: ['client_phone', 'phone'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_EMAIL]: ['client_email', 'email'],
  [ACCOUNT_FIELD.QUOTE_PROJECT_ADDRESS]: ['client_address', 'client_city', 'project_address'],
  [ACCOUNT_FIELD.QUOTE_SCOPE]: ['project_description', 'rooms'],
  [ACCOUNT_FIELD.QUOTE_CUSTOMER_PRICING]: ['subtotal', 'tax_rate', 'tax_amount', 'total', 'grand_total'],
  [ACCOUNT_FIELD.QUOTE_NOTES]: ['notes'],
  [ACCOUNT_FIELD.QUOTE_TERMS]: ['terms'],
  [ACCOUNT_FIELD.QUOTE_DATES]: ['quote_date', 'valid_until']
});

const QUOTE_DATA_FIELD_ALIASES = Object.freeze({
  [ACCOUNT_FIELD.QUOTE_NUMBER]: ['quoteNumber', 'quote_number', 'parentQuoteNumber', 'changeOrderNumber'],
  [ACCOUNT_FIELD.QUOTE_TITLE]: ['quoteTitle', 'quote_title'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_NAME]: ['clientName', 'client_name'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_PHONE]: ['clientPhone', 'client_phone', 'phone'],
  [ACCOUNT_FIELD.QUOTE_CLIENT_EMAIL]: ['clientEmail', 'client_email', 'email'],
  [ACCOUNT_FIELD.QUOTE_PROJECT_ADDRESS]: ['projectAddress', 'project_address', 'clientAddress', 'client_address'],
  [ACCOUNT_FIELD.QUOTE_SCOPE]: ['rooms', 'projectDescription', 'project_description', 'reviewProfile'],
  [ACCOUNT_FIELD.QUOTE_CUSTOMER_PRICING]: [
    'subtotal', 'taxRate', 'tax_rate', 'taxAmount', 'tax_amount', 'total', 'grandTotal',
    'quoted_total_cents', 'parentQuoteTotal', 'quoteAdjustment', 'clientAdjustment'
  ],
  [ACCOUNT_FIELD.QUOTE_NOTES]: ['notes'],
  [ACCOUNT_FIELD.QUOTE_TERMS]: ['terms', 'paymentTerms', 'payment_terms'],
  [ACCOUNT_FIELD.QUOTE_DATES]: ['quoteDate', 'quote_date', 'validUntil', 'valid_until']
});

const CLIENT_FIELD_ALIASES = Object.freeze({
  [ACCOUNT_FIELD.CLIENT_NAME]: ['name'],
  [ACCOUNT_FIELD.CLIENT_PHONE]: ['phone'],
  [ACCOUNT_FIELD.CLIENT_EMAIL]: ['email'],
  [ACCOUNT_FIELD.CLIENT_ADDRESS]: ['address', 'city', 'province', 'postal_code', 'postalCode'],
  [ACCOUNT_FIELD.CLIENT_NOTES]: ['notes'],
  [ACCOUNT_FIELD.CLIENT_CRM]: ['crm']
});

const BUSINESS_FIELD_ALIASES = Object.freeze({
  [ACCOUNT_FIELD.BUSINESS_COMPANY_NAME]: ['business_name', 'businessName', 'company_name', 'companyName'],
  [ACCOUNT_FIELD.BUSINESS_TAGLINE]: ['tagline'],
  [ACCOUNT_FIELD.BUSINESS_OWNER_NAME]: ['owner_name', 'ownerName'],
  [ACCOUNT_FIELD.BUSINESS_ADDRESS]: ['address', 'city', 'province', 'postal_code', 'postalCode'],
  [ACCOUNT_FIELD.BUSINESS_PHONE]: ['phone'],
  [ACCOUNT_FIELD.BUSINESS_EMAIL]: ['email'],
  [ACCOUNT_FIELD.BUSINESS_TAX_NUMBER]: ['hst_number', 'hstNumber', 'gst_number', 'gstNumber', 'tax_number', 'taxNumber'],
  [ACCOUNT_FIELD.BUSINESS_LOGO]: ['logo', 'logo_url', 'logoUrl']
});

const ITEM_FIELD_NORMALIZED_KEYS = Object.freeze({
  [ACCOUNT_FIELD.ITEM_NAME]: new Set(['name', 'label', 'servicename']),
  [ACCOUNT_FIELD.ITEM_DESCRIPTION]: new Set(['description', 'itemdescription', 'displaydescription', 'notes']),
  [ACCOUNT_FIELD.ITEM_SELL_PRICE]: new Set([
    'rate', 'price', 'unitprice', 'sellprice', 'total', 'amount', 'quotedamount',
    'discountvalue', 'baserate', 'basetotal', 'originaltotal'
  ]),
  [ACCOUNT_FIELD.ITEM_PHOTOS]: new Set([
    'photo', 'photos', 'photofull', 'photosfull', 'image', 'images', 'imageurl', 'imageurls'
  ])
});

const CUSTOMER_PRICE_NORMALIZED_KEYS = new Set([
  'rate', 'price', 'unitprice', 'sellprice', 'total', 'subtotal', 'grandtotal',
  'taxrate', 'taxamount', 'amount', 'quotedamount', 'quotedtotalcents',
  'parentquotetotal', 'quoteadjustment', 'clientadjustment', 'discountvalue',
  'baserate', 'basetotal', 'originaltotal'
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizedKey(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function accountFieldCanRead(fieldAccess, fieldKey) {
  if (fieldAccess == null) return true;
  const level = fieldAccess && fieldAccess[fieldKey];
  return level === 'read' || level === 'write';
}

export function accountFieldCanWrite(fieldAccess, fieldKey) {
  if (fieldAccess == null) return true;
  return fieldAccess && fieldAccess[fieldKey] === 'write';
}

function deleteAliases(target, aliases) {
  if (!target || typeof target !== 'object') return target;
  const normalizedAliases = new Set((aliases || []).map(normalizedKey));
  for (const key of Object.keys(target)) {
    if (normalizedAliases.has(normalizedKey(key))) delete target[key];
  }
  return target;
}

function copyAliases(target, source, aliases) {
  if (!target || typeof target !== 'object') return target;
  const normalizedAliases = new Set((aliases || []).map(normalizedKey));
  for (const key of Object.keys(target)) {
    if (normalizedAliases.has(normalizedKey(key))) delete target[key];
  }
  if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      if (normalizedAliases.has(normalizedKey(key))) target[key] = clone(value);
    }
  }
  return target;
}

function scrubNestedNormalizedKeys(value, keys) {
  if (Array.isArray(value)) return value.map((child) => scrubNestedNormalizedKeys(child, keys));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(normalizedKey(key))) continue;
    output[key] = scrubNestedNormalizedKeys(child, keys);
  }
  return output;
}

function applyReadAliases(target, fieldAccess, mapping) {
  for (const [fieldKey, aliases] of Object.entries(mapping)) {
    if (!accountFieldCanRead(fieldAccess, fieldKey)) deleteAliases(target, aliases);
  }
  return target;
}

function applyWriteAliases(target, source, fieldAccess, mapping) {
  for (const [fieldKey, aliases] of Object.entries(mapping)) {
    if (!accountFieldCanWrite(fieldAccess, fieldKey)) copyAliases(target, source, aliases);
  }
  return target;
}

const ROOT_PROTECTED_NORMALIZED_KEYS = new Set([...ROOT_PROTECTED_KEYS].map(normalizedKey));
const WRITE_PROTECTED_NORMALIZED_KEYS = new Set([...WRITE_PROTECTED_KEYS].map(normalizedKey));
const SECRET_NORMALIZED_KEYS = new Set([
  'accesstoken', 'refreshtoken', 'clientsecret', 'secretkey', 'apikey'
]);

function isRootProtectedKey(key) {
  const normalized = normalizedKey(key);
  return ROOT_PROTECTED_NORMALIZED_KEYS.has(normalized)
    || SECRET_NORMALIZED_KEYS.has(normalized)
    || normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('apikey')
    || normalized.includes('portalpin')
    || normalized.includes('portalshare')
    || normalized.includes('publicshare')
    || normalized.startsWith('stripe')
    || normalized.startsWith('billing')
    || normalized.startsWith('subscription')
    || normalized.startsWith('quickbooks')
    || /^qb(token|settings|connection|company|realm)/.test(normalized);
}

function isWriteProtectedKey(key) {
  return WRITE_PROTECTED_NORMALIZED_KEYS.has(normalizedKey(key));
}

function isInternalMetadataKey(key) {
  return INTERNAL_METADATA_KEYS.has(normalizedKey(key));
}

function isSensitivePricingKey(key) {
  const normalized = normalizedKey(key);
  if (PRICING_KEYS.has(normalized)) return true;
  return normalized.includes('cost')
    || normalized.includes('margin')
    || normalized.includes('profit')
    || normalized.includes('markup')
    || normalized.includes('supplier')
    || normalized.includes('wholesale')
    || normalized.includes('vendor')
    || /^(internal|labor|labour).*(rate|url|link)$/.test(normalized);
}

function finiteNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, places = 6) {
  const multiplier = 10 ** places;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function scaledValue(value, factor) {
  if (value === null || value === undefined || value === '') return value;
  const numeric = finiteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? rounded(numeric * factor) : value;
}

function lineMarkupFactor(room, item) {
  const roomMarkup = Math.max(0, finiteNumber(room && room.markup, 0));
  const itemMarkup = Math.max(0, finiteNumber(item && item.markup, 0));
  return 1 + ((roomMarkup + itemMarkup) / 100);
}

function transformItemPriceFields(item, factor) {
  if (!item || typeof item !== 'object') return item;
  const output = clone(item);
  for (const key of Object.keys(output)) {
    if (ITEM_PRICE_KEYS.has(key)) output[key] = scaledValue(output[key], factor);
  }
  if (String(output.discountType || '').toLowerCase() === 'amount') {
    output.discountValue = scaledValue(output.discountValue, factor);
  }
  if (output.upgrade && typeof output.upgrade === 'object') {
    output.upgrade = transformItemPriceFields(output.upgrade, factor);
  }
  return output;
}

function scrubSensitiveKeys(value) {
  if (Array.isArray(value)) return value.map(scrubSensitiveKeys);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitivePricingKey(key) || isRootProtectedKey(key) || isInternalMetadataKey(key)) continue;
    output[key] = scrubSensitiveKeys(child);
  }
  return output;
}

function scrubProtectedKeys(value) {
  if (Array.isArray(value)) return value.map(scrubProtectedKeys);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isRootProtectedKey(key) || isInternalMetadataKey(key)) continue;
    output[key] = scrubProtectedKeys(child);
  }
  return output;
}

function sanitizeRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : []).map((sourceRoom) => {
    const room = clone(sourceRoom || {});
    const sourceItems = Array.isArray(sourceRoom && sourceRoom.items) ? sourceRoom.items : [];
    room.items = sourceItems.map((sourceItem) => {
      const flattened = transformItemPriceFields(sourceItem, lineMarkupFactor(sourceRoom, sourceItem));
      return scrubSensitiveKeys(flattened);
    });
    return scrubSensitiveKeys(room);
  });
}

function applyQuoteDataVisibility(data, options = {}) {
  if (!data || typeof data !== 'object') return data;
  const output = data;
  const fieldAccess = options.fieldAccess;
  applyReadAliases(output, fieldAccess, QUOTE_DATA_FIELD_ALIASES);
  if (!accountFieldCanRead(fieldAccess, ACCOUNT_FIELD.QUOTE_CUSTOMER_PRICING) && Array.isArray(output.rooms)) {
    output.rooms = scrubNestedNormalizedKeys(output.rooms, CUSTOMER_PRICE_NORMALIZED_KEYS);
  }
  if (output.businessProfile && typeof output.businessProfile === 'object') {
    output.businessProfile = sanitizeBusinessProfile(output.businessProfile, {
      fieldAccess,
      canReadPricing: options.canReadPricing === true
    });
  }
  return output;
}

function knownBusinessAliasKeys() {
  const keys = new Set(['hiddenprofilefields']);
  for (const aliases of Object.values(BUSINESS_FIELD_ALIASES)) {
    for (const alias of aliases) keys.add(normalizedKey(alias));
  }
  return keys;
}

const BUSINESS_KNOWN_NORMALIZED_KEYS = knownBusinessAliasKeys();

export function sanitizeBusinessProfile(profile, options = {}) {
  if (!profile || typeof profile !== 'object') return profile;
  const output = options.canReadPricing === true
    ? scrubProtectedKeys(profile)
    : stripRestrictedWriteFields(profile);
  applyReadAliases(output, options.fieldAccess, BUSINESS_FIELD_ALIASES);
  if (options.fieldAccess != null) {
    for (const key of Object.keys(output)) {
      if (!BUSINESS_KNOWN_NORMALIZED_KEYS.has(normalizedKey(key))) delete output[key];
    }
    const anyVisible = Object.keys(BUSINESS_FIELD_ALIASES)
      .some((fieldKey) => accountFieldCanRead(options.fieldAccess, fieldKey));
    if (!anyVisible) deleteAliases(output, ['hidden_profile_fields', 'hiddenProfileFields']);
  }
  return output;
}

export function sanitizeClientRow(row, options = {}) {
  if (!row || typeof row !== 'object') return row;
  const output = stripRestrictedWriteFields(row);
  applyReadAliases(output, options.fieldAccess, CLIENT_FIELD_ALIASES);
  return output;
}

export function sanitizeQuoteData(data, options = {}) {
  if (!data || typeof data !== 'object') return data;
  const output = clone(data);
  if (options.canReadPricing !== true) output.rooms = sanitizeRooms(data.rooms);
  for (const key of Object.keys(output)) {
    if (isRootProtectedKey(key)) delete output[key];
  }
  const scrubbed = options.canReadPricing === true ? scrubProtectedKeys(output) : scrubSensitiveKeys(output);
  return applyQuoteDataVisibility(scrubbed, options);
}

export function sanitizeQuoteRow(row, options = {}) {
  if (!row || typeof row !== 'object') return row;
  const output = clone(row);
  output.data = sanitizeQuoteData(row.data, options);
  for (const key of Object.keys(output)) {
    if (
      isRootProtectedKey(key)
      || isInternalMetadataKey(key)
      || (options.canReadPricing !== true && isSensitivePricingKey(key))
    ) delete output[key];
  }
  applyReadAliases(output, options.fieldAccess, QUOTE_ROW_FIELD_ALIASES);
  // QuoteDr's canonical room payload lives in data.rooms. Never return the
  // legacy duplicate column to team clients because it can bypass the nested
  // field projection and expose customer pricing alongside otherwise-visible
  // scope details.
  if (options.fieldAccess != null) delete output.rooms;
  return output;
}

export function sanitizeSavedItemRow(row, options = {}) {
  if (!row || typeof row !== 'object') return row;
  const output = options.canReadPricing === true ? scrubProtectedKeys(row) : stripRestrictedWriteFields(row);
  if (options.fieldAccess == null) return output;
  for (const [fieldKey, keys] of Object.entries(ITEM_FIELD_NORMALIZED_KEYS)) {
    if (accountFieldCanRead(options.fieldAccess, fieldKey)) continue;
    for (const key of Object.keys(output)) {
      if (keys.has(normalizedKey(key))) delete output[key];
    }
    if (Object.prototype.hasOwnProperty.call(output, 'data')) {
      output.data = scrubNestedNormalizedKeys(output.data, keys);
    }
  }
  return output;
}

export function sanitizeTemplateRow(row, options = {}) {
  if (!row || typeof row !== 'object') return row;
  const output = options.canReadPricing === true ? scrubProtectedKeys(row) : clone(row);
  if (options.canReadPricing !== true && Array.isArray(output.rooms)) output.rooms = sanitizeRooms(output.rooms);
  if (output.data && typeof output.data === 'object') output.data = sanitizeQuoteData(output.data, options);
  const safe = options.canReadPricing === true ? output : stripRestrictedWriteFields(output);
  if (Array.isArray(safe.rooms)) {
    if (!accountFieldCanRead(options.fieldAccess, ACCOUNT_FIELD.QUOTE_SCOPE)) delete safe.rooms;
    else if (!accountFieldCanRead(options.fieldAccess, ACCOUNT_FIELD.QUOTE_CUSTOMER_PRICING)) {
      safe.rooms = scrubNestedNormalizedKeys(safe.rooms, CUSTOMER_PRICE_NORMALIZED_KEYS);
    }
  }
  return safe;
}

function byReference(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && typeof row._quotedrTeamRef === 'string') map.set(row._quotedrTeamRef, row);
  }
  return map;
}

function byStableId(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.id != null && String(row.id).length > 0) map.set(String(row.id), row);
  }
  return map;
}

function invalidReferenceError(kind) {
  const error = new Error(`The ${kind} reference is stale or invalid.`);
  error.code = 'stale_team_reference';
  return error;
}

function preserveSensitiveKeys(target, source) {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') return target;
  for (const [key, value] of Object.entries(source)) {
    if (isSensitivePricingKey(key) || isRootProtectedKey(key) || isWriteProtectedKey(key)) {
      target[key] = clone(value);
    } else if (
      target[key] && typeof target[key] === 'object'
      && value && typeof value === 'object'
    ) {
      preserveSensitiveKeys(target[key], value);
    }
  }
  return target;
}

function stableObjectKeys(value) {
  if (!value || typeof value !== 'object') return [];
  const keys = [];
  if (typeof value._quotedrTeamRef === 'string' && value._quotedrTeamRef) {
    keys.push('ref:' + value._quotedrTeamRef);
  }
  if (value.id !== null && value.id !== undefined && String(value.id)) {
    keys.push('id:' + String(value.id));
  }
  return keys;
}

function preserveNestedNormalizedKeys(target, source, keys) {
  if (Array.isArray(target)) {
    const sourceRows = Array.isArray(source) ? source : [];
    const sourceByKey = new Map();
    for (const sourceRow of sourceRows) {
      for (const key of stableObjectKeys(sourceRow)) sourceByKey.set(key, sourceRow);
    }
    return target.map((targetRow) => {
      const sourceRow = stableObjectKeys(targetRow)
        .map((key) => sourceByKey.get(key))
        .find(Boolean);
      return sourceRow
        ? preserveNestedNormalizedKeys(targetRow, sourceRow, keys)
        : scrubNestedNormalizedKeys(targetRow, keys);
    });
  }
  if (!target || typeof target !== 'object') return target;
  const output = clone(target);
  for (const key of Object.keys(output)) {
    if (keys.has(normalizedKey(key))) delete output[key];
  }
  if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      if (keys.has(normalizedKey(key))) output[key] = clone(value);
    }
  }
  for (const [key, value] of Object.entries(output)) {
    if (keys.has(normalizedKey(key)) || !value || typeof value !== 'object') continue;
    const sourceValue = source && typeof source === 'object' ? source[key] : undefined;
    output[key] = preserveNestedNormalizedKeys(value, sourceValue, keys);
  }
  return output;
}

export function mergeQuoteFieldAccess(existingRow, candidateRow, options = {}) {
  const existing = clone(existingRow || {});
  const output = clone(candidateRow || {});
  const fieldAccess = options.fieldAccess;
  applyWriteAliases(output, existing, fieldAccess, QUOTE_ROW_FIELD_ALIASES);

  const existingData = existing.data && typeof existing.data === 'object' ? existing.data : {};
  const candidateData = output.data && typeof output.data === 'object' ? output.data : {};
  applyWriteAliases(candidateData, existingData, fieldAccess, QUOTE_DATA_FIELD_ALIASES);
  if (
    accountFieldCanWrite(fieldAccess, ACCOUNT_FIELD.QUOTE_SCOPE)
    && !accountFieldCanWrite(fieldAccess, ACCOUNT_FIELD.QUOTE_CUSTOMER_PRICING)
    && Array.isArray(candidateData.rooms)
  ) {
    candidateData.rooms = preserveNestedNormalizedKeys(
      candidateData.rooms,
      existingData.rooms,
      CUSTOMER_PRICE_NORMALIZED_KEYS
    );
  }
  output.data = candidateData;
  return output;
}

export function mergeClientFieldAccess(existingRow, candidateRow, options = {}) {
  const existing = clone(existingRow || {});
  const output = stripRestrictedWriteFields(candidateRow || {});
  applyWriteAliases(output, existing, options.fieldAccess, CLIENT_FIELD_ALIASES);
  return output;
}

function removeTeamReferences(value) {
  if (Array.isArray(value)) return value.map(removeTeamReferences);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '_quotedrTeamRef') continue;
    output[key] = removeTeamReferences(child);
  }
  return output;
}

export function mergeRestrictedQuoteUpdate(existingRow, submittedRow, options = {}) {
  const existing = clone(existingRow || {});
  const submitted = clone(submittedRow || {});
  const existingData = existing.data && typeof existing.data === 'object' ? existing.data : {};
  const submittedData = submitted.data && typeof submitted.data === 'object' ? submitted.data : {};
  const existingRoomsByRef = byReference(existingData.rooms);
  const existingRoomsById = byStableId(existingData.rooms);
  const cleanData = stripRestrictedWriteFields(submittedData);
  const usedRoomReferences = new Set();

  cleanData.rooms = (Array.isArray(submittedData.rooms) ? submittedData.rooms : []).map((incomingRoom) => {
    const cleanRoom = stripRestrictedWriteFields(incomingRoom || {});
    const roomReference = String(incomingRoom && incomingRoom._quotedrTeamRef || '');
    const originalRoom = roomReference && usedRoomReferences.has(roomReference) === false
      ? existingRoomsByRef.get(roomReference) || null
      : null;
    if (!originalRoom && incomingRoom && incomingRoom.id != null && existingRoomsById.has(String(incomingRoom.id))) {
      throw invalidReferenceError('room');
    }
    if (originalRoom) usedRoomReferences.add(roomReference);
    const originalItemsByRef = byReference(originalRoom && originalRoom.items);
    const originalItemsById = byStableId(originalRoom && originalRoom.items);
    const usedItemReferences = new Set();

    cleanRoom.items = (Array.isArray(incomingRoom && incomingRoom.items) ? incomingRoom.items : []).map((incomingItem) => {
      const itemReference = String(incomingItem && incomingItem._quotedrTeamRef || '');
      const originalItem = itemReference && usedItemReferences.has(itemReference) === false
        ? originalItemsByRef.get(itemReference) || null
        : null;
      if (!originalItem && incomingItem && incomingItem.id != null && originalItemsById.has(String(incomingItem.id))) {
        throw invalidReferenceError('line item');
      }
      if (originalItem) usedItemReferences.add(itemReference);
      const factor = originalRoom ? lineMarkupFactor(originalRoom, originalItem || {}) : 1;
      const unflattened = transformItemPriceFields(stripRestrictedWriteFields(incomingItem || {}), 1 / factor);
      if (originalItem) preserveSensitiveKeys(unflattened, originalItem);
      return unflattened;
    });

    if (originalRoom) preserveSensitiveKeys(cleanRoom, originalRoom);
    return cleanRoom;
  });

  for (const key of Object.keys(cleanData)) {
    if (isRootProtectedKey(key) || isWriteProtectedKey(key)) delete cleanData[key];
  }
  for (const [key, value] of Object.entries(existingData)) {
    if (isRootProtectedKey(key) || isWriteProtectedKey(key)) cleanData[key] = clone(value);
  }
  preserveSensitiveKeys(cleanData, existingData);

  const merged = { ...existing, ...submitted, data: cleanData };
  return removeTeamReferences(mergeQuoteFieldAccess(existing, merged, options));
}

export function stripRestrictedWriteFields(value) {
  function scrubWrite(child) {
    if (Array.isArray(child)) return child.map(scrubWrite);
    if (!child || typeof child !== 'object') return child;
    const output = {};
    for (const [key, nested] of Object.entries(child)) {
      if (
        isRootProtectedKey(key)
        || isWriteProtectedKey(key)
        || isSensitivePricingKey(key)
        || isInternalMetadataKey(key)
      ) continue;
      output[key] = scrubWrite(nested);
    }
    return output;
  }
  return removeTeamReferences(scrubWrite(value));
}

export function removeTeamDataReferences(value) {
  return removeTeamReferences(value);
}

export function findSensitiveFieldPaths(value, prefix = '') {
  const paths = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => paths.push(...findSensitiveFieldPaths(child, `${prefix}[${index}]`)));
    return paths;
  }
  if (!value || typeof value !== 'object') return paths;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSensitivePricingKey(key) || isRootProtectedKey(key)) paths.push(path);
    else paths.push(...findSensitiveFieldPaths(child, path));
  }
  return paths;
}

export const ACCOUNT_DATA_POLICY = Object.freeze({
  rootProtectedKeys: Object.freeze([...ROOT_PROTECTED_KEYS]),
  pricingKeyNames: Object.freeze([...PRICING_KEYS]),
  fieldKeys: ACCOUNT_FIELD
});
