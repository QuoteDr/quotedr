const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const knowledge = read('supabase/functions/_shared/quotedr-knowledge.ts');
const assistantFn = read('supabase/functions/ai-assistant/index.ts');
const widget = read('ai-assistant.js');
const helpContent = read('help-content.js');
const helpPage = read('help.html');

assert(knowledge.includes('QUOTE_DR_ASSISTANT_KNOWLEDGE'), 'shared QuoteDr assistant knowledge should be exported');
assert(knowledge.includes('Manage Items > Choice Group'), 'knowledge should explain where saved choice groups are created');
assert(knowledge.includes('Pick One'), 'knowledge should explain Pick One choice groups');
assert(knowledge.includes('Pick Multiple'), 'knowledge should explain Pick Multiple choice groups');
assert(knowledge.includes('auto-grouping'), 'knowledge should explain automatic grouping behavior');
assert(knowledge.includes('Turn Off Grouping'), 'knowledge should explain quote-level grouping override');
assert(knowledge.includes('AI Voice Review'), 'knowledge should explain the AI Voice review step');
assert(knowledge.includes('AI Memory'), 'knowledge should explain AI Voice learned mappings');
assert(knowledge.includes('AI Trade Rules'), 'knowledge should explain AI Trade Rules');
assert(knowledge.includes('Voice Templates'), 'knowledge should explain Voice Templates');
assert(knowledge.includes('deposit payment button on quote links'), 'knowledge should explain quote deposits');
assert(knowledge.includes('pay-in-full button on invoice links'), 'knowledge should explain invoice full payments');
assert(knowledge.includes('From what I can see, QuoteDr does not have that yet. Go to Settings > Feedback'), 'knowledge should include missing-feature guidance');

assert(assistantFn.includes('buildQuoteDrAssistantSystemPrompt'), 'ai-assistant function should import/use shared knowledge');
assert(assistantFn.includes('../_shared/quotedr-knowledge.ts'), 'ai-assistant function should import the shared knowledge module');
assert(assistantFn.includes('context'), 'ai-assistant function should accept optional frontend context');
assert(assistantFn.includes('Grounded-only product guide'), 'ai-assistant system prompt should require grounded answers');

assert(widget.includes('getQuoteDrAssistantContext'), 'assistant widget should collect lightweight page/tool context');
assert(widget.includes('context: getQuoteDrAssistantContext()'), 'assistant widget should send context with chat requests');
assert(widget.includes('getQuoteDrLocalAssistantReply'), 'assistant widget should provide deterministic local answers for built-in app help prompts');
assert(widget.includes('Manage Items > Choice Group'), 'assistant widget local answer should explain the real saved group workflow');
assert(widget.includes('click Choice Group, then click New'), 'saved group local answer should not route users to Settings > Saved Groups');
assert(!widget.includes('Select "Saved Groups"'), 'assistant widget should not contain the incorrect old saved group instruction');
assert(widget.includes('From what I can see, QuoteDr does not have that yet. Go to Settings > Feedback'), 'assistant widget should locally handle obvious missing-feature questions');

assert(helpContent.includes('Manage Items > Choice Group'), 'contextual help should explain saved choice groups');
assert(helpContent.includes('AI Memory'), 'contextual help should mention AI Memory');
assert(helpContent.includes('AI Trade Rules'), 'contextual help should mention AI Trade Rules');
assert(helpContent.includes('Voice Templates'), 'contextual help should mention Voice Templates');
assert(helpContent.includes('deposit payment button on quote links'), 'contextual help should mention deposits on quote links');
assert(helpContent.includes('pay-in-full button on invoice links'), 'contextual help should mention full invoice payments');

assert(helpPage.includes('How do I create a saved choice group?'), 'FAQ should cover saved choice groups');
assert(helpPage.includes('How can I let a client pick one of a few materials?'), 'FAQ should cover client material choices');
assert(helpPage.includes('Settings &gt; Feedback'), 'FAQ should route missing feature ideas to Settings > Feedback');

console.log('ai assistant knowledge static test passed');
