const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const knowledge = require(path.join(root, 'quote-review-construction-knowledge.js'));
const starter = require(path.join(root, 'quote-starter-item-library.js'));

const tradeIds = Object.keys(knowledge.TRADES);
const roomIds = knowledge.ROOM_TYPES.map((room) => room.id);
const catalogIds = starter.CATALOG.map((item) => item.id);

assert(starter.CATALOG.length >= 80, 'starter catalog should provide substantial construction coverage');
assert.strictEqual(new Set(catalogIds).size, catalogIds.length, 'starter catalog IDs must be unique');
assert.deepStrictEqual(Object.keys(starter.coverage().trades).sort(), tradeIds.sort(), 'every construction trade should have starter items');
assert.deepStrictEqual(Object.keys(starter.coverage().rooms).sort(), roomIds.sort(), 'every room/project type should have starter items');

starter.CATALOG.forEach((item) => {
  assert(knowledge.getTrade(item.tradeId), item.id + ' should reference a valid trade');
  assert(item.roomTypes.length > 0, item.id + ' should reference at least one room/project type');
  item.roomTypes.forEach((roomType) => assert(knowledge.getRoomType(roomType), item.id + ' has invalid room ' + roomType));
  const validPhases = (knowledge.getTrade(item.tradeId).phases || []).map((phase) => phase.id);
  item.phases.forEach((phase) => assert(validPhases.includes(phase), item.id + ' has invalid phase ' + phase));
  item.knowledgeKeys.forEach((key) => assert(knowledge.getRule(key), item.id + ' has invalid knowledge key ' + key));
  assert(starter.COMMON_UNITS.includes(item.unitType), item.id + ' should use a supported unit');
  assert(item.name && item.category && item.description, item.id + ' should be client-editable');
  assert(!Object.prototype.hasOwnProperty.call(item, 'rate'), item.id + ' must not bundle a rate');
  assert(!Object.prototype.hasOwnProperty.call(item, 'materialCost'), item.id + ' must not bundle material cost');
  assert(!/[$\u20ac\u00a3]\s*\d|\b(?:price|rate|material cost|markup)\b\s*[:=]?\s*\d/i.test(item.name + ' ' + item.description), item.id + ' must not contain sample pricing');
});

const flooringItems = starter.query({ tradeId: 'flooring', roomType: 'bedroom' });
assert(flooringItems.length > 2, 'trade and room filtering should return useful flooring starters');
assert(flooringItems.every((item) => item.tradeId === 'flooring' && item.roomTypes.includes('bedroom')), 'filters must stay inside selected scope');
const roughPlumbing = starter.query({ tradeId: 'plumbing', roomType: 'full_bathroom', phaseId: 'rough_in' });
assert(roughPlumbing.length > 0, 'phase filtering should return plumbing rough-in starters');
assert(roughPlumbing.every((item) => !item.phases.length || item.phases.includes('rough_in')), 'phase filtering must exclude conflicting phases');
assert(starter.query({ search: 'underlayment' }).some((item) => item.id === 'flooring.underlayment'), 'text filtering should search names and aliases');

const toilet = starter.getItem('plumbing.toilet');
const importedToilet = starter.catalogItemToSavedItem(toilet, {
  name: 'My Toilet Set and Connect',
  description: 'Editable contractor wording.'
});
assert(importedToilet, 'catalog items should convert to personal saved items');
assert.strictEqual(importedToilet.rate, 0, 'starter imports should use zero rate');
assert.strictEqual(importedToilet.materialCost, 0, 'starter imports should use zero material cost');
assert.strictEqual(importedToilet.priceTbd, true, 'starter imports should be Price TBD');
assert.strictEqual(importedToilet.pricingMode, 'tbd', 'starter imports should retain TBD pricing mode');
assert.strictEqual(importedToilet.starterSourceId, toilet.id, 'starter provenance should be optional metadata on the personal copy');
assert.strictEqual(importedToilet.starterCatalogVersion, starter.VERSION, 'starter catalog version should be retained');

const byProvenanceDatabase = {
  Plumbing: [Object.assign({}, importedToilet, { name: 'Completely Renamed by Contractor', rate: 925 })]
};
assert.strictEqual(starter.findSavedItem(toilet, byProvenanceDatabase).rate, 925, 'provenance should detect an edited personal copy');
const byNameDatabase = {
  plumbing: [{ name: '  toilet installation ', unitType: 'each', rate: 775, itemDescription: 'My wording' }]
};
assert.strictEqual(starter.findSavedItem(toilet, byNameDatabase).rate, 775, 'normalized category/name should provide duplicate protection');

const toiletFinding = {
  roomId: 'bath-1',
  roomType: 'full_bathroom',
  tradeId: 'plumbing',
  phaseId: 'finish',
  findingKind: 'scope_gap',
  knowledgeKey: 'bath_toilet',
  suggestedItemName: 'Toilet Installation',
  suggestedCategory: 'Plumbing',
  title: 'Toilet installation',
  question: 'Is toilet installation included?'
};
const personalDatabase = {
  Plumbing: [{ name: 'Toilet Installation', unitType: 'each', rate: 840, materialCost: 25, itemDescription: 'Contractor-authored description.' }]
};
const personalBefore = JSON.stringify(personalDatabase);
let resolution = starter.resolveFinding(toiletFinding, personalDatabase, null, { suggestOutsideDatabase: true });
assert.strictEqual(resolution.kind, 'saved', 'personal saved items must take precedence over the starter catalog');
assert.strictEqual(resolution.savedItem.rate, 840, 'saved-item match must preserve contractor pricing');
assert.strictEqual(resolution.savedItem.itemDescription, 'Contractor-authored description.', 'saved-item match must preserve contractor wording');
assert.strictEqual(JSON.stringify(personalDatabase), personalBefore, 'matching must never mutate personal items');

resolution = starter.resolveFinding(toiletFinding, {}, null, { suggestOutsideDatabase: false });
assert.strictEqual(resolution.kind, 'none', 'toggle off should disable outside-database item actions');
resolution = starter.resolveFinding(toiletFinding, {}, null, { suggestOutsideDatabase: true });
assert.strictEqual(resolution.kind, 'catalog', 'toggle on should fall back to a curated starter item');
assert.strictEqual(resolution.catalogItem.id, 'plumbing.toilet', 'catalog fallback should use linked construction knowledge');

const unmatchedFinding = {
  roomId: 'room-1',
  roomType: 'office',
  tradeId: 'drywall',
  phaseId: '',
  findingKind: 'scope_gap',
  knowledgeKey: 'custom_unmatched_scope',
  suggestedItemName: 'Specialty Feature Coordination',
  suggestedCategory: 'Drywall',
  title: 'Specialty feature',
  question: 'Is the specialty feature included?'
};
assert.strictEqual(starter.resolveFinding(unmatchedFinding, {}, null, { suggestOutsideDatabase: true }).kind, 'draft', 'unmatched findings should offer an explicit AI draft');
assert.strictEqual(starter.resolveFinding(Object.assign({}, unmatchedFinding, { targetItemName: 'Existing item' }), {}, null, { suggestOutsideDatabase: true }).kind, 'none', 'existing quote item findings should stay in the edit workflow');
assert.strictEqual(starter.resolveFinding(Object.assign({}, unmatchedFinding, { findingKind: 'coordination' }), {}, null, { suggestOutsideDatabase: true }).kind, 'none', 'coordination questions should never create line items');

const emptyProfile = starter.normalizeProfile(null, { emptyDatabase: true });
const establishedProfile = starter.normalizeProfile(null, { emptyDatabase: false });
assert.strictEqual(emptyProfile.suggestOutsideDatabase, true, 'outside-database suggestions should default on for empty databases');
assert.strictEqual(establishedProfile.suggestOutsideDatabase, false, 'outside-database suggestions should default off for established databases');
assert.strictEqual(establishedProfile.events.length, 0, 'querying should not create learning events');

const baseline = starter.query({ tradeId: 'flooring', roomType: 'bedroom', profile: establishedProfile });
const promoted = baseline[baseline.length - 1];
const learnedProfile = starter.recordAction(establishedProfile, {
  starterItemId: promoted.id,
  action: 'added_to_quote',
  tradeId: promoted.tradeId,
  roomType: 'bedroom',
  id: 'explicit-test-event'
});
assert.strictEqual(learnedProfile.events.length, 1, 'only an explicit action should add a learning event');
assert.strictEqual(starter.query({ tradeId: 'flooring', roomType: 'bedroom', profile: learnedProfile })[0].id, promoted.id, 'explicit actions should rank later suggestions');
assert.strictEqual(starter.recordAction(learnedProfile, { action: 'viewed' }).events.length, 1, 'implicit or unsupported actions must not train ranking');

const validDraft = {
  name: 'Subfloor Preparation',
  category: 'Flooring',
  unitType: 'Flatrate',
  description: 'Inspect and prepare the existing subfloor for the selected finish flooring, with final scope confirmed after site review.'
};
const draftContext = { tradeId: 'flooring', phaseId: '', roomType: 'bedroom' };
const validated = starter.validateGeneratedDraft(validDraft, draftContext);
assert(validated && validated.priceTbd && validated.rate === 0, 'valid generated drafts should become Price TBD previews');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { price: 500 }), draftContext), null, 'extra fields should be rejected');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { description: 'Install at a price of $500.' }), draftContext), null, 'prices should be rejected');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { description: 'Install 12 each in this room.' }), draftContext), null, 'unsupported quantities should be rejected');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { description: 'Provide a code-compliant installation.' }), draftContext), null, 'code claims should be rejected');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { category: 'Painting' }), draftContext), null, 'draft category must match the selected trade');
assert.strictEqual(starter.validateGeneratedDraft(Object.assign({}, validDraft, { unitType: 'bundle' }), draftContext), null, 'unsupported units should be rejected');

console.log('starter item library behavior checks passed');
