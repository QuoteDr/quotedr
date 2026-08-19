const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
}

const supabase = read('supabase-v2.js');
const builder = read('quote-builder.html');
const migration = read('supabase/migrations/20260819145201_remember_ai_trade_rule_phrases.sql');

const helperSource = sourceBetween(
  supabase,
  'function normalizeAiTradeRuleLearnedPhrases',
  'function sanitizeAiTradeRuleClarificationOptions',
);
const helpers = new Function(
  'normalizeAiPhraseKey',
  helperSource + '\nreturn { normalizeAiTradeRuleLearnedPhrases };',
)((value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());

assert.deepStrictEqual(
  helpers.normalizeAiTradeRuleLearnedPhrases(['Trim two windows', ' trim TWO windows ', '', null]),
  ['Trim two windows'],
  'learned phrases should be normalized and deduplicated without replacing the owner wording',
);

const capped = helpers.normalizeAiTradeRuleLearnedPhrases(
  Array.from({ length: 55 }, (_, index) => `confirmed phrase ${index + 1}`),
);
assert.strictEqual(capped.length, 50, 'a trade rule should cap remembered phrases to prevent unbounded rows');
assert.strictEqual(capped[0], 'confirmed phrase 6', 'the cap should retain the most recently confirmed phrases');
assert.strictEqual(capped[49], 'confirmed phrase 55');

const rememberBlock = sourceBetween(
  supabase,
  'async function rememberAiTradeRulePhrase',
  'function sanitizeAiTradeRuleClarificationOptions',
);
assert(rememberBlock.includes(".eq('user_id', user.id)"), 'loading a rule for phrase learning must be owner scoped');
assert(rememberBlock.includes("filters: [{ column: 'id', value: ruleId }, { column: 'user_id', value: user.id }]"), 'the durable update must remain owner scoped');
assert(rememberBlock.includes("entityType: 'ai_trade_rule_phrase'"), 'phrase learning should use the durable save coordinator');

assert(migration.includes("add column if not exists learned_phrases jsonb not null default '[]'::jsonb"), 'the migration should add a non-null JSON array with a safe default');
assert(!migration.includes('grant ') && !migration.includes('disable row level security'), 'the migration must not broaden table access or disable RLS');

const confirmBlock = sourceBetween(builder, 'async function confirmAiVoiceReview', 'function _removeExcludedAiVoiceItems');
assert(confirmBlock.includes('remember && remember.checked'), 'trade-rule learning should remain optional in review');
assert(confirmBlock.includes('rememberAiTradeRulePhrase(decision.tradeChoice.rule.id'), 'the chosen rule and reviewed phrase should be saved together');
assert(confirmBlock.indexOf('rememberAiTradeRulePhrase') < confirmBlock.indexOf('await Promise.all(saveTasks'), 'phrase learning should complete before reviewed items are added');

console.log('ai voice trade rule learning tests passed');
