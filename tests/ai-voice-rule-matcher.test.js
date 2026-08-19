const assert = require('assert');
const fs = require('fs');
const path = require('path');
const matcher = require('../ai-voice-rule-matcher.js');

function rule(id, phrase, usageCount = 0) {
  return {
    id,
    trigger_phrase: phrase,
    usage_count: usageCount,
    active: true,
  };
}

{
  assert.strictEqual(matcher.extractCount('trim up two 4x5 windows', 'window'), 2, 'a leading count before dimensions should count windows, not dimension values');
  assert.strictEqual(matcher.extractCount('trim up 2 4 by 5 windows', 'window'), 2, 'spoken by-dimensions should preserve the leading item count');
  assert.strictEqual(matcher.extractCount('trim up 4x5 windows', 'window'), null, 'dimensions without an explicit leading count must not become four windows');
}

{
  const learnedRule = Object.assign(rule('window-trim', 'trim up a window'), {
    learned_phrases: ['trim up two 4x5 windows'],
  });
  const selection = matcher.selectRuleMatches([learnedRule], 'Trim up two 4x5 windows.')[0];
  assert(selection, 'a confirmed learned trade-rule phrase should match in a later recording');
  assert.strictEqual(selection.rule.id, 'window-trim');
  assert.strictEqual(selection.match.learnedPhrase, true, 'the matcher should identify the owner-confirmed phrase path');
  assert.strictEqual(selection.ambiguous, false, 'an exact learned phrase should not ask the same trade-rule question again');
}

{
  const selections = matcher.selectRuleMatches([
    rule('familiar', 'trim up a door', 250),
    rule('specific', 'trim up a five-foot exterior door', 0),
  ], 'Trim up a five-foot exterior door.');

  assert.strictEqual(selections.length, 1, 'overlapping door rules should produce one rule selection');
  assert.strictEqual(selections[0].rule.id, 'specific', 'the longer exact rule should beat a frequently used generic rule');
  assert.strictEqual(selections[0].spokenPhrase, 'Trim up a five-foot exterior door', 'the actual transcript excerpt should be preserved');
  assert.strictEqual(selections[0].ambiguous, false, 'a clearly more-specific rule should not be presented as ambiguous');
}

{
  const selection = matcher.selectRuleMatches([
    rule('specific', 'trim up a five-foot exterior door'),
  ], 'Please trim up a 5 foot exterior door in the entry.')[0];

  assert(selection, 'number-word and numeric forms should match');
  assert.strictEqual(selection.rule.id, 'specific');
  assert.strictEqual(selection.spokenPhrase, 'trim up a 5 foot exterior door');
}

{
  const selections = matcher.selectRuleMatches([
    rule('words', 'trim up a five foot exterior door'),
    rule('digits', 'trim up a 5 foot exterior door'),
  ], 'Trim up a five-foot exterior door.');

  assert.strictEqual(selections.length, 1);
  assert.strictEqual(selections[0].candidates.length, 2, 'equivalent close rules should both be offered');
  assert.strictEqual(selections[0].ambiguous, true, 'equivalent close rules should require a review choice');
}

{
  const selections = matcher.selectRuleMatches([
    rule('door', 'trim up a door'),
    rule('paint', 'paint the walls'),
  ], 'Trim up a door. Next room. Paint the walls.');

  assert.deepStrictEqual(selections.map((selection) => selection.rule.id), ['door', 'paint'], 'separate spoken jobs should apply separate rules');
}

{
  assert.strictEqual(
    matcher.matchRule(rule('door', 'trim up a door'), 'A door needs trim up'),
    null,
    'rule words in a different order should not be treated as the trigger phrase',
  );
}

{
  const fixture = fs.readFileSync(path.join(__dirname, 'ai-voice-review-browser-fixture.html'), 'utf8');
  const scripts = Array.from(fixture.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi));
  assert.strictEqual(scripts.length, 1, 'browser fixture should keep its setup in one isolated script');
  assert.doesNotThrow(() => new Function(scripts[0][1]), 'browser fixture script should parse');
  assert(fixture.includes('specific-door-rule-words'), 'browser fixture should cover the specific five-foot exterior-door rule');
  assert(fixture.includes('specific-door-rule-number'), 'browser fixture should cover close word/number rule ambiguity');
}

console.log('ai voice rule matcher tests passed');
