const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const settings = read('settings.html');
const onboarding = read('onboarding.html');
const help = read('help.html');
const quoteViewer = read('interactive-quote-viewer.html');
const invoiceViewer = read('invoice-viewer.html');
const clientPortal = read('client-portal.html');
const portalConcepts = read('portal-design-concepts.html');

const activeTaxIdSurfaces = [settings, onboarding, help, quoteViewer, invoiceViewer, clientPortal, portalConcepts];
for (const source of activeTaxIdSurfaces) {
  assert(!source.includes('123456789 RC0001'), 'active customer copy must not use an RC corporation-income-tax example for GST/HST');
}

assert(settings.includes('GST/HST or Tax ID'));
assert(onboarding.includes('GST/HST or Tax ID'));
assert(settings.includes('e.g., 123456789 RT0001 (Canada)'));
assert(onboarding.includes('e.g., 123456789 RT0001 (Canada)'));
assert(settings.includes('does not verify registration status'));
assert(onboarding.includes('does not verify registration status'));
assert(help.includes('does not verify registration status'));

for (const source of [quoteViewer, invoiceViewer, clientPortal, portalConcepts]) {
  assert(source.includes('GST/HST or Tax ID:'), 'client-facing tax IDs should use the neutral Canadian-first label');
}
assert(invoiceViewer.includes("var taxId = taxIdKey === undefined ? '' : String(profile[taxIdKey]);"));

for (const source of [settings, onboarding]) {
  const input = source.match(/<input[^>]+id="(?:bizHst|hstNumber)"[^>]*>/)?.[0] || '';
  assert(input, 'tax-ID input should exist');
  assert(!/\bpattern=|\bmaxlength=|\boninput=/i.test(input), 'tax-ID input must not impose format validation or normalization');
}

function extractFunction(source, name) {
  const signature = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = signature.exec(source);
  assert(match, `expected ${name} in source`);
  const start = match.index;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const elementIds = [
  'businessName', 'ownerName', 'bizAddress', 'bizCity', 'bizProvince', 'bizPostal',
  'bizPhone', 'bizEmail', 'bizHst', 'bizTagline', 'profileSaved'
];
const elements = Object.fromEntries(elementIds.map(id => [id, { value: '', checked: false, style: {}, innerHTML: '' }]));
for (const field of ['businessName', 'ownerName', 'address', 'cityRow', 'phone', 'email', 'hst']) {
  elements[`hide_${field}`] = { checked: false };
}
const saveButton = { disabled: false, innerHTML: '' };
let savedProfile;

const context = {
  document: {
    getElementById: id => elements[id] || null,
    querySelector: selector => selector === '.btn-save' ? saveButton : null
  },
  localStorage: { setItem() {} },
  saveBusinessProfile: async profile => {
    savedProfile = structuredClone(profile);
    return { data: profile };
  },
  setTimeout() {}
};
vm.createContext(context);
vm.runInContext([
  extractFunction(settings, 'applyProfileToForm'),
  extractFunction(settings, 'getHiddenProfileFieldsFromForm'),
  extractFunction(settings, 'saveProfile')
].join('\n'), context);

(async () => {
  const unchangedLegacyValue = '  GB-VAT/Legacy 98 76  ';
  context.applyProfileToForm({ hstNumber: unchangedLegacyValue });
  assert.strictEqual(elements.bizHst.value, unchangedLegacyValue, 'load should preserve a legacy tax ID exactly');

  await context.saveProfile();
  assert.strictEqual(savedProfile.hst_number, unchangedLegacyValue, 'save should not trim, normalize, or validate the tax ID');

  elements.bizHst.value = '';
  context.applyProfileToForm(savedProfile);
  assert.strictEqual(elements.bizHst.value, unchangedLegacyValue, 'save/load round-trip should preserve the tax ID exactly');

  assert(onboarding.includes("hstNumber: document.getElementById('hstNumber').value"));
  assert(onboarding.includes("['hst_number', 'hstNumber', 'gst_number', 'gstNumber', 'tax_number', 'taxNumber']"));

  console.log('Tax-ID copy and unchanged-value round-trip checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
