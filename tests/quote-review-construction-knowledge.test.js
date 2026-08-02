const assert = require('assert');
const path = require('path');

const knowledge = require(path.resolve(__dirname, '..', 'quote-review-construction-knowledge.js'));
const review = require(path.resolve(__dirname, '..', 'quote-completeness-review.js'));

function profile(selectedTrades, roomTypes, extra) {
  return knowledge.normalizeReviewProfile(Object.assign({
    version: knowledge.VERSION,
    selectedTrades: selectedTrades,
    customTrades: [],
    roomTypes: roomTypes || {},
    detectedTradeIds: selectedTrades.map((item) => item.id),
    detectedTradePhases: selectedTrades.reduce((result, item) => {
      result[item.id] = item.phases || [];
      return result;
    }, {}),
    detectedTradeFingerprint: 'test',
    confirmedAt: '2026-07-28T12:00:00.000Z'
  }, extra || {}));
}

function scopeFor(room, reviewProfile) {
  return review.collectReviewScope({ rooms: [room] }, reviewProfile);
}

function keys(scope) {
  return review.findLocalReviewItems(scope).map((item) => item.knowledgeKey);
}

assert.strictEqual(knowledge.detectRoomType('Main Ensuite').roomTypeId, 'full_bathroom');
assert.strictEqual(knowledge.detectRoomType('Powder Room').roomTypeId, 'powder_room');
assert.strictEqual(knowledge.detectRoomType('Bathroom').needsConfirmation, true, 'generic bathrooms should be confirmed');
assert.strictEqual(knowledge.detectRoomType('Back Deck').roomTypeId, 'deck_porch');
assert.strictEqual(knowledge.detectRoomType('Site Preparation').roomTypeId, 'site_landscaping');

const ambiguousRoomProfile = profile(
  [{ id: 'painting', phases: [] }],
  {}
);
assert.strictEqual(
  review.reviewProfileNeedsSetup(
    ambiguousRoomProfile,
    { knownTrades: [], customTrades: [], allTradeIds: ['painting'], fingerprint: 'test' },
    [{ id: 'ambiguous-bath', name: 'Bathroom' }]
  ),
  true,
  'an ambiguous room without a confirmed type should reopen setup'
);

const detectedScope = review.collectReviewScope({
  rooms: [{
    id: 'detect-room',
    name: 'Kitchen',
    items: [
      { category: 'Rough Plumbing', description: 'Move sink rough-in' },
      { category: 'Finish Electrical', description: 'Install devices' },
      { category: 'Custom Metalwork', description: 'Decorative panel' }
    ]
  }]
});
const detectedTrades = knowledge.detectTradeScope(detectedScope);
assert.deepStrictEqual(
  detectedTrades.knownTrades.find((item) => item.id === 'plumbing').phases,
  ['rough_in'],
  'rough plumbing should not silently enable finish plumbing'
);
assert.deepStrictEqual(
  detectedTrades.knownTrades.find((item) => item.id === 'electrical').phases,
  ['finish'],
  'finish electrical should not silently enable rough electrical'
);
assert(
  detectedTrades.customTrades.some((item) => item.label === 'Custom Metalwork'),
  'unmapped categories should appear as custom trades'
);

const bedroom = {
  id: 'bedroom-1',
  name: 'Primary Bedroom',
  items: [{ category: 'Painting', description: 'Paint walls', itemDescription: 'Prepare and paint all walls.' }]
};
const flooringOnlyProfile = profile(
  [{ id: 'flooring', phases: [] }],
  { 'bedroom-1': 'bedroom' }
);
const paintingExcludedScope = scopeFor(bedroom, flooringOnlyProfile);
assert(
  !review.findLocalReviewItems(paintingExcludedScope).some((item) => item.tradeId === 'painting'),
  'an excluded painting trade must produce zero painting findings'
);
const paintingExcludedFindings = review.findLocalReviewItems(paintingExcludedScope);
const flooringOnlyEmptyScope = scopeFor(
  { id: 'bedroom-1', name: 'Primary Bedroom', items: [] },
  flooringOnlyProfile
);
assert.strictEqual(
  review.estimateProfileCompleteness(paintingExcludedScope, paintingExcludedFindings),
  review.estimateProfileCompleteness(flooringOnlyEmptyScope, review.findLocalReviewItems(flooringOnlyEmptyScope)),
  'excluded trade content must not lower the selected-scope coverage score'
);

const paintingProfile = profile(
  [{ id: 'painting', phases: [] }],
  { 'bedroom-1': 'bedroom' }
);
const paintingScope = scopeFor(bedroom, paintingProfile);
const paintingKeys = keys(paintingScope);
assert(!paintingKeys.includes('room_paint_walls'), 'existing wall painting should satisfy the wall-paint check');
assert(paintingKeys.includes('room_paint_ceiling'), 'selected painting should check bedroom ceilings');
assert(paintingKeys.includes('room_paint_trim'), 'selected painting should check bedroom trim');
assert(paintingKeys.includes('room_paint_protection'), 'selected painting should check protection');

const powderRoom = {
  id: 'powder-1',
  name: 'Powder Room',
  items: []
};
const powderProfile = profile(
  [{ id: 'plumbing', phases: ['finish'] }],
  { 'powder-1': 'powder_room' }
);
const powderKeys = keys(scopeFor(powderRoom, powderProfile));
assert(!powderKeys.includes('bath_bathing_fixture'), 'a powder room must not receive a shower or tub question');
assert(powderKeys.includes('bath_toilet'), 'a powder room should check toilet installation');
assert(powderKeys.includes('bath_vanity_plumbing'), 'a powder room should check vanity plumbing');

const fullBathroom = {
  id: 'bath-1',
  name: 'Main Bathroom',
  items: [{ category: 'Tile / Stone', description: 'Install shower tile' }]
};
const finishPlumbingProfile = profile(
  [{ id: 'plumbing', phases: ['finish'] }],
  { 'bath-1': 'full_bathroom' }
);
const finishPlumbingKeys = keys(scopeFor(fullBathroom, finishPlumbingProfile));
assert(finishPlumbingKeys.includes('bath_bathing_fixture'), 'a full bathroom should check the bathing fixture');
assert(!finishPlumbingKeys.includes('bath_plumbing_rough'), 'finish-only plumbing must not raise rough-in questions');

const tileOnlyProfile = profile(
  [{ id: 'tile_stone', phases: [] }],
  { 'bath-1': 'full_bathroom' }
);
const tileOnlyFindings = review.findLocalReviewItems(scopeFor(fullBathroom, tileOnlyProfile));
const waterproofingCoordination = tileOnlyFindings.find((item) => item.knowledgeKey === 'bath_tile_waterproofing_coordination');
assert(waterproofingCoordination, 'bathroom tile should ask who owns waterproofing when that trade is excluded');
assert.strictEqual(waterproofingCoordination.findingKind, 'coordination');
assert.strictEqual(waterproofingCoordination.dependencyTradeId, 'waterproofing');
assert(
  !tileOnlyFindings.some((item) => item.tradeId === 'waterproofing'),
  'an excluded waterproofing trade must not be presented as work to add'
);
assert(
  tileOnlyFindings.some((item) => item.insightType === 'cost_risk') &&
    tileOnlyFindings.some((item) => item.insightType === 'timeline_risk'),
  'selected tile work should receive scoped cost and sequencing insights'
);

const tileAndWaterproofingProfile = profile(
  [{ id: 'tile_stone', phases: [] }, { id: 'waterproofing', phases: [] }],
  { 'bath-1': 'full_bathroom' }
);
const tileAndWaterproofingFindings = review.findLocalReviewItems(scopeFor(fullBathroom, tileAndWaterproofingProfile));
assert(
  !tileAndWaterproofingFindings.some((item) => item.knowledgeKey === 'bath_tile_waterproofing_coordination'),
  'coordination questions should disappear when the dependency trade is selected'
);
assert(
  tileAndWaterproofingFindings.some((item) => item.knowledgeKey === 'bath_wet_area_waterproofing'),
  'selected waterproofing should receive its own normal completeness check'
);

const noGeneralProfile = profile(
  [{ id: 'painting', phases: [] }],
  { 'bedroom-1': 'bedroom' }
);
assert(
  !review.findLocalReviewItems(scopeFor(bedroom, noGeneralProfile)).some((item) => item.tradeId === 'general_conditions'),
  'job-wide questions must stay off unless General Conditions is selected'
);
const generalProfile = profile(
  [{ id: 'general_conditions', phases: [] }],
  { 'bedroom-1': 'bedroom' }
);
assert(
  review.findLocalReviewItems(scopeFor(bedroom, generalProfile)).some((item) => item.knowledgeKey === 'general_cleanup_disposal'),
  'General Conditions should enable cleanup and disposal review'
);

const excludedPaintingAi = review.parseReviewResponse(JSON.stringify({
  completenessScore: 88,
  summary: 'One possible item.',
  items: [{
    type: 'clarifying_question',
    severity: 'medium',
    key: 'room_paint_ceiling',
    knowledgeKey: 'room_paint_ceiling',
    tradeId: 'painting',
    roomType: 'bedroom',
    findingKind: 'scope_gap',
    dependencyTradeId: null,
    roomId: 'bedroom-1',
    roomName: 'Primary Bedroom',
    title: 'Ceiling painting',
    question: 'Should the ceiling be painted?',
    reason: 'Wall painting is present.',
    confidence: 90,
    evidence: ['Paint walls']
  }]
}), paintingExcludedScope);
assert.strictEqual(excludedPaintingAi.items.length, 0, 'client validation must discard AI findings for excluded trades');

const invalidCoordinationAi = review.parseReviewResponse(JSON.stringify({
  completenessScore: 80,
  summary: 'One possible item.',
  items: [{
    type: 'clarifying_question',
    severity: 'medium',
    key: 'invented_dependency',
    knowledgeKey: 'invented_dependency',
    tradeId: 'tile_stone',
    roomType: 'full_bathroom',
    findingKind: 'coordination',
    dependencyTradeId: 'electrical',
    roomId: 'bath-1',
    roomName: 'Main Bathroom',
    title: 'Invented dependency',
    question: 'Who handles this?',
    reason: 'Invented.',
    confidence: 60,
    evidence: []
  }]
}), scopeFor(fullBathroom, tileOnlyProfile));
assert.strictEqual(invalidCoordinationAi.items.length, 0, 'AI coordination must use a defined construction dependency');

const customTrade = detectedTrades.customTrades.find((item) => item.label === 'Custom Metalwork');
const customProfile = profile(
  [{ id: customTrade.id, phases: [] }],
  { 'detect-room': 'kitchen' },
  { customTrades: [customTrade] }
);
const customScope = review.collectReviewScope({
  rooms: [{
    id: 'detect-room',
    name: 'Kitchen',
    items: [{ category: 'Custom Metalwork', description: 'Decorative panel' }]
  }]
}, customProfile);
const customAi = review.parseReviewResponse(JSON.stringify({
  completenessScore: 90,
  summary: 'Confirm one custom-trade detail.',
  items: [{
    type: 'clarifying_question',
    severity: 'low',
    key: 'custom_panel_finish',
    knowledgeKey: 'custom_panel_finish',
    tradeId: customTrade.id,
    roomType: 'kitchen',
    findingKind: 'scope_gap',
    dependencyTradeId: null,
    roomId: 'detect-room',
    roomName: 'Kitchen',
    title: 'Panel finish',
    question: 'Is the final panel finish included?',
    reason: 'The custom panel is listed without a finish.',
    confidence: 65,
    evidence: ['Decorative panel']
  }]
}), customScope);
assert.strictEqual(customAi.items.length, 1, 'selected custom trades should accept grounded AI findings');
const customLocalFindings = review.findLocalReviewItems(customScope);
assert.strictEqual(
  customLocalFindings.filter((item) => item.insightType === 'completeness').length,
  0,
  'custom trades should not invent deterministic construction completeness rules'
);
assert(
  customLocalFindings.some((item) => item.insightType === 'drafting' && item.targetItemName === 'Decorative panel'),
  'selected custom trades may still receive a non-destructive wording opportunity grounded in an existing item'
);

const handledLearning = review.recordLearningResponse(null, {
  id: 'handled-1',
  topic: 'bath_tile_waterproofing_coordination',
  tradeId: 'tile_stone',
  roomType: 'full_bathroom',
  findingKind: 'coordination',
  response: 'handled_by_others',
  createdAt: '2026-07-28T12:00:00.000Z'
});
const learnedCoordination = review.applyLearningToFindings([waterproofingCoordination], handledLearning);
assert.strictEqual(learnedCoordination.length, 1, 'Handled by others must not suppress future confirmation');
assert.strictEqual(learnedCoordination[0].usuallyHandledByOthers, true, 'external handling should remain a distinct learning signal');

const savedDetection = knowledge.detectTradeScope(scopeFor(bedroom, paintingProfile));
const savedProfile = knowledge.normalizeReviewProfile(Object.assign({}, paintingProfile, {
  detectedTradeIds: savedDetection.allTradeIds,
  detectedTradePhases: {},
  detectedTradeFingerprint: savedDetection.fingerprint
}));
assert.strictEqual(
  review.reviewProfileNeedsSetup(savedProfile, savedDetection, [bedroom]),
  false,
  'a confirmed unchanged quote should reuse its saved review profile'
);
const changedQuoteScope = review.collectReviewScope({
  rooms: [{
    id: 'bedroom-1',
    name: 'Primary Bedroom',
    items: bedroom.items.concat([{ category: 'Flooring', description: 'Install LVP' }])
  }]
}, savedProfile);
const changedDetection = knowledge.detectTradeScope(changedQuoteScope);
assert.strictEqual(
  review.reviewProfileNeedsSetup(savedProfile, changedDetection, [bedroom]),
  true,
  'a newly detected trade should require scope reconfirmation'
);

const finishElectricalScope = review.collectReviewScope({
  rooms: [{
    id: 'phase-room',
    name: 'Office',
    items: [{ category: 'Finish Electrical', description: 'Install switches and receptacles' }]
  }]
});
const finishElectricalDetection = knowledge.detectTradeScope(finishElectricalScope);
const finishElectricalProfile = profile(
  [{ id: 'electrical', phases: ['finish'] }],
  { 'phase-room': 'office' },
  {
    detectedTradeIds: ['electrical'],
    detectedTradePhases: { electrical: ['finish'] },
    detectedTradeFingerprint: finishElectricalDetection.fingerprint
  }
);
const addedRoughScope = review.collectReviewScope({
  rooms: [{
    id: 'phase-room',
    name: 'Office',
    items: [
      { category: 'Finish Electrical', description: 'Install switches and receptacles' },
      { category: 'Rough Electrical', description: 'Add wiring and boxes' }
    ]
  }]
}, finishElectricalProfile);
assert.strictEqual(
  review.reviewProfileNeedsSetup(
    finishElectricalProfile,
    knowledge.detectTradeScope(addedRoughScope),
    [{ id: 'phase-room', name: 'Office' }]
  ),
  true,
  'a newly detected rough or finish phase should require reconfirmation'
);

const selectedKnowledge = review.applicableKnowledgePrompt(scopeFor(fullBathroom, tileOnlyProfile));
assert(
  selectedKnowledge.every((item) => item.tradeId === 'tile_stone'),
  'the AI should receive construction knowledge only for selected trades'
);

console.log('quote construction review knowledge checks passed');
