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
assert(builder.includes('property-memory.js?v=2026080303'), 'the Quote Builder should load the current Property Memory module');
assert(builder.includes('@media (max-width: 767.98px)') && builder.includes('.property-memory-contact-grid'), 'property contacts should reflow on mobile');
assert(builder.includes('.property-memory-additional-contact') && builder.includes('.property-memory-contact-remove'), 'additional property contacts need responsive row and removal styles');
assert(propertyMemory.includes('id="propertyAdditionalContacts"'), 'Property Memory needs a container for custom contacts');
assert(propertyMemory.includes('id="propertyAddContactBtn"') && propertyMemory.includes('Add property contact'), 'Property Memory needs an accessible add-contact control');
assert(propertyMemory.includes('id="propertyAdditionalContactsStatus"') && propertyMemory.includes('role="status"'), 'contact add/remove actions need an accessible status announcement');
assert(propertyMemory.includes("input.setAttribute('data-property-contact-field', fieldName)"), 'custom rows should expose structured role, name, phone, and email fields');
assert(propertyMemory.includes("removeButton.setAttribute('aria-label'"), 'custom contact removal needs a descriptive accessible label');
assert(propertyMemory.includes("if (options.focusRole) roleInput.focus()"), 'adding a contact should move keyboard focus to its role field');
assert(propertyMemory.includes('additional: normalizeAdditionalContacts(contacts.additional)'), 'legacy records should normalize custom contacts into the propertyContacts object');
assert(propertyMemory.includes('additional: readAdditionalPropertyContacts()'), 'custom contacts must be collected when Property Memory is saved');
assert(propertyMemory.includes('renderAdditionalPropertyContacts(record.propertyContacts.additional)'), 'saved custom contacts must be restored into the modal');
assert(propertyMemory.includes("container.querySelectorAll('[data-property-additional-contact]')"), 'only address-level custom contact rows should be read');
assert(propertyMemory.includes('}).filter(additionalContactHasData);'), 'fully blank custom contact rows must not be persisted');

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
assert(propertyMemory.includes('Saving this rule does not change this quote. You can review and apply it to this quote separately.'), 'the pricing boundary must use the approved explanatory copy');
assert(propertyMemory.includes('id="propertyMarkupAlwaysApply"') && propertyMemory.includes('role="switch"'), 'automatic property markup needs an accessible switch');
assert(propertyMemory.includes('Always apply this markup for this property.'), 'automatic property markup needs the approved label');
assert(propertyMemory.includes('including an explicit 0%'), 'the automatic behavior must explain that manual zero markup is preserved');
assert(!/id="propertyMarkupAlwaysApply"[^>]*checked/.test(propertyMemory), 'automatic property markup must default off');
assert(propertyMemory.includes('markupRule.alwaysApply === true'), 'legacy records should only opt in through an explicit true value');
assert(saveBlock.includes('applyNow: false'), 'saving the automatic setting must not change the current quote');

const autoStart = propertyMemory.indexOf('function applyAutomaticMarkupToUnmarkedRooms(options)');
const autoEnd = propertyMemory.indexOf('function activateAutomaticMarkupRule', autoStart);
const autoBlock = propertyMemory.slice(autoStart, autoEnd);
assert(autoStart >= 0 && autoEnd > autoStart, 'automatic property markup should remain independently testable');
assert(autoBlock.includes('return !roomHasManualRoomMarkup(room)'), 'automatic markup must skip every room with an explicit manual markup');
assert(autoBlock.includes('skippedRoomIds.indexOf'), 'saving an enabled rule must protect rooms already in the current quote');
assert(autoBlock.includes('room.markup = activeAutomaticMarkupRule.percent'), 'automatic markup should use the existing room markup model');
assert(autoBlock.includes('if (room.hideMarkup === undefined) room.hideMarkup = true'), 'automatic markup should preserve existing visibility and default new visibility to hidden');
assert(autoBlock.includes('saveSessionQuote') && autoBlock.includes('markUnsaved'), 'automatic pricing changes must enter the normal quote save flow');
assert(autoBlock.includes('Existing manual room markups were kept.'), 'automatic application should visibly report its safe behavior');
assert(propertyMemory.includes('activateAutomaticMarkupRule(record, normalizedAddress, { applyNow: true })'), 'selecting a saved property should activate its opted-in markup rule');
assert(builder.includes('applyAutomaticMarkupToUnmarkedRooms({ render: false, persist: false, undo: false })'), 'newly rendered unmarked rooms should inherit an active property rule');


assert(storage.includes('QuoteDrPropertyMemory.refreshForCurrentAddress()'), 'cloud/session quote restore should refresh the address badge');
assert(clients.includes('QuoteDrPropertyMemory.refreshForCurrentAddress()'), 'saved-client address selection should refresh the address badge');
assert((builder.match(/QuoteDrPropertyMemory\.refreshForCurrentAddress\(\)/g) || []).length >= 2, 'legacy local quote loaders should refresh the address badge');

console.log('property memory static tests passed');
