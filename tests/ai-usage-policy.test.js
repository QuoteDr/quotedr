const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function run() {
  const policyPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'ai-usage-policy.mjs');
  const policy = await import('file:///' + policyPath.replace(/\\/g, '/'));

  const voice = policy.getAiFeaturePolicy('voice_quote');
  assert(voice.hourlyLimit === 50, 'voice quote hourly limit should be easy to tune in one policy file');
  assert(voice.dailyLimit === 300, 'voice quote daily limit should be easy to tune in one policy file');
  assert(voice.maxOutputTokens === 2000, 'voice quote output token cap should be explicit');

  const refine = policy.getAiFeaturePolicy('ai_refine');
  assert(refine.hourlyLimit === 160, 'AI refine hourly limit should support bulk item cleanup');
  assert(refine.dailyLimit === 800, 'AI refine daily limit should support initial catalog cleanup');

  const quoteReview = policy.getAiFeaturePolicy('quote_completeness_review');
  assert(quoteReview.hourlyLimit === 40, 'quote review hourly limit should support normal estimating sessions');
  assert(quoteReview.dailyLimit === 200, 'quote review daily limit should protect spend while supporting active use');
  assert(quoteReview.maxInputChars === 16000, 'quote review should accept safely chunked quote scope');
  assert(quoteReview.maxOutputTokens === 1800, 'quote copilot output should have room for three structured insights and optional wording');

  const itemDraft = policy.getAiFeaturePolicy('quote_item_draft');
  assert(itemDraft.hourlyLimit === 40, 'item draft hourly limit should support normal Copilot review sessions');
  assert(itemDraft.dailyLimit === 160, 'item draft daily limit should cap generated item spend');
  assert(itemDraft.maxInputChars === 3500, 'item drafts should accept only compact finding context');
  assert(itemDraft.maxOutputTokens === 500, 'one structured item draft should use a small output cap');

  const floorPlan = policy.getAiFeaturePolicy('floor_plan');
  assert(floorPlan.hourlyLimit === 20, 'floor plan hourly limit should allow normal scan-heavy sessions');
  assert(floorPlan.dailyLimit === 80, 'floor plan daily limit should protect spend while staying generous');

  const smartImport = policy.getAiFeaturePolicy('smart_import');
  assert(smartImport.maxInputChars === 30000, 'smart import should accept large messy pasted files');
  assert(smartImport.maxOutputTokens === 8000, 'smart import should have room to return complete import JSON');

  const quoteImport = policy.getAiFeaturePolicy('quote_import');
  assert(quoteImport.dailyLimit === 150, 'quote import should have a soft daily fair-use cap');
  assert(quoteImport.maxInputChars >= 250000, 'quote import should accept full legacy spreadsheet exports before chunking');
  assert(quoteImport.maxOutputTokens >= 8000, 'quote import should have room to return complete quote JSON');

  const unknown = policy.getAiFeaturePolicy('unknown_feature');
  assert(unknown.feature === 'default', 'unknown AI features should fall back to a safe default policy');
  assert(unknown.dailyLimit < voice.dailyLimit, 'default policy should be more conservative than voice quote');

  const cost = policy.estimateOpenAiCostUsd('gpt-4o-mini', {
    prompt_tokens: 1000,
    completion_tokens: 500,
  });
  assert(cost > 0 && cost < 0.01, 'gpt-4o-mini cost estimate should be tiny but non-zero');

  const retry = policy.secondsUntilWindowReset(new Date('2026-05-07T10:15:30Z'), 'hour');
  assert(retry === 2670, 'hour reset should return seconds until the next hour');

  console.log('ai usage policy test passed');
})();
