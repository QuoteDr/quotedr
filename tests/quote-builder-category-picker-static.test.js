const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('id="quoteCategoryPickerModal"'), 'quote builder should include the category picker modal');
assert(source.includes('function openQuoteCategoryPicker'), 'category headers should open the category picker');
assert(source.includes('function reassignQuoteCategory'), 'quote builder should reassign category groups');
assert(source.includes('function createAndAssignQuoteCategory'), 'the picker should support creating and assigning a new category');
assert(source.includes('class="quote-category-name-button"'), 'rendered category names should be clickable controls');
assert(
  /function reassignQuoteCategory[\s\S]*?_pushUndo\(\);[\s\S]*?item\.category = newName;[\s\S]*?replaceQuoteCategoryOrder[\s\S]*?finishRoomBulkItemAction/.test(source),
  'category reassignment should update every matching item, preserve category order, and persist through the shared completion flow'
);
assert(
  /function getQuoteCategoryPickerCategories[\s\S]*?Object\.keys\(pricingDatabase \|\| \{\}\)/.test(source),
  'the category picker should use the same saved category database as Add Item'
);

assert(
  /function populateQuoteCategoryPicker[\s\S]*?toLowerCase\(\) === String\(selectedCategory \|\| ''\)\.toLowerCase\(\)[\s\S]*?select\.value = selectedMatch/.test(source),
  'imported category capitalization should preselect the matching saved category'
);

console.log('quote builder category picker static test passed');
