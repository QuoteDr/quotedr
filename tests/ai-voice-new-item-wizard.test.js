const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const builder = read('quote-builder.html');
const items = read('quote-items.js');
const wizardSource = read('ai-voice-new-item-wizard.js');
const edge = read('supabase/functions/ai-assistant/index.ts');
const policy = read('supabase/functions/_shared/ai-usage-policy.mjs');
const artifact = read('config/public-artifact.mjs');

test('voice review offers new item only for an unmatched low-confidence phrase', () => {
  assert.match(builder, /bestSimilarScore < 35/);
  assert.match(builder, /suggestCreateNew = !mapping && !exact && !requiresChoice/);
  assert.match(builder, /<option value="new_item"/);
  assert.match(builder, />Create new item</);
  assert.match(builder, /Choose a saved item, a trade rule, or create a reusable pricing item/);
});

test('verified unmatched rows run one batch wizard before the quote is applied', () => {
  const confirmStart = builder.indexOf('async function confirmAiVoiceReview()');
  const confirmEnd = builder.indexOf('function _removeExcludedAiVoiceItems', confirmStart);
  const confirm = builder.slice(confirmStart, confirmEnd);
  assert.ok(confirmStart >= 0 && confirmEnd > confirmStart);
  assert.match(confirm, /newItemIndexes/);
  assert.match(confirm, /QdAiVoiceNewItemWizard\.run\(newItemIndexes\.map/);
  assert.match(confirm, /await createCustomItemsFromVoice\(wizardResult\.drafts\)/);
  assert.ok(confirm.indexOf('await createCustomItemsFromVoice') < confirm.indexOf('applyAIQuote(reviewed)'));
  assert.match(confirm, /wizardResult\.cancelled[\s\S]*_forceOpenAiVoiceReviewModal\(\)/);
  assert.match(confirm, /saveLearnedMapping\(row\.phrase \|\| row\.item\.description, decision\.newItem/);
  assert.match(confirm, /row\.item\.pricingMode = row\.item\.priceTbd \? 'tbd' : 'fixed'/);
});

test('new pricing items are validated and persisted in one cloud backup batch', () => {
  const start = items.indexOf('async function createCustomItemsFromVoice');
  const end = items.indexOf('function populateNewItemCategorySelect', start);
  const source = items.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /pendingKeys/);
  assert.match(source, /already exists in/);
  assert.match(source, /normalized\.forEach\(function saveVoiceDraft/);
  assert.equal((source.match(/await saveCustomItems\(false\)/g) || []).length, 1);
  assert.match(items, /return _doBackupItemsToCloud\(customItems\)\.then/);
  assert.match(items, /window\.createCustomItemsFromVoice = createCustomItemsFromVoice/);
});

test('wizard normalizes AI output and sends a compact no-price context', () => {
  const window = { location: { pathname: '/quote-builder' } };
  const context = { window };
  vm.createContext(context);
  vm.runInContext(wizardSource, context, { filename: 'ai-voice-new-item-wizard.js' });
  const api = window.QdAiVoiceNewItemWizard;
  assert.ok(api);
  const normalized = api.normalizeAssistantResult({
    status: 'needs_details',
    questions: Array.from({ length: 7 }, (_, index) => ({
      id: `q${index}`,
      question: `Question ${index}`,
      why: 'Materially changes scope',
      options: ['A', 'B', 'C', 'D', 'E', 'F'],
    })),
    draft: { name: 'Ceiling painting', category: 'Painting', unitType: 'sq ft', description: 'Prepare and paint the ceiling.' },
  });
  assert.equal(normalized.status, 'needs_details');
  assert.equal(normalized.questions.length, 4);
  assert.equal(normalized.questions[0].options.length, 5);

  const request = api.buildRequestContext(
    { phrase: 'paint ceiling', parsedName: 'Paint ceiling', roomName: 'Living room', quantity: 1, unitType: 'sq ft', rate: 999 },
    { taskNotes: 'repair minor nail pops', categories: Array.from({ length: 45 }, (_, i) => `Category ${i}`), questions: [], answers: { finish: 'flat' }, round: 9 },
    false,
  );
  assert.equal(request.categories.length, 40);
  assert.equal(request.round, 3);
  assert.equal(request.answers.finish, 'flat');
  assert.equal(Object.hasOwn(request, 'rate'), false);
  assert.equal(Object.hasOwn(request, 'price'), false);
});

test('wizard keeps voice input and contractor-controlled price requirements', () => {
  assert.match(wizardSource, /root\.SpeechRecognition \|\| root\.webkitSpeechRecognition/);
  assert.match(wizardSource, /Speak task details/);
  assert.match(wizardSource, /AI never sets your price/);
  assert.match(wizardSource, /Enter your rate or select Price TBD/);
  assert.match(wizardSource, /feature: 'voice_item_wizard'/);
  assert.match(wizardSource, /requireProFeature\('ai_refine'/);
});

test('Edge Function uses authenticated guarded structured guidance', () => {
  assert.match(edge, /feature === 'voice_item_wizard'/);
  assert.match(edge, /validateVoiceItemWizardContext\(context\?\.voiceItemWizard\)/);
  assert.match(edge, /VOICE_ITEM_CONTEXT \(untrusted data\)/);
  assert.match(edge, /name: 'voice_item_wizard'/);
  assert.match(edge, /strict: true/);
  assert.match(edge, /maxItems: 4/);
  assert.match(edge, /Never set or suggest a price, rate, material cost, markup, discount, quantity, or duration/);
  assert.match(edge, /entitlementFeature: aiFeature === 'voice_item_wizard'[\s\S]*\? 'ai_refine'/);
  assert.match(edge, /aiFeature === 'voice_item_wizard' \? 'gpt-5\.4-mini' : 'gpt-4o-mini'/);
  assert.match(edge, /parseVoiceItemWizard\(reply, voiceItemWizardContext\)/);
  assert.match(policy, /voice_item_wizard: Object\.freeze/);
});

test('new browser module is included in the reviewed public artifact', () => {
  assert.match(builder, /<script src="ai-voice-new-item-wizard\.js\?v=\d+"><\/script>/);
  assert.match(artifact, /'ai-voice-new-item-wizard\.js'/);
});
