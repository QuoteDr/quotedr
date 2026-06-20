const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quote-builder.html', 'utf8');
const items = fs.readFileSync('quote-items.js', 'utf8');

assert(
  items.includes('function renderManageUnitSelect') &&
    items.includes('<select class="form-select form-select-sm item-unit-type-input"') &&
    items.includes('renderManageUnitSelect(item.unitType || \'\')') &&
    items.includes('function handleManageUnitTypeChange') &&
    items.includes('New...') &&
    items.includes('MANAGE_CUSTOM_UNITS_KEY') &&
    items.includes('function rememberManageUnitType') &&
    items.includes('function syncManageUnitTypeOptions') &&
    items.includes('window.handleManageUnitTypeChange = handleManageUnitTypeChange') &&
    items.includes('row.querySelector(\'.item-unit-type-input\')?.value.trim()'),
  'Existing Manage Items unit fields should use a real select dropdown, support remembered new units, and save from that field'
);

assert(
  items.includes("'sq ft', 'sqft', 'LF', 'linear foot', 'linear ft'") &&
    html.includes('<datalist id="unitTypeOptions">') &&
    html.includes('<option value="sqft">') &&
    html.includes('<option value="linear foot">') &&
    html.includes('<option value="linear ft">') &&
    html.includes('<option value="each">') &&
    html.includes('<option value="Flatrate">'),
  'Shared unit dropdown should include common saved-item unit choices and aliases'
);
