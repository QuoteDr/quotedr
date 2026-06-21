const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');

assert(
  builder.includes('id="addLineItemValidation"'),
  'Add Line Item modal should include an inline validation message area'
);

assert(
  builder.includes('function validateAddLineItemRequiredFields()') &&
    builder.includes("document.getElementById('lineCategory')") &&
    builder.includes("document.getElementById('lineDescription')") &&
    builder.includes('is-invalid') &&
    builder.includes('Choose a category') &&
    builder.includes('Enter an item name'),
  'Add Line Item should validate category and item name, highlight missing fields, and explain what is missing'
);

const confirmBlock = builder.slice(
  builder.indexOf('async function confirmAddLine()'),
  builder.indexOf('function checkIfNewItem()')
);

assert(
  confirmBlock.includes('if (!validateAddLineItemRequiredFields()) return;'),
  'Add Line Item should stop before creating quote items when required fields are missing'
);

assert(
  builder.includes('function normalizeLineItemCategoryValue(') &&
    builder.includes('function isLineItemOneTimeCategory(') &&
    builder.includes('dataset.oneTimeCategory') &&
    builder.includes("selectedCat + ' (quote only)'") &&
    confirmBlock.includes('normalizeLineItemCategoryValue('),
  'One-time categories should resolve to a normal quote item category without being saved to the reusable category list'
);

assert(
  confirmBlock.includes('!isLineItemOneTimeCategory()') &&
    builder.includes('Use Once categories are not saved to your item database.'),
  'Use Once categories should not trigger or allow reusable item/category saves by accident'
);

assert(
  builder.includes("secondaryText: 'Use Once'") &&
    builder.includes('secondaryPromptValue: true') &&
    builder.includes('handleNewCategoryPromptResult') &&
    builder.includes('Save keeps this category') &&
    builder.includes('Use Once applies it only to this line item'),
  'New Category prompt should offer Save and Use Once with explanatory help copy'
);

assert(
  dialogs.includes('id="qdDialogHelp"') &&
    dialogs.includes('id="qdDialogHelpText"') &&
    dialogs.includes('secondaryPromptValue') &&
    dialogs.includes('input.value'),
  'Shared QuoteDr prompt should support inline help and returning prompt input from a secondary action'
);
