const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const propertyMemory = fs.readFileSync(path.join(root, 'property-memory.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
const clients = fs.readFileSync(path.join(root, 'quote-clients.js'), 'utf8');

assert(builder.includes('id="propertyMemoryBtn"'), 'the quote address needs a Property Memory entry point');
assert(builder.includes('id="propertyMemorySavedBadge"'), 'the address entry needs a saved-data badge');
assert(builder.includes('aria-haspopup="dialog"') && builder.includes('aria-live="polite"'), 'the entry point should expose accessible dialog and status semantics');
assert(builder.includes('property-memory.js?v=2026080301'), 'the Quote Builder should load the property-memory module');
assert(builder.includes('@media (max-width: 767.98px)') && builder.includes('.property-memory-contact-grid'), 'property contacts should reflow on mobile');

[
  'General site notes',
  'Access and logistics',
  'Known conditions',
  'Measurements and references',
  'Property contacts',
  'Work history',
  'Optional markup rule'
].forEach(label => assert(propertyMemory.includes(label), `missing structured Property Memory section: ${label}`));

[
  'propertyParking',
  'propertyEntryCode',
  'propertyStairsElevator',
  'propertyRestrictedHours',
  'propertyLoadingDumpster',
  'propertyOlderConstruction',
  'propertyWiring',
  'propertyPlasterMasonry',
  'propertyFragileFinishes',
  'propertyHazards',
  'propertyHiddenConditions',
  'propertyMeasurements',
  'propertyAttachmentReferences',
  'propertyManagerName',
  'propertyTenantName',
  'propertySuperintendentName',
  'propertyWorkHistory'
].forEach(id => assert(propertyMemory.includes(`id="${id}"`), `missing Property Memory field: ${id}`));

assert(propertyMemory.includes("PROPERTY_MEMORY_KEY_PREFIX = 'property_memory:'"), 'property records should use a dedicated user_data namespace');
assert(propertyMemory.includes(".from('user_data')"), 'property records should use the existing authenticated user_data model');
assert(propertyMemory.includes("entityType: 'user_data'"), 'property saves should use the established durable user_data adapter');
assert(!propertyMemory.includes("client_preferences"), 'property records must remain separate from personal client preferences');
assert(propertyMemory.includes('normalizePropertyAddress'), 'property records should be keyed by normalized addresses');
assert(propertyMemory.includes('normalizePropertyAddress(cloudRecord.normalizedAddress) !== normalizedAddress'), 'loaded records must verify the normalized address');

const saveStart = propertyMemory.indexOf('async function savePropertyMemoryFromForm()');
const saveEnd = propertyMemory.indexOf('function roomMarkupSummary()', saveStart);
const saveBlock = propertyMemory.slice(saveStart, saveEnd);
assert(saveStart >= 0 && saveEnd > saveStart, 'property save function should remain extractable');
assert(!saveBlock.includes('room.markup'), 'saving Property Memory must never change quote pricing');
assert(!saveBlock.includes('applyPropertyMarkupToQuote'), 'saving Property Memory must not invoke quote markup');

const applyStart = propertyMemory.indexOf('async function applyPropertyMarkupToQuote()');
const applyEnd = propertyMemory.indexOf('function onAddressInput()', applyStart);
const applyBlock = propertyMemory.slice(applyStart, applyEnd);
assert(applyStart >= 0 && applyEnd > applyStart, 'property markup action should remain extractable');
assert(applyBlock.includes('checkbox.checked'), 'markup requires an explicit per-quote opt-in checkbox');
assert(applyBlock.includes('qdConfirm'), 'markup requires a visible confirmation before pricing changes');
assert(applyBlock.includes('room.markup = percent'), 'confirmed property markup should use the existing room markup model');
assert(applyBlock.includes('_pushUndo') && applyBlock.includes('markUnsaved') && applyBlock.includes('saveSessionQuote'), 'property markup should be undoable and enter the normal quote save flow');
assert(propertyMemory.includes('id="propertyMarkupApplyBtn" disabled'), 'the apply button must start disabled');
assert(!/id="propertyMarkupApplyConfirm"[^>]*checked/.test(propertyMemory), 'the markup opt-in checkbox must never start selected');
assert(propertyMemory.includes('Saving this rule never changes pricing.'), 'the pricing boundary must be visible in the modal');

assert(storage.includes('QuoteDrPropertyMemory.refreshForCurrentAddress()'), 'cloud/session quote restore should refresh the address badge');
assert(clients.includes('QuoteDrPropertyMemory.refreshForCurrentAddress()'), 'saved-client address selection should refresh the address badge');
assert((builder.match(/QuoteDrPropertyMemory\.refreshForCurrentAddress\(\)/g) || []).length >= 2, 'legacy local quote loaders should refresh the address badge');

console.log('property memory static tests passed');
