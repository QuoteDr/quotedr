const MAX_DECISION_ITEMS = 1000;
const MAX_DECISION_GROUPS = 100;
const MAX_SELECTION_IDS = 100;
const MAX_ROOM_NOTES = 200;
const MAX_NOTE_LENGTH = 4000;
const MAX_SIGNATURE_DATA_URL = 2_000_000;

const ROOT_SAFE_KEYS = new Set([
  'id', 'quoteNumber', 'quote_number', 'quoteTitle', 'quote_title', 'invoiceNumber',
  'invoice_number', 'invoiceTitle', 'documentTitle', 'title', 'clientName', 'client_name',
  'clientPhone', 'client_phone', 'phone', 'clientEmail', 'client_email', 'email',
  'projectAddress', 'project_address', 'clientAddress', 'client_address', 'address',
  'status', 'type', 'documentType', 'currency', 'subtotal', 'grandTotal', 'total',
  'taxRate', 'tax_rate', 'taxAmount', 'tax_amount', 'taxLabel', 'tax_label', 'taxEnabled',
  'priceTbdSelectionCount', 'dividerSingular', 'dividerPlural', 'quoteDividerLabels',
  'terms', 'termsExplicit', 'quoteDate', 'quote_date', 'validUntil', 'valid_until',
  'validUntilDate', 'fullResolutionPhotosEnabled', 'parentQuoteId', 'parent_quote_id',
  'parentQuoteNumber', 'parentQuoteTotal', 'changeOrderNumber', 'change_order_number',
  'changeOrderPreviousApprovedTotal', 'changeOrderPriceSummary', 'changeReason',
  'document_validity', 'documentValidity', 'invalidated_at', 'invalidatedAt',
  'invalidated_reason', 'invalidatedReason', 'voided_at', 'voidedAt',
  'portal_id', 'portal_visible', 'portal_added_at', 'portal_client_name',
  'portal_client_email', 'client_upgraded', 'client_upgraded_at', '_roomNotes',
  'paymentStatus', 'deposit_paid', 'deposit_paid_at', 'manual_payment_reported',
  'manual_payment_reported_at', 'accepted_total_cents', 'deposit_due_cents',
  'quoted_total_cents', 'accepted_at', 'accepted_by', 'approved_at', 'approved_by',
  'signed_at', 'signed_by', 'signature_method', 'signature_text', 'signature_url',
  'signature_data_url', 'terms_accepted', 'terms_accepted_at', 'terms_accepted_snapshot',
  'invoice_acknowledged', 'invoice_acknowledged_at', 'brandingSnapshotVersion',
  'brandingCapturedAt'
]);

const ROOT_COMPLEX_KEYS = new Set([
  'quoteDividerLabels', 'terms', 'changeOrderPriceSummary', '_roomNotes',
  'terms_accepted_snapshot'
]);

const ITEM_COPY_KEYS = new Set([
  'id', 'name', 'label', 'description', 'serviceName', 'category', 'unitType', 'unit',
  'quantity', 'notes', 'itemDescription', 'displayDescription', 'actualDescription',
  'highlightColor', 'icon', 'text', 'optional', 'optionalSelectedByDefault',
  '_optionalSelected', '_removed', 'upgraded', 'selectedUpgradeOptionIds',
  'priceTbd', 'pricingMode', 'hasTbdSelections', 'requiresConsultation',
  '_coRemoved', '_coChangeStatus', '_clientDecisionApplied'
]);

const PRICE_KEYS = new Set([
  'rate', 'total', 'originalTotal', '_baseRate', '_baseTotal', 'unitPrice', 'price',
  'amount', 'quotedAmount'
]);

const STYLE_SAFE_KEYS = new Set([
  'preset', 'accent', 'accentStrength', 'optionAccent', 'optionAccentStrength',
  'upgradeAccent', 'upgradeBg', 'bg', 'bgOpacity', 'headerStyle', 'headerEffect',
  'headerOpacity', 'fontFeel', 'pricingMode', 'depositMode', 'depositKind',
  'depositPercent', 'depositFixedCents', 'approvalMode', 'expiryDate', 'showUpgrades',
  'showScopeNotes', 'descriptionPreviewLength', 'scopePreviewLength',
  'alwaysShowFullDescriptions', 'showCommitment', 'clientMessage'
]);

const PUBLIC_BUSINESS_KEYS = new Set([
  'business_name', 'businessName', 'company_name', 'companyName', 'tagline',
  'companyTagline', 'business_tagline', 'owner_name', 'ownerName', 'name', 'address',
  'streetAddress', 'street_address', 'city', 'province', 'state', 'postal_code',
  'postalCode', 'postal', 'phone', 'business_phone', 'email', 'business_email',
  'hst_number', 'hstNumber', 'gst_number', 'gstNumber', 'taxNumber', 'tax_number',
  'website', 'url', 'hidden_profile_fields', 'hiddenProfileFields'
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rounded(value, places = 6) {
  const multiplier = 10 ** places;
  return Math.round((finiteNumber(value, 0) + Number.EPSILON) * multiplier) / multiplier;
}

function scaled(value, factor) {
  if (value === null || value === undefined || value === '') return value;
  const parsed = finiteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? rounded(parsed * factor) : value;
}

function cleanString(value, limit = 4000) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, limit);
}

function cleanId(value) {
  return cleanString(value, 200);
}

function normalizeKey(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function sanitizeClientMediaUrl(value) {
  const text = cleanString(value, MAX_SIGNATURE_DATA_URL);
  if (!text) return '';
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(text)) return text;
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  const fragmentKey = normalizeKey(url.hash);
  if (
    fragmentKey.includes('token') || fragmentKey.includes('secret') ||
    fragmentKey.includes('signature') || fragmentKey.includes('credential') ||
    fragmentKey.includes('apikey') || fragmentKey.includes('auth')
  ) return '';
  for (const key of url.searchParams.keys()) {
    const normalized = normalizeKey(key);
    if (
      normalized.includes('token') || normalized.includes('secret') ||
      normalized.includes('signature') || normalized.includes('credential') ||
      normalized === 'key' || normalized === 'apikey' || normalized === 'auth' ||
      normalized === 'sig' || normalized === 'sas' ||
      normalized.startsWith('xamz')
    ) return '';
  }
  return url.toString();
}

function lineMarkupFactor(room, item) {
  const roomMarkup = Math.max(0, Math.min(100, finiteNumber(room && room.markup, 0)));
  const itemMarkup = Math.max(0, finiteNumber(item && item.markup, 0));
  return 1 + ((roomMarkup + itemMarkup) / 100);
}

function isPriceTbd(value) {
  if (!value) return false;
  const mode = cleanString(value.pricingMode || value.pricing_mode, 40).toLowerCase().replace(/[\s-]+/g, '_');
  return value.priceTbd === true || value.price_tbd === true || ['tbd', 'price_tbd', 'to_be_determined'].includes(mode);
}

function optionQuantity(parentQuantity, option) {
  const mode = cleanString(option && option.quantityMode, 40).toLowerCase().replace(/[\s-]+/g, '_');
  if (mode === 'manual') return Math.max(0, finiteNumber(option && option.manualQuantity, 0));
  if (mode === 'multiplier' || mode === 'multiply') {
    return Math.max(0, parentQuantity) * Math.max(0, finiteNumber(option && option.quantityMultiplier, 1) || 1);
  }
  if (mode === 'override' || mode === 'fixed') return Math.max(0, finiteNumber(option && option.quantityOverride, 0));
  return Math.max(0, parentQuantity);
}

function normalizeUpgradeType(value) {
  const clean = cleanString(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
  if (clean === 'consultation' || clean === 'requires_consultation') return 'consultation';
  return clean === 'replacement' ? 'replacement' : 'add_on';
}

function selectedOptions(group, useDefault) {
  if (!isRecord(group)) return [];
  let ids = Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds.map(cleanId).filter(Boolean) : [];
  if (useDefault && group.type === 'single') ids = [ids[0] || cleanId(group.defaultOptionId)].filter(Boolean);
  const allowed = new Set(ids);
  return (Array.isArray(group.options) ? group.options : []).filter((option) => allowed.has(cleanId(option && option.id)));
}

function selectedEnhancements(choiceGroup) {
  const selectedBaseIds = new Set(selectedOptions(choiceGroup, true).map((option) => cleanId(option.id)));
  const chosen = [];
  const chosenIds = new Set();
  for (const group of Array.isArray(choiceGroup && choiceGroup.enhancementGroups) ? choiceGroup.enhancementGroups : []) {
    const options = selectedOptions(group, false);
    for (const option of options) {
      const allowedBase = Array.isArray(option.allowedBaseOptionIds) ? option.allowedBaseOptionIds.map(cleanId).filter(Boolean) : [];
      if (allowedBase.length && !allowedBase.some((id) => selectedBaseIds.has(id))) continue;
      const blocked = Array.isArray(option.blockedByEnhancementOptionIds) ? option.blockedByEnhancementOptionIds.map(cleanId).filter(Boolean) : [];
      if (blocked.some((id) => chosenIds.has(id))) continue;
      chosen.push(option);
      chosenIds.add(cleanId(option.id));
    }
  }
  return chosen;
}

function effectiveUpgradeGroups(item, selectedBaseOption) {
  if (selectedBaseOption && Array.isArray(selectedBaseOption.upgradeGroups)) return selectedBaseOption.upgradeGroups;
  return Array.isArray(item && item.upgradeGroups) ? item.upgradeGroups : [];
}

function selectedUpgradeOptions(groups) {
  const selected = [];
  const allIds = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const id of Array.isArray(group && group.selectedOptionIds) ? group.selectedOptionIds : []) allIds.push(cleanId(id));
  }
  const selectedSet = new Set(allIds.filter(Boolean));
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const option of Array.isArray(group && group.options) ? group.options : []) {
      const id = cleanId(option && option.id);
      if (!selectedSet.has(id)) continue;
      const required = Array.isArray(option.availableAfterOptionIds) ? option.availableAfterOptionIds.map(cleanId).filter(Boolean) : [];
      const blocked = Array.isArray(option.blockedByOptionIds) ? option.blockedByOptionIds.map(cleanId).filter(Boolean) : [];
      const otherIds = allIds.filter((other) => other && other !== id);
      if (required.length && !required.some((requiredId) => otherIds.includes(requiredId))) continue;
      if (blocked.some((blockedId) => otherIds.includes(blockedId))) continue;
      selected.push(option);
    }
  }
  return selected;
}

function applyUpgradePricing(baseTotal, parentQuantity, groups) {
  let total = baseTotal;
  let hasTbd = false;
  for (const option of selectedUpgradeOptions(groups)) {
    const type = normalizeUpgradeType(option.upgradeType || option.type || option.mode);
    if (type === 'consultation') continue;
    if (isPriceTbd(option)) {
      hasTbd = true;
      if (type === 'replacement') total = 0;
      continue;
    }
    const optionTotal = optionQuantity(parentQuantity, option) * finiteNumber(option.rate, 0);
    total = type === 'replacement' ? optionTotal : total + optionTotal;
  }
  return { total, hasTbd };
}

function activeItemTotal(item, options = {}) {
  if (!isRecord(item) || isPriceTbd(item) || item._removed === true) return 0;
  const quantity = Math.max(0, finiteNumber(item.quantity, 0));
  const discountType = cleanString(item.discountType, 30).toLowerCase();
  const hasDiscount = ['amount', 'percent'].includes(discountType) && finiteNumber(item.discountValue, 0) > 0;
  const hasExplicitTotal = item.total !== undefined && item.total !== null && item.total !== '';
  const hasBaseState = item._baseRate !== undefined || item._baseTotal !== undefined ||
    item._baseMaterialCost !== undefined || item._baseUnitType !== undefined;
  const baseTotal = item._baseTotal !== undefined && item._baseTotal !== null && item._baseTotal !== ''
    ? finiteNumber(item._baseTotal, 0)
    : (item._baseRate !== undefined && item._baseRate !== null && item._baseRate !== ''
      ? quantity * finiteNumber(item._baseRate, 0)
      : (!hasDiscount && options.ignoreExplicitTotal !== true && hasExplicitTotal
        ? finiteNumber(item.total, 0)
        : quantity * finiteNumber(item.rate, 0)));
  let total;
  let selectedBaseOption = null;

  if (isRecord(item.choiceGroup)) {
    const bases = selectedOptions(item.choiceGroup, true);
    selectedBaseOption = bases[0] || null;
    total = bases.reduce((sum, option) => {
      if (isPriceTbd(option)) return sum;
      return sum + optionQuantity(quantity, option) * finiteNumber(option.rate, 0);
    }, 0);
    const enhancements = selectedEnhancements(item.choiceGroup);
    const replacements = enhancements.filter((option) => normalizeUpgradeType(option.upgradeType) === 'replacement');
    if (replacements.length) {
      const replacement = replacements[replacements.length - 1];
      total = isPriceTbd(replacement) ? 0 : optionQuantity(quantity, replacement) * finiteNumber(replacement.rate, 0);
    }
    for (const option of enhancements.filter((candidate) => normalizeUpgradeType(candidate.upgradeType) !== 'replacement')) {
      if (!isPriceTbd(option)) total += optionQuantity(quantity, option) * finiteNumber(option.rate, 0);
    }
  } else {
    total = baseTotal;
    if (item.upgraded === true && isRecord(item.upgrade)) {
      const type = normalizeUpgradeType(item.upgrade.upgradeType || item.upgrade.type || item.upgrade.mode);
      if (!hasBaseState && item.upgrade.total !== undefined && item.upgrade.total !== null && item.upgrade.total !== '') {
        total = finiteNumber(item.upgrade.total, 0);
      } else {
        const upgradeTotal = quantity * finiteNumber(item.upgrade.rate, 0);
        total = type === 'replacement' ? upgradeTotal : baseTotal + upgradeTotal;
      }
    }
  }

  const groups = effectiveUpgradeGroups(item, selectedBaseOption);
  if (groups.length) total = applyUpgradePricing(total, quantity, groups).total;

  const discountValue = Math.max(0, finiteNumber(item.discountValue, 0));
  if (discountType === 'amount') total -= Math.min(total, discountValue);
  if (discountType === 'percent') total -= Math.min(total, total * discountValue / 100);
  return rounded(Math.max(0, total), 2);
}

function quoteAdjustment(data, subtotal) {
  const adjustment = isRecord(data && data.quoteAdjustment)
    ? data.quoteAdjustment
    : (isRecord(data && data.clientAdjustment) ? data.clientAdjustment : {});
  const rawType = cleanString(adjustment.type, 30).toLowerCase();
  const type = rawType === 'discount' ? 'discount' : 'addition';
  const basis = adjustment.basis === 'amount' || adjustment.mode === 'amount' || (adjustment.amount && !adjustment.percent)
    ? 'amount'
    : 'percent';
  let amount = basis === 'amount'
    ? Math.max(0, finiteNumber(adjustment.amount ?? adjustment.value, 0))
    : Math.max(0, subtotal) * Math.max(0, finiteNumber(adjustment.percent, 0)) / 100;
  if (!amount) amount = 0;
  return {
    name: cleanString(adjustment.name || (type === 'discount' ? 'Discount' : 'Adjustment'), 200) || (type === 'discount' ? 'Discount' : 'Adjustment'),
    type,
    amount: rounded(type === 'discount' ? -amount : amount),
  };
}

function taxSettings(data, summary) {
  let rate = finiteNumber(data && (data.taxRate ?? data.tax_rate), Number.NaN);
  if (!Number.isFinite(rate)) rate = finiteNumber(summary && summary.taxRate, 0.13);
  if (rate > 1) rate /= 100;
  if (!Number.isFinite(rate) || rate < 0) rate = 0.13;
  return {
    rate,
    enabled: data && data.taxEnabled !== false && !(summary && summary.taxEnabled === false),
    label: cleanString((data && (data.taxLabel || data.tax_label)) || (summary && summary.taxLabel) || 'HST', 40) || 'HST'
  };
}

function documentType(data, explicitType) {
  const raw = cleanString(explicitType || (data && (data.documentType || data.type)), 80).toLowerCase();
  if (raw.includes('invoice')) return 'invoice';
  if (raw.includes('change')) return 'change_order';
  return 'quote';
}

export function calculateClientDocumentTotals(data, options = {}) {
  const source = isRecord(data) ? data : {};
  const type = documentType(source, options.documentType);
  if (type === 'change_order') {
    const summary = isRecord(source.changeOrderPriceSummary) ? source.changeOrderPriceSummary : {};
    const context = isRecord(options.changeOrderContext) ? options.changeOrderContext : {};
    const parentTotal = finiteNumber(options.parentTotal ?? source.parentQuoteTotal ?? context.parentTotal ?? summary.originalTotal, 0);
    const previousApprovedTotal = finiteNumber(options.previousApprovedTotal ?? source.changeOrderPreviousApprovedTotal ?? context.previousApprovedTotal ?? summary.previousApprovedTotal, 0);
    let addedSubtotal = 0;
    let creditSubtotal = 0;
    for (const room of Array.isArray(source.rooms) ? source.rooms : []) {
      for (const item of Array.isArray(room && room.items) ? room.items : []) {
        const currentFactor = lineMarkupFactor(room, item);
        let delta = 0;
        if (isRecord(item && item._coOriginal)) {
          const original = item._coOriginal;
          const originalFactor = lineMarkupFactor(room, original);
          const originalTotal = original.total !== undefined && original.total !== null && original.total !== ''
            ? finiteNumber(original.total, 0)
            : Math.max(0, finiteNumber(original.quantity, 0)) * finiteNumber(original.rate, 0);
          if (item._coRemoved === true || item._coChangeStatus === 'removed') {
            delta = -Math.abs(originalTotal * originalFactor);
          } else if (item._clientDecisionApplied === true) {
            delta = (activeItemTotal(item, { ignoreExplicitTotal: true }) * currentFactor) - (originalTotal * originalFactor);
          } else if ((item._coChangeStatus || '') === 'unchanged') {
            delta = 0;
          } else if (item.total !== undefined && item.total !== null && item.total !== '') {
            delta = finiteNumber(item.total, 0) * currentFactor;
          } else {
            delta = (activeItemTotal(item, { ignoreExplicitTotal: true }) * currentFactor) - (originalTotal * originalFactor);
          }
        } else {
          delta = activeItemTotal(item) * currentFactor;
        }
        if (delta > 0) addedSubtotal += delta;
        if (delta < 0) creditSubtotal += Math.abs(delta);
      }
    }
    const itemNetSubtotal = addedSubtotal - creditSubtotal;
    const adjustment = quoteAdjustment(source, itemNetSubtotal);
    const netSubtotal = itemNetSubtotal + adjustment.amount;
    const tax = taxSettings(source, summary);
    const taxAmount = tax.enabled ? netSubtotal * tax.rate : 0;
    const netChange = netSubtotal + taxAmount;
    return {
      documentType: type,
      subtotal: rounded(itemNetSubtotal),
      adjustmentAmount: rounded(adjustment.amount),
      taxableSubtotal: rounded(netSubtotal),
      tax: rounded(taxAmount),
      total: rounded(netChange),
      documentTotal: rounded(netChange),
      parentTotal: rounded(parentTotal),
      previousApprovedTotal: rounded(previousApprovedTotal),
      updatedTotal: rounded(parentTotal + previousApprovedTotal + netChange),
      addedSubtotal: rounded(addedSubtotal),
      creditSubtotal: rounded(creditSubtotal),
      taxRate: tax.rate,
      taxLabel: tax.label,
      taxEnabled: tax.enabled,
    };
  }

  let subtotal = 0;
  for (const room of Array.isArray(source.rooms) ? source.rooms : []) {
    for (const item of Array.isArray(room && room.items) ? room.items : []) {
      subtotal += activeItemTotal(item) * lineMarkupFactor(room, item);
    }
  }
  const adjustment = quoteAdjustment(source, subtotal);
  const taxableSubtotal = subtotal + adjustment.amount;
  const tax = taxSettings(source, null);
  const taxAmount = tax.enabled ? taxableSubtotal * tax.rate : 0;
  const total = taxableSubtotal + taxAmount;
  return {
    documentType: type,
    subtotal: rounded(subtotal),
    adjustmentAmount: rounded(adjustment.amount),
    taxableSubtotal: rounded(taxableSubtotal),
    tax: rounded(taxAmount),
    total: rounded(total),
    documentTotal: rounded(total),
    taxRate: tax.rate,
    taxLabel: tax.label,
    taxEnabled: tax.enabled,
  };
}

function sanitizePhotoFields(source, output) {
  for (const key of ['photo', 'photoFull', 'image']) {
    if (source[key]) output[key] = sanitizeClientMediaUrl(source[key]);
  }
  for (const key of ['photos', 'photosFull', 'images']) {
    if (!Array.isArray(source[key])) continue;
    const values = source[key].slice(0, 20).map((value) => sanitizeClientMediaUrl(value));
    output[key] = key === 'photosFull' ? values.map((value) => value || null) : values.filter(Boolean);
  }
  return output;
}

function sanitizeUpgradeOption(source, factor) {
  source = isRecord(source) ? source : {};
  const output = {};
  for (const key of ['id', 'category', 'unitType', 'unit', 'description', 'itemDescription', 'pricingMode', 'upgradeType', 'type', 'mode', 'quantityMode']) {
    if (source[key] !== undefined) output[key] = cleanString(source[key], key === 'description' || key === 'itemDescription' ? 4000 : 500);
  }
  output.name = cleanString(source.name || source.sourceItemName || source.description, 500);
  for (const key of ['priceTbd', 'requiresConsultation']) {
    if (source[key] !== undefined) output[key] = source[key] === true;
  }
  for (const key of ['quantityMultiplier', 'quantityOverride', 'manualQuantity']) {
    if (source[key] !== undefined) output[key] = finiteNumber(source[key], 0);
  }
  if (source.quantity !== undefined) output.quantity = finiteNumber(source.quantity, 0);
  for (const key of ['availableAfterOptionIds', 'blockedByOptionIds', 'allowedBaseOptionIds', 'blockedByEnhancementOptionIds']) {
    if (Array.isArray(source[key])) output[key] = source[key].map(cleanId).filter(Boolean).slice(0, MAX_SELECTION_IDS);
  }
  for (const key of PRICE_KEYS) {
    if (source[key] !== undefined) output[key] = scaled(source[key], factor);
  }
  if (isRecord(source.upgrade)) output.upgrade = sanitizeUpgradeOption(source.upgrade, factor);
  if (Array.isArray(source.upgradeGroups)) output.upgradeGroups = sanitizeUpgradeGroups(source.upgradeGroups, factor);
  sanitizePhotoFields(source, output);
  return output;
}

function sanitizeUpgradeGroups(groups, factor) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    id: cleanId(group && group.id),
    name: cleanString(group && group.name, 500),
    note: cleanString(group && group.note, 4000),
    type: cleanString(group && group.type, 40),
    selectedOptionIds: Array.isArray(group && group.selectedOptionIds) ? group.selectedOptionIds.map(cleanId).filter(Boolean).slice(0, MAX_SELECTION_IDS) : [],
    options: (Array.isArray(group && group.options) ? group.options : []).map((option) => sanitizeUpgradeOption(option, factor))
  }));
}

function sanitizeChoiceGroup(group, factor) {
  if (!isRecord(group)) return null;
  return {
    id: cleanId(group.id),
    name: cleanString(group.name, 500),
    note: cleanString(group.note, 4000),
    type: cleanString(group.type, 40),
    defaultOptionId: cleanId(group.defaultOptionId),
    selectedOptionIds: Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds.map(cleanId).filter(Boolean).slice(0, MAX_SELECTION_IDS) : [],
    options: (Array.isArray(group.options) ? group.options : []).map((option) => sanitizeUpgradeOption(option, factor)),
    enhancementGroups: (Array.isArray(group.enhancementGroups) ? group.enhancementGroups : []).map((enhancement) => ({
      id: cleanId(enhancement && enhancement.id),
      name: cleanString(enhancement && enhancement.name, 500),
      note: cleanString(enhancement && enhancement.note, 4000),
      type: cleanString(enhancement && enhancement.type, 40),
      selectedOptionIds: Array.isArray(enhancement && enhancement.selectedOptionIds) ? enhancement.selectedOptionIds.map(cleanId).filter(Boolean).slice(0, MAX_SELECTION_IDS) : [],
      options: (Array.isArray(enhancement && enhancement.options) ? enhancement.options : []).map((option) => sanitizeUpgradeOption(option, factor))
    }))
  };
}

function sanitizeItem(source, room) {
  source = isRecord(source) ? source : {};
  const factor = lineMarkupFactor(room, source);
  const output = {};
  for (const key of ['id', 'name', 'label', 'description', 'serviceName', 'category', 'unitType', 'unit', 'notes', 'itemDescription', 'displayDescription', 'actualDescription', 'highlightColor', 'icon', 'text', 'pricingMode', '_coChangeStatus']) {
    if (source[key] !== undefined && ITEM_COPY_KEYS.has(key)) output[key] = cleanString(source[key], ['notes', 'itemDescription', 'displayDescription', 'actualDescription'].includes(key) ? 4000 : 500);
  }
  if (source.quantity !== undefined) output.quantity = finiteNumber(source.quantity, 0);
  if (source._baseQuantity !== undefined) output._baseQuantity = finiteNumber(source._baseQuantity, 0);
  for (const key of ['_baseUnitType', '_baseDescription', '_baseItemDescription']) {
    if (source[key] !== undefined) output[key] = cleanString(source[key], key === '_baseItemDescription' ? 4000 : 500);
  }
  for (const key of ['optional', 'optionalSelectedByDefault', '_optionalSelected', '_removed', 'upgraded', 'priceTbd', 'hasTbdSelections', 'requiresConsultation', '_coRemoved', '_clientDecisionApplied']) {
    if (source[key] !== undefined) output[key] = source[key] === true;
  }
  if (source._basePriceTbd !== undefined) output._basePriceTbd = source._basePriceTbd === true;
  if (Array.isArray(source.selectedUpgradeOptionIds)) output.selectedUpgradeOptionIds = source.selectedUpgradeOptionIds.map(cleanId).filter(Boolean).slice(0, MAX_SELECTION_IDS);
  for (const key of PRICE_KEYS) {
    if (source[key] !== undefined) output[key] = scaled(source[key], factor);
  }
  if (source.discountType !== undefined) output.discountType = cleanString(source.discountType, 30);
  if (source.discountLabel !== undefined) output.discountLabel = cleanString(source.discountLabel, 500);
  if (source.discountValue !== undefined) {
    output.discountValue = cleanString(source.discountType, 30).toLowerCase() === 'amount'
      ? scaled(source.discountValue, factor)
      : clone(source.discountValue);
  }
  if (isRecord(source.upgrade)) output.upgrade = sanitizeUpgradeOption(source.upgrade, factor);
  if (Array.isArray(source.upgradeGroups)) output.upgradeGroups = sanitizeUpgradeGroups(source.upgradeGroups, factor);
  if (isRecord(source.choiceGroup)) output.choiceGroup = sanitizeChoiceGroup(source.choiceGroup, factor);
  if (isRecord(source._coOriginal)) output._coOriginal = sanitizeUpgradeOption(source._coOriginal, lineMarkupFactor(room, source._coOriginal));
  if (isRecord(source.choiceGroupSelection)) {
    output.choiceGroupSelection = {};
    for (const key of ['groupId', 'groupName', 'optionId', 'optionName', 'type']) {
      if (source.choiceGroupSelection[key] !== undefined) output.choiceGroupSelection[key] = cleanString(source.choiceGroupSelection[key], 500);
    }
    if (source.choiceGroupSelection.replacedByEnhancement !== undefined) output.choiceGroupSelection.replacedByEnhancement = source.choiceGroupSelection.replacedByEnhancement === true;
  }
  if (isRecord(source.choiceGroupEnhancement)) {
    output.choiceGroupEnhancement = {};
    for (const key of ['groupId', 'groupName', 'enhancementGroupId', 'enhancementGroupName', 'optionId', 'optionName', 'upgradeType']) {
      if (source.choiceGroupEnhancement[key] !== undefined) output.choiceGroupEnhancement[key] = cleanString(source.choiceGroupEnhancement[key], 500);
    }
  }
  for (const key of ['_basePhoto', '_basePhotoFull']) {
    if (source[key]) output[key] = sanitizeClientMediaUrl(source[key]);
  }
  for (const key of ['_basePhotos', '_basePhotosFull']) {
    if (!Array.isArray(source[key])) continue;
    const values = source[key].slice(0, 20).map((value) => sanitizeClientMediaUrl(value));
    output[key] = key === '_basePhotosFull' ? values.map((value) => value || null) : values.filter(Boolean);
  }
  sanitizePhotoFields(source, output);
  return output;
}

function sanitizeRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : []).map((room) => {
    room = isRecord(room) ? room : {};
    const output = {};
    for (const key of ['id', 'name', 'icon', 'customColor', 'scopeNotes', '_coOriginalRoomName']) {
      if (room[key] !== undefined) output[key] = cleanString(room[key], key === 'scopeNotes' ? 8000 : 500);
    }
    if (room.colorIndex !== undefined) output.colorIndex = finiteNumber(room.colorIndex, 0);
    if (room.colorIntensity !== undefined) output.colorIntensity = finiteNumber(room.colorIntensity, 100);
    if (Array.isArray(room.categoryOrder)) output.categoryOrder = room.categoryOrder.map((value) => cleanString(value, 200)).filter(Boolean).slice(0, 300);
    output.items = (Array.isArray(room.items) ? room.items : []).map((item) => sanitizeItem(item, room));
    if (Array.isArray(room.photos)) output.photos = room.photos.map(sanitizeClientMediaUrl).filter(Boolean).slice(0, 50);
    return output;
  });
}

export function sanitizeClientDocumentStyle(style) {
  if (!isRecord(style)) return {};
  const output = {};
  const numericKeys = new Set([
    'accentStrength', 'optionAccentStrength', 'bgOpacity', 'headerOpacity',
    'depositPercent', 'depositFixedCents', 'descriptionPreviewLength', 'scopePreviewLength'
  ]);
  const booleanKeys = new Set(['showUpgrades', 'showScopeNotes', 'alwaysShowFullDescriptions', 'showCommitment']);
  for (const key of STYLE_SAFE_KEYS) {
    if (style[key] === undefined) continue;
    if (numericKeys.has(key)) output[key] = finiteNumber(style[key], 0);
    else if (booleanKeys.has(key)) output[key] = style[key] === true;
    else output[key] = cleanString(style[key], key === 'clientMessage' ? 4000 : 200);
  }
  if (isRecord(style.commitment)) {
    output.commitment = {
      title: cleanString(style.commitment.title, 500),
      items: (Array.isArray(style.commitment.items) ? style.commitment.items : []).map((item) => ({
        icon: cleanString(item && item.icon, 200),
        image: sanitizeClientMediaUrl(item && item.image),
        label: cleanString(item && item.label, 500),
        text: cleanString(item && item.text, 2000),
      })).slice(0, 20)
    };
  }
  return output;
}

export function sanitizeClientBusinessProfile(profile) {
  if (!isRecord(profile)) return {};
  const output = {};
  for (const key of PUBLIC_BUSINESS_KEYS) {
    if (profile[key] === undefined) continue;
    if (key === 'hidden_profile_fields' || key === 'hiddenProfileFields') {
      output[key] = Array.isArray(profile[key]) ? profile[key].map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 40) : [];
    } else if (key === 'website' || key === 'url') {
      const url = sanitizeClientMediaUrl(profile[key]);
      if (url) output[key] = url;
    } else {
      output[key] = cleanString(profile[key], 1000);
    }
  }
  return output;
}

function sanitizeCategoryStyles(styles) {
  if (!isRecord(styles)) return {};
  const output = {};
  for (const [category, style] of Object.entries(styles).slice(0, 300)) {
    if (!isRecord(style)) continue;
    output[cleanString(category, 200)] = {
      icon: cleanString(style.icon, 200),
      color: cleanString(style.color, 40),
    };
  }
  return output;
}

function sanitizeInvoiceSettings(settings) {
  if (!isRecord(settings)) return {};
  const output = {};
  for (const key of ['title', 'note', 'paymentTerms', 'showDescriptions', 'showRoomTotals', 'showTerms', 'showPaymentOptions']) {
    if (settings[key] !== undefined) output[key] = typeof settings[key] === 'string' ? cleanString(settings[key], 4000) : settings[key] === true;
  }
  return output;
}

function sanitizeChangeOrderSummary(summary) {
  if (!isRecord(summary)) return {};
  const output = {};
  for (const key of [
    'originalTotal', 'previousApprovedTotal', 'addedSubtotal', 'creditSubtotal',
    'netSubtotal', 'tax', 'netChange', 'updatedTotal', 'taxRate'
  ]) {
    if (summary[key] !== undefined) output[key] = finiteNumber(summary[key], 0);
  }
  if (summary.taxLabel !== undefined) output.taxLabel = cleanString(summary.taxLabel, 40);
  if (summary.taxEnabled !== undefined) output.taxEnabled = summary.taxEnabled !== false;
  if (summary.symbol !== undefined) output.symbol = cleanString(summary.symbol, 10);
  return output;
}

function sanitizeRoomNotes(notes) {
  if (!isRecord(notes)) return {};
  const output = {};
  for (const [key, value] of Object.entries(notes).slice(0, MAX_ROOM_NOTES)) {
    if (!/^\d+$/.test(key)) continue;
    const clean = cleanString(value, MAX_NOTE_LENGTH);
    if (clean) output[String(Number(key))] = clean;
  }
  return output;
}

function sanitizePaymentSummary(payment) {
  if (!isRecord(payment)) return null;
  const output = {};
  for (const key of ['name', 'label', 'type', 'status', 'currency', 'paid_at', 'paidAt', 'created_at', 'createdAt']) {
    if (payment[key] !== undefined) output[key] = cleanString(payment[key], 200);
  }
  for (const key of ['amount', 'value', 'amount_cents', 'amountCents', 'paid_cents', 'paidCents']) {
    if (payment[key] !== undefined) output[key] = finiteNumber(payment[key], 0);
  }
  return output;
}

function sanitizePaymentTerms(terms) {
  if (!isRecord(terms)) return null;
  const output = {};
  if (terms.version !== undefined) output.version = finiteNumber(terms.version, 0);
  if (terms.deposit_required !== undefined) output.deposit_required = terms.deposit_required === true;
  for (const key of ['kind', 'currency', 'due']) if (terms[key] !== undefined) output[key] = cleanString(terms[key], 80);
  if (terms.percent !== undefined) output.percent = finiteNumber(terms.percent, 0);
  if (terms.fixed_cents !== undefined) output.fixed_cents = finiteNumber(terms.fixed_cents, 0);
  return output;
}

function sanitizeQuoteAdjustment(data, totals) {
  const source = isRecord(data.quoteAdjustment) ? data.quoteAdjustment : (isRecord(data.clientAdjustment) ? data.clientAdjustment : null);
  if (!source) return null;
  const calculation = quoteAdjustment(data, totals.subtotal);
  return {
    name: calculation.type === 'discount' ? 'Discount' : 'Adjustment',
    type: calculation.type,
    basis: 'amount',
    amount: Math.abs(calculation.amount),
  };
}

export function projectClientDocumentData(data, options = {}) {
  let source = isRecord(data) ? clone(data) : {};
  if (isRecord(source._clientDecision)) {
    try {
      source = applyClientDocumentDecision(source, source._clientDecision, { applySelections: true }).data;
    } catch (_) {
      // Historical malformed overlays are ignored instead of weakening the projection.
    }
  }
  const totals = calculateClientDocumentTotals(source, options);
  const output = {};
  for (const key of ROOT_SAFE_KEYS) {
    if (source[key] === undefined) continue;
    if ((isRecord(source[key]) || Array.isArray(source[key])) && !ROOT_COMPLEX_KEYS.has(key)) continue;
    output[key] = clone(source[key]);
  }
  output.rooms = sanitizeRooms(source.rooms);
  if (Array.isArray(source.original_rooms)) output.original_rooms = sanitizeRooms(source.original_rooms);
  if (isRecord(source.style)) output.style = sanitizeClientDocumentStyle(source.style);
  if (isRecord(source.businessProfile)) output.businessProfile = sanitizeClientBusinessProfile(source.businessProfile);
  if (source.businessLogo) output.businessLogo = sanitizeClientMediaUrl(source.businessLogo);
  if (Array.isArray(source.hiddenProfileFields)) output.hiddenProfileFields = source.hiddenProfileFields.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 40);
  if (Array.isArray(source.hidden_profile_fields)) output.hidden_profile_fields = source.hidden_profile_fields.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 40);
  if (isRecord(source.categoryStyles)) output.categoryStyles = sanitizeCategoryStyles(source.categoryStyles);
  if (isRecord(source.invoiceSettings)) output.invoiceSettings = sanitizeInvoiceSettings(source.invoiceSettings);
  if (isRecord(source.changeOrderPriceSummary)) output.changeOrderPriceSummary = sanitizeChangeOrderSummary(source.changeOrderPriceSummary);
  else delete output.changeOrderPriceSummary;
  if (isRecord(source.quoteDividerLabels)) {
    output.quoteDividerLabels = {
      singular: cleanString(source.quoteDividerLabels.singular, 80),
      plural: cleanString(source.quoteDividerLabels.plural, 80),
    };
  } else delete output.quoteDividerLabels;
  if (Array.isArray(source.terms)) output.terms = source.terms.map((term) => cleanString(term, 4000)).filter(Boolean).slice(0, 100);
  else delete output.terms;
  if (Array.isArray(source.terms_accepted_snapshot)) output.terms_accepted_snapshot = source.terms_accepted_snapshot.map((term) => cleanString(term, 4000)).filter(Boolean).slice(0, 100);
  else delete output.terms_accepted_snapshot;
  if (isRecord(source._roomNotes)) output._roomNotes = sanitizeRoomNotes(source._roomNotes);
  else delete output._roomNotes;
  const adjustment = sanitizeQuoteAdjustment(source, totals);
  if (adjustment) output.quoteAdjustment = adjustment;
  if (isRecord(source.paymentsReceived)) output.paymentsReceived = sanitizePaymentSummary(source.paymentsReceived);
  if (isRecord(source.paymentReceived)) output.paymentReceived = sanitizePaymentSummary(source.paymentReceived);
  if (Array.isArray(source.payments)) output.payments = source.payments.map(sanitizePaymentSummary).filter(Boolean).slice(0, 100);
  const paymentTerms = sanitizePaymentTerms(source.payment_terms || source.paymentTerms);
  if (paymentTerms) output.payment_terms = paymentTerms;
  if (source.signature_url) output.signature_url = sanitizeClientMediaUrl(source.signature_url);
  if (source.signature_data_url) output.signature_data_url = sanitizeClientMediaUrl(source.signature_data_url);
  output.subtotal = totals.subtotal;
  output.taxRate = totals.taxRate;
  output.taxLabel = totals.taxLabel;
  output.taxEnabled = totals.taxEnabled;
  output.taxAmount = totals.tax;
  output.grandTotal = totals.documentTotal;
  output.total = totals.documentTotal;
  if (totals.documentType === 'change_order') {
    output.parentQuoteTotal = totals.parentTotal;
    output.changeOrderPreviousApprovedTotal = totals.previousApprovedTotal;
    output.changeOrderPriceSummary = {
      ...(isRecord(output.changeOrderPriceSummary) ? output.changeOrderPriceSummary : {}),
      originalTotal: totals.parentTotal,
      previousApprovedTotal: totals.previousApprovedTotal,
      addedSubtotal: totals.addedSubtotal,
      creditSubtotal: totals.creditSubtotal,
      netSubtotal: totals.taxableSubtotal,
      tax: totals.tax,
      netChange: totals.documentTotal,
      updatedTotal: totals.updatedTotal,
      taxLabel: totals.taxLabel,
      taxRate: totals.taxRate,
      taxEnabled: totals.taxEnabled,
    };
  }
  return output;
}

export function sanitizeClientDocumentRow(row, options = {}) {
  row = isRecord(row) ? row : {};
  const data = projectClientDocumentData(row.data, { ...options, documentType: row.type });
  return {
    id: cleanId(row.id),
    quote_number: cleanString(row.quote_number, 200),
    client_name: cleanString(row.client_name, 500),
    status: cleanString(row.status, 80),
    type: cleanString(row.type || (row.data && (row.data.documentType || row.data.type)) || 'quote', 80),
    parent_quote_id: row.parent_quote_id ? cleanId(row.parent_quote_id) : null,
    change_order_number: row.change_order_number === undefined || row.change_order_number === null ? null : finiteNumber(row.change_order_number, 0),
    total: finiteNumber(data.grandTotal ?? data.total, 0),
    data,
    created_at: row.created_at ? cleanString(row.created_at, 100) : null,
    updated_at: row.updated_at ? cleanString(row.updated_at, 100) : null,
    viewed_at: row.viewed_at ? cleanString(row.viewed_at, 100) : null,
    accepted_at: row.accepted_at ? cleanString(row.accepted_at, 100) : null,
    accepted_by: row.accepted_by ? cleanString(row.accepted_by, 200) : null,
  };
}

export class ClientDocumentDecisionError extends Error {
  constructor(message, code = 'invalid_client_decision') {
    super(message);
    this.name = 'ClientDocumentDecisionError';
    this.code = code;
  }
}

function assertRecord(value, label) {
  if (!isRecord(value)) throw new ClientDocumentDecisionError(`${label} must be an object`);
  return value;
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ClientDocumentDecisionError(`Unsupported ${label} field: ${key}`, 'unsupported_client_decision_field');
  }
}

function decisionIds(values, label) {
  if (!Array.isArray(values)) throw new ClientDocumentDecisionError(`${label} must be an array`);
  if (values.length > MAX_SELECTION_IDS) throw new ClientDocumentDecisionError(`${label} has too many selections`);
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const id = cleanId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length > MAX_SELECTION_IDS) throw new ClientDocumentDecisionError(`${label} has too many selections`);
  }
  return output;
}

function normalizeGroupDecision(value, label, allowManual) {
  value = assertRecord(value, label);
  const allowed = new Set(['groupId', 'selectedOptionIds']);
  if (allowManual) allowed.add('manualQuantities');
  assertAllowedKeys(value, allowed, label);
  const output = {
    groupId: cleanId(value.groupId),
    selectedOptionIds: decisionIds(value.selectedOptionIds || [], `${label}.selectedOptionIds`),
  };
  if (allowManual) {
    if (value.manualQuantities !== undefined && !Array.isArray(value.manualQuantities)) {
      throw new ClientDocumentDecisionError(`${label}.manualQuantities must be an array`);
    }
    if ((value.manualQuantities || []).length > MAX_SELECTION_IDS) {
      throw new ClientDocumentDecisionError(`${label}.manualQuantities has too many entries`);
    }
    output.manualQuantities = (value.manualQuantities || []).map((entry, index) => {
      entry = assertRecord(entry, `${label}.manualQuantities[${index}]`);
      assertAllowedKeys(entry, new Set(['optionId', 'quantity']), `${label}.manualQuantities[${index}]`);
      const quantity = finiteNumber(entry.quantity, Number.NaN);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
        throw new ClientDocumentDecisionError(`${label}.manualQuantities[${index}] is invalid`);
      }
      return { optionId: cleanId(entry.optionId), quantity };
    }).filter((entry) => entry.optionId).slice(0, MAX_SELECTION_IDS);
    const selectedIds = new Set(output.selectedOptionIds);
    const manualIds = new Set();
    for (const entry of output.manualQuantities) {
      if (!selectedIds.has(entry.optionId)) throw new ClientDocumentDecisionError(`${label}.manualQuantities may only describe selected options`);
      if (manualIds.has(entry.optionId)) throw new ClientDocumentDecisionError(`${label}.manualQuantities contains a duplicate option`);
      manualIds.add(entry.optionId);
    }
  }
  return output;
}

function normalizeItemDecision(value, index) {
  value = assertRecord(value, `items[${index}]`);
  assertAllowedKeys(value, new Set([
    'roomIndex', 'itemIndex', 'roomId', 'itemId', 'optionalSelected',
    'legacyUpgradeSelected', 'choice', 'upgradeGroups'
  ]), `items[${index}]`);
  const roomIndex = Number(value.roomIndex);
  const itemIndex = Number(value.itemIndex);
  if (!Number.isInteger(roomIndex) || roomIndex < 0 || roomIndex > 9999 || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex > 9999) {
    throw new ClientDocumentDecisionError(`items[${index}] has invalid indexes`);
  }
  const output = { roomIndex, itemIndex };
  if (value.roomId !== undefined) output.roomId = cleanId(value.roomId);
  if (value.itemId !== undefined) output.itemId = cleanId(value.itemId);
  if (value.optionalSelected !== undefined) {
    if (typeof value.optionalSelected !== 'boolean') throw new ClientDocumentDecisionError(`items[${index}].optionalSelected must be boolean`);
    output.optionalSelected = value.optionalSelected;
  }
  if (value.legacyUpgradeSelected !== undefined) {
    if (typeof value.legacyUpgradeSelected !== 'boolean') throw new ClientDocumentDecisionError(`items[${index}].legacyUpgradeSelected must be boolean`);
    output.legacyUpgradeSelected = value.legacyUpgradeSelected;
  }
  if (value.choice !== undefined) {
    const choice = assertRecord(value.choice, `items[${index}].choice`);
    assertAllowedKeys(choice, new Set(['groupId', 'selectedOptionIds', 'enhancementGroups']), `items[${index}].choice`);
    if (choice.enhancementGroups !== undefined && !Array.isArray(choice.enhancementGroups)) {
      throw new ClientDocumentDecisionError(`items[${index}].choice.enhancementGroups must be an array`);
    }
    if ((choice.enhancementGroups || []).length > MAX_DECISION_GROUPS) {
      throw new ClientDocumentDecisionError(`items[${index}].choice.enhancementGroups has too many entries`);
    }
    output.choice = {
      groupId: cleanId(choice.groupId),
      selectedOptionIds: decisionIds(choice.selectedOptionIds || [], `items[${index}].choice.selectedOptionIds`),
      enhancementGroups: (choice.enhancementGroups || []).map((group, groupIndex) => normalizeGroupDecision(group, `items[${index}].choice.enhancementGroups[${groupIndex}]`, false))
    };
  }
  if (value.upgradeGroups !== undefined) {
    if (!Array.isArray(value.upgradeGroups)) throw new ClientDocumentDecisionError(`items[${index}].upgradeGroups must be an array`);
    if (value.upgradeGroups.length > MAX_DECISION_GROUPS) throw new ClientDocumentDecisionError(`items[${index}].upgradeGroups has too many entries`);
    output.upgradeGroups = value.upgradeGroups.map((group, groupIndex) => normalizeGroupDecision(group, `items[${index}].upgradeGroups[${groupIndex}]`, true));
  }
  return output;
}

function normalizeSignature(value) {
  value = assertRecord(value, 'signature');
  assertAllowedKeys(value, new Set(['method', 'signerName', 'evidenceUrl', 'evidenceDataUrl', 'termsAccepted']), 'signature');
  const method = cleanString(value.method, 40).toLowerCase();
  const signerName = cleanString(value.signerName, 200);
  if (method !== 'typed') throw new ClientDocumentDecisionError('Typed signature evidence is required');
  if (value.termsAccepted !== true) throw new ClientDocumentDecisionError('Terms agreement is required before signing');
  if (String(value.evidenceUrl || '').length > 8000) throw new ClientDocumentDecisionError('Signature URL is too long');
  if (String(value.evidenceDataUrl || '').length > MAX_SIGNATURE_DATA_URL) throw new ClientDocumentDecisionError('Signature image data is too large');
  const rawEvidenceUrl = cleanString(value.evidenceUrl, 8000);
  const evidenceUrl = rawEvidenceUrl ? sanitizeClientMediaUrl(rawEvidenceUrl) : '';
  const evidenceDataUrl = cleanString(value.evidenceDataUrl, MAX_SIGNATURE_DATA_URL);
  if (rawEvidenceUrl && !evidenceUrl) throw new ClientDocumentDecisionError('Signature URL is invalid');
  if (!evidenceUrl && !evidenceDataUrl) throw new ClientDocumentDecisionError('Typed signature evidence is missing');
  if (evidenceDataUrl && !/^data:image\/png;base64,/i.test(evidenceDataUrl)) throw new ClientDocumentDecisionError('Signature image data is invalid');
  if (evidenceDataUrl && !/^[A-Za-z0-9+/]+={0,2}$/.test(evidenceDataUrl.replace(/^data:image\/png;base64,/i, ''))) {
    throw new ClientDocumentDecisionError('Signature image data is invalid');
  }
  return { method, signerName, evidenceUrl, evidenceDataUrl, termsAccepted: true };
}

export function normalizeClientDocumentDecision(value) {
  value = assertRecord(value, 'decision');
  assertAllowedKeys(value, new Set(['status', 'items', 'roomNotes', 'signature']), 'decision');
  const output = {};
  if (value.status !== undefined) {
    const status = cleanString(value.status, 40).toLowerCase();
    if (!['accepted', 'approved'].includes(status)) throw new ClientDocumentDecisionError('Unsupported client document status');
    output.status = status;
  }
  if (value.items !== undefined && !Array.isArray(value.items)) throw new ClientDocumentDecisionError('decision.items must be an array');
  if ((value.items || []).length > MAX_DECISION_ITEMS) throw new ClientDocumentDecisionError('decision.items has too many entries');
  output.items = (value.items || []).map(normalizeItemDecision);
  const targets = new Set();
  for (const item of output.items) {
    const target = `${item.roomIndex}:${item.itemIndex}`;
    if (targets.has(target)) throw new ClientDocumentDecisionError('decision.items contains a duplicate target');
    targets.add(target);
  }
  if (value.roomNotes !== undefined) {
    const notes = assertRecord(value.roomNotes, 'decision.roomNotes');
    output.roomNotes = {};
    const entries = Object.entries(notes);
    if (entries.length > MAX_ROOM_NOTES) throw new ClientDocumentDecisionError('decision.roomNotes has too many entries');
    for (const [key, note] of entries) {
      if (!/^\d+$/.test(key) || Number(key) > 9999) throw new ClientDocumentDecisionError('decision.roomNotes contains an invalid room index');
      if (typeof note !== 'string') throw new ClientDocumentDecisionError('decision.roomNotes values must be strings');
      const clean = cleanString(note, MAX_NOTE_LENGTH);
      if (clean) output.roomNotes[String(Number(key))] = clean;
    }
  }
  if (value.signature !== undefined) output.signature = normalizeSignature(value.signature);
  return output;
}

function groupIdentity(group, groupIndex, prefix) {
  return cleanId(group && group.id) || `${prefix}_${groupIndex}`;
}

function optionIdentity(option, groupIndex, optionIndex, prefix) {
  return cleanId(option && option.id) || `${prefix}_${groupIndex}_${optionIndex}`;
}

function validateAndSetGroup(group, groupDecision, groupIndex, prefix, optionPrefix) {
  const id = groupIdentity(group, groupIndex, prefix);
  if (groupDecision.groupId && groupDecision.groupId !== id) throw new ClientDocumentDecisionError('A selected option group is stale');
  const options = Array.isArray(group && group.options) ? group.options : [];
  const optionById = new Map(options.map((option, optionIndex) => [optionIdentity(option, groupIndex, optionIndex, optionPrefix), option]));
  for (const selectedId of groupDecision.selectedOptionIds) {
    if (!optionById.has(selectedId)) throw new ClientDocumentDecisionError('A selected option is unavailable');
  }
  if (group && group.type !== 'multiple' && groupDecision.selectedOptionIds.length > 1) {
    throw new ClientDocumentDecisionError('Only one option may be selected in this group');
  }
  group.selectedOptionIds = groupDecision.selectedOptionIds.slice();
  for (const manual of groupDecision.manualQuantities || []) {
    const option = optionById.get(manual.optionId);
    if (!option) throw new ClientDocumentDecisionError('A manual quantity option is unavailable');
    const mode = cleanString(option.quantityMode, 40).toLowerCase().replace(/[\s-]+/g, '_');
    if (mode !== 'manual' && mode !== 'enter_on_quote' && mode !== 'quote_quantity') {
      throw new ClientDocumentDecisionError('A quantity was submitted for an option that does not allow it');
    }
    option.manualQuantity = manual.quantity;
  }
}

function assertChoiceCompatibility(choiceGroup) {
  const baseIds = new Set(selectedOptions(choiceGroup, true).map((option) => cleanId(option.id)));
  const selectedIds = [];
  for (const group of Array.isArray(choiceGroup.enhancementGroups) ? choiceGroup.enhancementGroups : []) {
    for (const id of Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds : []) selectedIds.push(cleanId(id));
  }
  for (const group of Array.isArray(choiceGroup.enhancementGroups) ? choiceGroup.enhancementGroups : []) {
    for (const option of selectedOptions(group, false)) {
      const id = cleanId(option.id);
      const allowedBase = Array.isArray(option.allowedBaseOptionIds) ? option.allowedBaseOptionIds.map(cleanId).filter(Boolean) : [];
      const blocked = Array.isArray(option.blockedByEnhancementOptionIds) ? option.blockedByEnhancementOptionIds.map(cleanId).filter(Boolean) : [];
      if (allowedBase.length && !allowedBase.some((allowed) => baseIds.has(allowed))) throw new ClientDocumentDecisionError('An enhancement is unavailable for the selected base option');
      if (blocked.some((blockedId) => selectedIds.some((selectedId) => selectedId !== id && selectedId === blockedId))) {
        throw new ClientDocumentDecisionError('Two incompatible enhancements were selected');
      }
    }
  }
}

function assertUpgradeCompatibility(groups) {
  const selectedIds = [];
  for (const group of groups) {
    for (const id of Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds : []) selectedIds.push(cleanId(id));
  }
  for (const group of groups) {
    for (const option of selectedOptions(group, false)) {
      const id = cleanId(option.id);
      const otherIds = selectedIds.filter((selectedId) => selectedId !== id);
      const required = Array.isArray(option.availableAfterOptionIds) ? option.availableAfterOptionIds.map(cleanId).filter(Boolean) : [];
      const blocked = Array.isArray(option.blockedByOptionIds) ? option.blockedByOptionIds.map(cleanId).filter(Boolean) : [];
      if (required.length && !required.some((requiredId) => otherIds.includes(requiredId))) throw new ClientDocumentDecisionError('An upgrade prerequisite is not selected');
      if (blocked.some((blockedId) => otherIds.includes(blockedId))) throw new ClientDocumentDecisionError('Two incompatible upgrades were selected');
    }
  }
}

function selectionFingerprint(item) {
  const selectedBase = isRecord(item && item.choiceGroup) ? selectedOptions(item.choiceGroup, true)[0] : null;
  const activeGroups = effectiveUpgradeGroups(item, selectedBase);
  return JSON.stringify({
    optionalSelected: item && item._optionalSelected,
    removed: item && item._removed,
    upgraded: item && item.upgraded,
    choice: item && item.choiceGroup && {
      selectedOptionIds: item.choiceGroup.selectedOptionIds,
      enhancementGroups: (item.choiceGroup.enhancementGroups || []).map((group) => ({ id: group.id, selectedOptionIds: group.selectedOptionIds }))
    },
    upgradeGroups: activeGroups.map((group) => ({
      id: group.id,
      selectedOptionIds: group.selectedOptionIds,
      quantities: (group.options || []).map((option) => ({ id: option.id, manualQuantity: option.manualQuantity }))
    }))
  });
}

function applyItemDecision(data, decision) {
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  const room = rooms[decision.roomIndex];
  const item = room && Array.isArray(room.items) ? room.items[decision.itemIndex] : null;
  if (!room || !item) throw new ClientDocumentDecisionError('A selected quote item is no longer available', 'stale_client_decision');
  if (decision.roomId && cleanId(room.id) !== decision.roomId) throw new ClientDocumentDecisionError('A selected room is stale', 'stale_client_decision');
  if (decision.itemId && cleanId(item.id) !== decision.itemId) throw new ClientDocumentDecisionError('A selected item is stale', 'stale_client_decision');
  const before = selectionFingerprint(item);

  if (decision.optionalSelected !== undefined) {
    if (item.optional !== true) throw new ClientDocumentDecisionError('Only optional items may be added or removed');
    item._optionalSelected = decision.optionalSelected;
    item._removed = !decision.optionalSelected;
  }
  if (decision.legacyUpgradeSelected !== undefined) {
    if (!isRecord(item.upgrade)) throw new ClientDocumentDecisionError('A selected legacy upgrade is unavailable');
    item.upgraded = decision.legacyUpgradeSelected;
  }
  if (decision.choice) {
    const group = item.choiceGroup;
    if (!isRecord(group)) throw new ClientDocumentDecisionError('A selected choice group is unavailable');
    if (decision.choice.groupId && cleanId(group.id) !== decision.choice.groupId) throw new ClientDocumentDecisionError('A selected choice group is stale', 'stale_client_decision');
    const optionIds = new Set((Array.isArray(group.options) ? group.options : []).map((option) => cleanId(option && option.id)).filter(Boolean));
    for (const id of decision.choice.selectedOptionIds) {
      if (!optionIds.has(id)) throw new ClientDocumentDecisionError('A selected choice is unavailable');
    }
    if (group.type !== 'multiple' && decision.choice.selectedOptionIds.length > 1) throw new ClientDocumentDecisionError('Only one base choice may be selected');
    if (group.type === 'single' && decision.choice.selectedOptionIds.length !== 1) throw new ClientDocumentDecisionError('A base choice is required');
    group.selectedOptionIds = decision.choice.selectedOptionIds.slice();
    const enhancementGroups = Array.isArray(group.enhancementGroups) ? group.enhancementGroups : [];
    for (const enhancementDecision of decision.choice.enhancementGroups) {
      const groupIndex = enhancementGroups.findIndex((candidate, index) => groupIdentity(candidate, index, 'viewer_enh') === enhancementDecision.groupId);
      if (groupIndex === -1) throw new ClientDocumentDecisionError('A selected enhancement group is stale', 'stale_client_decision');
      validateAndSetGroup(enhancementGroups[groupIndex], enhancementDecision, groupIndex, 'viewer_enh', 'viewer_enh');
    }
    assertChoiceCompatibility(group);
  }

  if (decision.upgradeGroups) {
    const selectedBase = isRecord(item.choiceGroup) ? selectedOptions(item.choiceGroup, true)[0] : null;
    const sources = [];
    if (Array.isArray(item.upgradeGroups)) sources.push(item.upgradeGroups);
    if (selectedBase && Array.isArray(selectedBase.upgradeGroups) && selectedBase.upgradeGroups !== item.upgradeGroups) sources.push(selectedBase.upgradeGroups);
    for (const groupDecision of decision.upgradeGroups) {
      let matched = false;
      for (const groups of sources) {
        const groupIndex = groups.findIndex((candidate, index) => groupIdentity(candidate, index, 'viewer_upg') === groupDecision.groupId);
        if (groupIndex === -1) continue;
        validateAndSetGroup(groups[groupIndex], groupDecision, groupIndex, 'viewer_upg', 'viewer_upo');
        matched = true;
      }
      if (!matched) throw new ClientDocumentDecisionError('A selected upgrade group is stale', 'stale_client_decision');
    }
    const activeGroups = selectedBase && Array.isArray(selectedBase.upgradeGroups) ? selectedBase.upgradeGroups : (Array.isArray(item.upgradeGroups) ? item.upgradeGroups : []);
    assertUpgradeCompatibility(activeGroups);
    item.selectedUpgradeOptionIds = activeGroups.flatMap((group) => Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds.map(cleanId).filter(Boolean) : []);
  }

  const changed = before !== selectionFingerprint(item);
  if (changed) item._clientDecisionApplied = true;
  return changed;
}

function selectionSummaries(data) {
  const summaries = {
    upgrades: [], removals: [], optionalSelections: [], choiceGroups: [],
    enhancements: [], itemUpgradeSelections: [], consultationRequests: []
  };
  for (const room of Array.isArray(data.rooms) ? data.rooms : []) {
    for (const item of Array.isArray(room && room.items) ? room.items : []) {
      const factor = lineMarkupFactor(room, item);
      if (item.optional === true) {
        summaries.optionalSelections.push({ room: cleanString(room.name, 500), item: cleanString(item.description || item.name, 500), selected: item._removed !== true });
      }
      if (item._removed === true) summaries.removals.push({ room: cleanString(room.name, 500), item: cleanString(item.description || item.name, 500) });
      if (item.upgraded === true && isRecord(item.upgrade)) {
        summaries.upgrades.push({
          room: cleanString(room.name, 500),
          from: cleanString(item.description || item.name, 500),
          to: cleanString(item.upgrade.name || item.upgrade.description, 500),
          total: rounded(activeItemTotal(item) * factor)
        });
      }
      if (isRecord(item.choiceGroup)) {
        for (const option of selectedOptions(item.choiceGroup, true)) {
          summaries.choiceGroups.push({
            room: cleanString(room.name, 500), group: cleanString(item.choiceGroup.name, 500),
            option: cleanString(option.name || option.description, 500), type: cleanString(item.choiceGroup.type, 40),
            total: rounded(optionQuantity(finiteNumber(item.quantity, 0), option) * finiteNumber(option.rate, 0) * factor)
          });
        }
        for (const option of selectedEnhancements(item.choiceGroup)) {
          summaries.enhancements.push({
            room: cleanString(room.name, 500), group: cleanString(item.choiceGroup.name, 500),
            option: cleanString(option.name || option.description, 500), upgradeType: normalizeUpgradeType(option.upgradeType),
            total: rounded(optionQuantity(finiteNumber(item.quantity, 0), option) * finiteNumber(option.rate, 0) * factor)
          });
        }
      }
      const selectedBase = isRecord(item.choiceGroup) ? selectedOptions(item.choiceGroup, true)[0] : null;
      const groups = effectiveUpgradeGroups(item, selectedBase);
      for (const option of selectedUpgradeOptions(groups)) {
        const summary = {
          room: cleanString(room.name, 500), item: cleanString(item.description || item.name, 500),
          option: cleanString(option.name || option.description, 500), upgradeType: normalizeUpgradeType(option.upgradeType),
          requiresConsultation: normalizeUpgradeType(option.upgradeType || option.type) === 'consultation',
          total: rounded(optionQuantity(finiteNumber(item.quantity, 0), option) * finiteNumber(option.rate, 0) * factor)
        };
        summaries.itemUpgradeSelections.push(summary);
        if (summary.requiresConsultation) summaries.consultationRequests.push(summary);
      }
    }
  }
  return summaries;
}

export function applyClientDocumentDecision(existingData, rawDecision, options = {}) {
  const decision = normalizeClientDocumentDecision(rawDecision);
  const selectedData = clone(isRecord(existingData) ? existingData : {});
  let changed = false;
  for (const itemDecision of decision.items) changed = applyItemDecision(selectedData, itemDecision) || changed;
  const summaries = selectionSummaries(selectedData);
  const data = options.applySelections === false ? clone(isRecord(existingData) ? existingData : {}) : selectedData;
  if (decision.roomNotes !== undefined) data._roomNotes = clone(decision.roomNotes);
  return { data, decision, changed, summaries, selectedData };
}

export function clientDecisionForStorage(decision) {
  const normalized = normalizeClientDocumentDecision(decision);
  return {
    items: clone(normalized.items),
    roomNotes: clone(normalized.roomNotes || {}),
  };
}
