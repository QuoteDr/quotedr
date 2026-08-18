const assert = require('assert');
const fs = require('fs');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  builder.includes('id="quoteTaxEnabledToggle"') &&
    builder.includes('updateQuoteTaxEnabledFromToggle()'),
  'quote builder should include a per-quote tax on/off toggle in the total card'
);

assert(
  builder.includes('function getQuoteTaxEnabledDefault') &&
    builder.includes('function setQuoteTaxEnabled') &&
    builder.includes('taxEnabled: taxEnabled'),
  'quote builder should calculate zero tax when tax is disabled'
);

assert(
  builder.includes('taxEnabled: getQuoteTaxEnabled()') &&
    storage.includes('setQuoteTaxEnabled(data.taxEnabled !== false)'),
  'quote JSON should save and restore the per-quote tax enabled state'
);

assert(
  settings.includes('id="taxEnabledDefault"') &&
    settings.includes('taxEnabledDefault: document.getElementById(\'taxEnabledDefault\')') &&
    settings.includes('savedPrefs.taxEnabledDefault !== false'),
  'settings should save/load the default tax-on preference for new quotes'
);

assert(
  viewer.includes('var _vTaxEnabled = quoteData.taxEnabled !== false;') &&
    viewer.includes('taxEnabled: _vTaxEnabled') &&
    viewer.includes('updateQuoteTotalBreakdown(baseSubtotal, tax, total, _vTaxLabel, _vTaxRate, paymentReceivedAmount, _vTaxEnabled)'),
  'interactive quote viewer should respect quoteData.taxEnabled without using settings to re-enable tax'
);

assert(
  invoice.includes('var _iTaxEnabled = invoiceData.taxEnabled !== false;') &&
    invoice.includes('taxEnabled: _iTaxEnabled'),
  'invoice viewer should respect invoiceData.taxEnabled'
);

console.log('Quote tax toggle static checks passed');
