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
