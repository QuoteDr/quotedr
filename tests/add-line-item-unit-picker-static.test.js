const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  builder.includes('select id="lineUnitType"') &&
    builder.includes('onchange="handleLineUnitTypeChange()"'),
  'Add Line Item unit type should be a select dropdown instead of a free-text input'
);

assert(
  builder.includes('function populateLineUnitTypeDropdown(') &&
    builder.includes('ald_manage_custom_unit_types') &&
    builder.includes('sq ft') &&
    builder.includes('Flatrate') &&
    builder.includes('hourly') &&
    builder.includes('New...'),
  'Add Line Item unit dropdown should reuse the Manage Items unit set and include a New option'
);

assert(
  builder.includes('function handleLineUnitTypeChange()') &&
    builder.includes("secondaryText: 'Use Once'") &&
    builder.includes('secondaryPromptValue: true') &&
    builder.includes('handleNewLineUnitPromptResult') &&
    builder.includes('Save keeps this unit type') &&
    builder.includes('Use Once applies it only to this line item'),
  'New unit type prompt should support Save and Use Once with help copy'
);

assert(
    builder.includes('function setOneTimeLineUnitType(') &&
    builder.includes('dataset.oneTimeUnit') &&
    builder.includes("clean + ' (use once)'") &&
    builder.includes("current + ' (quote only)'"),
  'Use Once unit types should be represented as quote-only options without saving them'
);

assert(
  builder.includes('function normalizeLineUnitTypeValue(') &&
    builder.includes('const unitType = normalizeLineUnitTypeValue(document.getElementById(\'lineUnitType\'));'),
  'Saving and adding line items should normalize the selected unit type, including one-time units'
);
