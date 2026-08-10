const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const topics = require('../chatbot-feedback-topics.js');

[
  'Why did AI Voice to Quote leave out the measurements I said?',
  'The microphone recorded my exterior scope but the generated quote missed a door.',
  'Where can I review what QuoteDr heard from my spoken job?',
  'My Voice Memory trade rule was not applied after I dictated the room.',
  'How do I make a voice template for a standard bedroom package?'
].forEach(question => {
  const result = topics.classify(question, 'Use the AI Voice review step before saving.', { pagePath: '/quote-builder.html' });
  assert(result, `expected a controlled topic for: ${question}`);
  assert.strictEqual(result.topicKey, 'ai_voice_to_quote', `expected Voice to Quote grouping for: ${question}`);
  assert.deepStrictEqual(Object.keys(result).sort(), ['intentKey', 'surfaceKey', 'topicKey']);
  assert(!JSON.stringify(result).includes(question), 'classification must not return raw text');
});

assert.strictEqual(topics.classify('How do I connect QuickBooks?', '', { pagePath: '/settings.html' }).topicKey, 'quickbooks');
assert.strictEqual(topics.classify('The client portal link is not working', '', { pagePath: '/dashboard.html' }).topicKey, 'client_portal');
assert.strictEqual(topics.classify('What is the weather?', '', { pagePath: '/help.html' }), null);

const assistant = read('ai-assistant.js');
assert(/body:\s*JSON\.stringify\(\{\s*action:\s*'record',\s*topicKey:\s*classified\.topicKey,\s*intentKey:\s*classified\.intentKey,\s*surfaceKey:\s*classified\.surfaceKey\s*\}\)/.test(assistant), 'collector payload must contain controlled enums only');
assert(!/body:\s*JSON\.stringify\(\{[^}]*question:/s.test(assistant), 'collector must not send a raw question');
assert(assistant.includes('.catch(function() {})'), 'telemetry failure must be swallowed');
assert(assistant.includes('recordPrivacySafeChatbotTopic(text, localReply)') && assistant.includes('recordPrivacySafeChatbotTopic(text, reply)'), 'local and remote answers should both classify after normal use succeeds');

const edge = read('supabase/functions/chatbot-feedback/index.ts');
assert(edge.includes('FORBIDDEN_RAW_FIELDS'), 'endpoint must reject raw content fields');
assert(edge.includes("'question', 'answer', 'message', 'messages', 'prompt', 'chat', 'conversation'"), 'raw chat keys must be forbidden');
assert(edge.includes('await verifyAdmin(req)'), 'administrator reads and mutations must authenticate as admin');
assert(edge.includes('fingerprintsReturned: false'), 'admin response must document fingerprint minimization');
assert(!/user_fingerprint\s*:/m.test(edge), 'fingerprints must not be serialized in the admin response');

const migration = read('supabase/migrations/20260805004527_chatbot_feedback_intelligence.sql');
assert(migration.includes('enable row level security'), 'feedback tables must enable RLS');
assert(migration.includes('revoke all on table public.chatbot_feedback_observations from public, anon, authenticated'), 'contractors must have no direct observation access');
assert(migration.includes('revoke all on function public.record_chatbot_feedback_observation') && migration.includes('to service_role'), 'only the server may execute the recorder RPC');
assert(migration.includes("p_user_id::text || ':' || p_topic_key"), 'fingerprints must be topic scoped to prevent cross-theme linking');
assert(migration.includes('count(distinct observation.user_fingerprint)'), 'alerts must count distinct users');
assert(migration.includes('v_settings.window_days') && migration.includes('v_settings.cooldown_days'), 'window and debounce must be enforced in the database');
assert(migration.includes('v_theme.reviewed_at') && migration.includes('v_theme.snoozed_until'), 'review and snooze state must affect alerts');
assert(migration.includes('greatest(v_count_from, v_theme.reviewed_at)') && !migration.includes('pg_catalog.greatest'), 'review cooldown must use valid PostgreSQL GREATEST syntax');
assert(migration.includes('retention_days integer not null default 90'), 'minimized observations must have a bounded default retention');
assert(!/chatbot_feedback_observations[\s\S]{0,1200}\b(question|answer|message|email|client_name)\s+(text|varchar)/i.test(migration), 'observation schema must not contain raw chat or direct identity columns');

const settings = read('settings.html');
assert(settings.includes('id="adminSettingsGroup"') && settings.includes('id="chatbotFeedbackTabLink"'), 'AI Chatbot must live in the administrator settings group');
assert(settings.includes('id="chatbotFeedbackThreshold"') && settings.includes('id="chatbotFeedbackWindow"') && settings.includes('id="chatbotFeedbackCooldown"'), 'threshold, window, and debounce must be configurable');
assert(settings.includes("updateChatbotFeedbackTheme(\\'review\\'") && settings.includes("updateChatbotFeedbackTheme(\\'snooze\\'"), 'review and snooze controls must be rendered');
assert(settings.includes('Anonymized evidence:') && settings.includes('safeExampleLabel'), 'admin must see controlled, anonymized supporting metadata');
assert(settings.includes('aria-live="polite"') && settings.includes('role="status"'), 'admin status must be announced accessibly');

const inlineScripts = Array.from(settings.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
inlineScripts.forEach((match, index) => assert.doesNotThrow(() => new vm.Script(match[1], { filename: `settings-inline-${index + 1}.js` })));

const config = read('supabase/config.toml');
assert(/\[functions\.chatbot-feedback\]\s*verify_jwt\s*=\s*true/.test(config), 'gateway JWT verification must be enabled');

console.log('chatbot feedback intelligence test passed');
