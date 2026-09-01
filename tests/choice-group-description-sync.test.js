const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const context = vm.createContext({});
vm.runInContext([
  functionSource('quoteUpgradeRuntimeTextKey'),
  functionSource('choiceGroupMatchKey'),
  functionSource('getChoiceGroupOptionItemDescription'),
  functionSource('syncSavedItemDescriptionIntoChoiceGroup'),
  `function getChoiceGroupSelectedOptions(group) {
    return (group.options || []).filter(option => (group.selectedOptionIds || []).includes(option.id));
  }`,
  functionSource('syncSelectedChoiceGroupItemDescription')
].join('\n'), context);

const longDescription = 'Install LVP with precise fitting, door-jamb cuts, and a professional finish.';
const legacyOption = {
  id: 'lvp',
  name: 'Vinyl Plank (LVP) Installation',
  description: 'Vinyl Plank (LVP) Installation',
  itemDescription: ''
};

assert.strictEqual(
  context.getChoiceGroupOptionItemDescription(legacyOption, longDescription),
  longDescription,
  'a name-only legacy option should not overwrite the edited reusable description'
);

assert.strictEqual(
  context.getChoiceGroupOptionItemDescription(
    { name: 'Vinyl Plank (LVP) Installation', itemDescription: 'Choice-specific client wording.' },
    longDescription
  ),
  'Choice-specific client wording.',
  'a meaningful choice-specific description should remain authoritative'
);

const groupedItem = {
  category: 'FLOORING',
  choiceGroup: {
    selectedOptionIds: ['lvp'],
    options: [
      legacyOption,
      { id: 'hardwood', category: 'FLOORING', name: 'Hardwood Flooring Installation', itemDescription: 'Keep this.' }
    ]
  }
};

context.syncSavedItemDescriptionIntoChoiceGroup(groupedItem, 'FLOORING', {
  name: 'Vinyl Plank (LVP) Installation',
  itemDescription: longDescription
});
assert.strictEqual(groupedItem.choiceGroup.options[0].itemDescription, longDescription);
assert.strictEqual(groupedItem.choiceGroup.options[1].itemDescription, 'Keep this.');

context.syncSelectedChoiceGroupItemDescription(groupedItem, 'Manually edited description.');
assert.strictEqual(groupedItem.choiceGroup.options[0].itemDescription, 'Manually edited description.');
assert.strictEqual(groupedItem.choiceGroup.options[1].itemDescription, 'Keep this.');

assert(
  source.includes("if (savedDescription && !getChoiceGroupOptionItemDescription(next, ''))") &&
    source.includes('next.itemDescription = savedDescription;'),
  'fresh additions should hydrate missing legacy choice descriptions from the saved item'
);

assert(
  source.includes('itemDescription: getChoiceGroupOptionItemDescription(option, item.itemDescription)'),
  'rendering a legacy grouped option should fall back to the edited parent description instead of its name'
);
assert(
  source.includes('syncSavedItemDescriptionIntoChoiceGroup(item, category, savedItem);'),
  'Review Updates should copy the saved description into the matching grouped option'
);
assert(
  source.includes('syncSelectedChoiceGroupItemDescription(item, itemDescription);'),
  'direct builder edits should update the selected grouped option'
);

console.log('choice group description sync checks passed');
