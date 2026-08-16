const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert(start >= 0, `Missing ${signature}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${signature}`);
}

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const promptHelper = extractFunction(builder, 'function shouldPromptToSaveNewLineItem');
const context = {
  LINE_ITEM_DATABASE_PROMPT_PREF_KEY: 'ald_new_line_item_database_prompt',
  localStorage: {
    value: null,
    getItem() { return this.value; }
  }
};
vm.createContext(context);
vm.runInContext(`${promptHelper}; this.shouldPrompt = shouldPromptToSaveNewLineItem;`, context);

assert.strictEqual(context.shouldPrompt(false), false, 'saved items should not trigger the prompt');
assert.strictEqual(context.shouldPrompt(true), true, 'new items should prompt by default');
context.localStorage.value = 'quote_only';
assert.strictEqual(context.shouldPrompt(true), false, 'do-not-ask should keep future new items quote-only');

const itemsSource = fs.readFileSync('quote-items.js', 'utf8');
const customHelper = extractFunction(itemsSource, 'function isManageCustomItem');
const itemContext = {
  customItems: {
    Doors: [{ name: 'Temporary service' }]
  }
};
vm.createContext(itemContext);
vm.runInContext(`${customHelper}; this.isCustom = isManageCustomItem;`, itemContext);

assert.strictEqual(itemContext.isCustom('Doors', { name: 'Temporary service' }), true, 'stored custom item should be deletable even without _custom');
assert.strictEqual(itemContext.isCustom('Doors', { name: 'Built in item' }), false, 'unrelated built-in item should stay protected');
assert.strictEqual(itemContext.isCustom('Doors', { name: 'Anything', _custom: true }), true, 'marked custom item should remain deletable');

console.log('Add Line Item database opt-in behavior checks passed.');
