const assert = require('assert');
const fs = require('fs');
const path = require('path');
const matcher = require('../ai-voice-rule-matcher.js');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
}

const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const preservationSource = [
  sourceBetween(builder, 'function _voiceRuleMatchesParsedItem', 'function _suppressAiItemsCoveredByTradeRules'),
  sourceBetween(builder, 'function _suppressAiItemsCoveredByTradeRules', 'function _voiceWordNumber'),
  sourceBetween(builder, 'function _decorateAiTradeRuleReviewItem', 'function _voiceRuleSelections'),
].join('\n');

const preservation = new Function(
  '_voiceRuleTextKey',
  '_voiceRuleMappedSearchText',
  '_aiVoiceTradeRuleType',
  preservationSource + '\nreturn { _suppressAiItemsCoveredByTradeRules, _preserveAmbiguousAiRuleItem };',
)(
  matcher.canonicalText,
  (rule) => `${rule.trigger_phrase || ''} ${rule.mapped_item_name || ''} ${rule.mapped_item_category || ''}`,
  () => 'line_item',
);

const parserItem = {
  category: 'Windows & Exterior Doors',
  description: 'Exterior door trim',
  quantity: 5,
  unit: 'ea',
  spokenPhrase: 'Trim up five exterior doors',
};
const result = { rooms: [{ name: 'Exterior', items: [parserItem] }] };
const genericRule = {
  id: 'regular-door-rule',
  trigger_phrase: 'trim up a door',
  mapped_item_name: 'Regular door trim',
  mapped_item_category: 'Interior Doors',
};
const selection = matcher.selectRuleMatches([genericRule], 'Trim up five exterior doors.')[0];

assert.strictEqual(preservation._preserveAmbiguousAiRuleItem(result, selection), true);
assert.strictEqual(parserItem.description, 'Exterior door trim', 'the generic rule must not overwrite the parser description before review');
assert.strictEqual(parserItem.quantity, 5, 'the generic rule must not shrink the parser quantity before review');
assert.strictEqual(parserItem.aiTradeRuleAmbiguous, true);
assert.strictEqual(parserItem.aiTradeRuleId, genericRule.id);
preservation._suppressAiItemsCoveredByTradeRules(result, []);
assert.strictEqual(result.rooms[0].items.length, 1, 'ambiguous rules should be excluded from parser-item suppression');

const countSource = [
  sourceBetween(builder, 'function _extractVoiceRuleCount', 'function _findClarificationAnswer'),
  sourceBetween(builder, 'function _buildAiTradeRuleVoiceItem', 'function _decorateAiTradeRuleReviewItem'),
].join('\n');
const countHelpers = new Function(
  'window',
  '_voiceRuleTextKey',
  '_voiceWordNumber',
  '_findVoiceSavedItemForMapped',
  '_voiceRoundQuantity',
  'normalizeLaborTime',
  countSource + '\nreturn { _buildAiTradeRuleVoiceItem };',
)(
  { QdAiVoiceRuleMatcher: matcher },
  matcher.canonicalText,
  (value) => ({ one: 1, two: 2, three: 3, four: 4, five: 5 }[String(value || '').toLowerCase()] || null),
  () => null,
  (value) => Math.round(Number(value) * 100) / 100,
  (value) => value || null,
);

const pricedRule = Object.assign({}, genericRule, {
  quantity_mode: 'per_count',
  quantity_value: 35,
  count_unit_label: 'door',
  default_count: 1,
  mapped_unit: 'LF',
  mapped_price: 10,
});
const fiveDoorItem = countHelpers._buildAiTradeRuleVoiceItem(
  pricedRule,
  'Paint twelve walls. Then trim up five exterior doors.',
  '',
  { spokenPhrase: 'trim up five exterior doors' },
);
assert.strictEqual(fiveDoorItem.quantity, 175, '35 LF per door should use five from the matched door phrase');
assert(fiveDoorItem.calculation.includes('x 5 door'), 'review should show the applied five-door math');

const fiveFootItem = countHelpers._buildAiTradeRuleVoiceItem(
  pricedRule,
  'Paint twelve walls. Then trim up a five-foot exterior door.',
  '',
  { spokenPhrase: 'trim up a five-foot exterior door' },
);
assert.strictEqual(fiveFootItem.quantity, 35, 'five-foot must use the one-door default rather than five doors');

const twoWindowRule = Object.assign({}, pricedRule, {
  id: 'window-rule',
  quantity_value: 18,
  count_unit_label: 'window',
  default_count: 4,
});
const twoWindowItem = countHelpers._buildAiTradeRuleVoiceItem(
  twoWindowRule,
  'Trim up two 4x5 windows.',
  '',
  { spokenPhrase: 'trim up two 4x5 windows' },
);
assert.strictEqual(twoWindowItem.aiTradeRuleCount, 2, 'the rule item should retain the editable item multiplier');
assert.strictEqual(twoWindowItem.aiTradeRuleQuantityValue, 18, 'the rule item should retain the per-window quantity');
assert.strictEqual(twoWindowItem.quantity, 36, '18 LF per window should multiply by the spoken two windows, not the saved default of four');
assert(twoWindowItem.calculation.includes('18 LF x 2 window = 36 LF'), 'review math should visibly prove the corrected two-window multiplier');

const reviewElements = {
  aiVoiceReviewRuleCount0: { value: '2' },
  aiVoiceReviewQuantity0: { value: '' },
  aiVoiceReviewUnit0: { value: '' },
  aiVoiceParsedPreview0: { textContent: '' },
};
const multiplierSource = sourceBetween(
  builder,
  'function _aiVoiceTradeRuleCalculationLabel',
  'function _syncAiVoiceReviewMatchSource',
);
const multiplierHelpers = new Function(
  'document',
  '_voiceRoundQuantity',
  'formatQuoteQuantityDisplay',
  'qdFormatMoney',
  multiplierSource + '\nreturn { _applyAiVoiceTradeRuleCountEdit };',
)(
  { getElementById: (id) => reviewElements[id] || null },
  (value) => Math.round(Number(value) * 100) / 100,
  (quantity, unit) => `${quantity} ${unit}`,
  (value) => `$${Number(value).toFixed(2)}`,
);
const editedWindowRow = { item: Object.assign({}, twoWindowItem, { aiTradeRuleCount: 4, quantity: 72 }) };
multiplierHelpers._applyAiVoiceTradeRuleCountEdit(editedWindowRow, 0);
assert.strictEqual(editedWindowRow.item.aiTradeRuleCount, 2, 'the editable multiplier should update the trade-rule count');
assert.strictEqual(editedWindowRow.item.quantity, 36, 'editing the multiplier should recalculate the priced LF quantity');
assert.strictEqual(editedWindowRow.item.total, 360, 'editing the multiplier should recalculate the line total deterministically');
assert(editedWindowRow.item.calculation.includes('x 2 window = 36 LF'), 'editing the multiplier should rewrite the visible proof formula');
assert.strictEqual(reviewElements.aiVoiceReviewQuantity0.value, 36, 'the quantity field should stay synchronized with multiplier math');

const postAuditSource = sourceBetween(
  builder,
  'function _voiceAuditClaimItems',
  'function _voiceWordNumber',
);
const postAudit = new Function(
  'window',
  '_voiceRuleTextKey',
  postAuditSource + '\nreturn { _applyAiVoicePostProcessingAudit };',
)({ QdAiVoiceRuleMatcher: matcher }, matcher.canonicalText);

const windowAuditResult = {
  _voiceAudit: {
    claims: {
      counts: [{ count: 2, object: 'window' }],
      qualifiers: [],
      work: [{ actions: ['trim'], object: 'window' }],
    },
  },
  rooms: [{ name: 'Windows', items: [Object.assign({}, twoWindowItem)] }],
};
assert.deepStrictEqual(
  postAudit._applyAiVoicePostProcessingAudit(windowAuditResult),
  [],
  'the screenshot case should pass once the formula proves 18 LF x 2 windows = 36 LF',
);
windowAuditResult.rooms[0].items[0].quantity = 72;
windowAuditResult.rooms[0].items[0].calculation = 'AI trade rule: 18 LF x 4 window = 72 LF';
assert.deepStrictEqual(
  postAudit._applyAiVoicePostProcessingAudit(windowAuditResult).map((issue) => issue.type),
  ['count'],
  'the safety check must continue blocking the stale four-window multiplier',
);

const processed = {
  _voiceAudit: {
    claims: {
      counts: [{ count: 5, object: 'door' }],
      qualifiers: [{ qualifier: 'exterior', object: 'door' }],
      work: [{ actions: ['trim'], object: 'door' }],
    },
  },
  rooms: [{
    name: 'Exterior',
    items: [{
      category: 'Interior Doors',
      description: 'Regular Door Trim',
      quantity: 35,
      unit: 'LF',
      calculation: '35 LF x 1 door = 35 LF',
      spokenPhrase: 'Trim up five exterior doors',
    }],
  }],
};
const postRuleIssues = postAudit._applyAiVoicePostProcessingAudit(processed);
assert.deepStrictEqual(
  postRuleIssues.map((issue) => issue.type).sort(),
  ['count', 'qualifier'],
  'the final audit should catch a familiar rule that reintroduced the wrong count and door type',
);
assert.strictEqual(processed.rooms[0].items[0].aiTranscriptAuditNeedsReview, true);

processed.rooms[0].items[0].category = 'Windows & Exterior Doors';
processed.rooms[0].items[0].description = 'Exterior Door Trim';
processed.rooms[0].items[0].quantity = 175;
processed.rooms[0].items[0].calculation = '35 LF x 5 doors = 175 LF';
assert.deepStrictEqual(
  postAudit._applyAiVoicePostProcessingAudit(processed),
  [],
  'a corrected exterior-door formula should pass the final client-side audit',
);
assert.strictEqual(processed.rooms[0].items[0].aiTranscriptAuditNeedsReview, undefined, 'resolved safety flags should be cleared before quote insertion');

processed.rooms[0].items[0].category = 'DOORS & TRIM';
processed.rooms[0].items[0].description = '2-3/4" Trim (painted)';
processed.rooms[0].items[0].quantity = 175;
processed.rooms[0].items[0].calculation = 'AI trade rule: fixed 175 LF';
processed.rooms[0].items[0].aiTradeRuleTrigger = 'trim five exterior doors';
assert.deepStrictEqual(
  postAudit._applyAiVoicePostProcessingAudit(processed),
  [],
  'a specific selected rule may prove the spoken count and qualifier even when it maps to a generic-priced trim item',
);

console.log('ai voice trade rule safety tests passed');
