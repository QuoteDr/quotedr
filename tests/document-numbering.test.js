const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadNumbering(quotePrefs = {}) {
  const values = new Map([['ald_quote_prefs', JSON.stringify(quotePrefs)]]);
  const window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    dispatchEvent() {},
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  const context = vm.createContext({ window, localStorage: window.localStorage, CustomEvent: window.CustomEvent, console });
  vm.runInContext(fs.readFileSync('document-numbering.js', 'utf8'), context);
  return window.QuoteDrDocumentNumbers;
}

const numbering = loadNumbering();
const base = numbering.normalize({ companyCode: ' ald! ', companyCodePosition: 'suffix' });

assert.equal(numbering.format(base, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'Q-2026-C0042-007-ALD');
assert.equal(numbering.format(base, { documentType: 'invoice', year: 2026, clientNumber: 42, sequence: 7 }), 'I-2026-C0042-007-ALD');
assert.equal(numbering.format(base, { documentType: 'change_order', year: 2026, clientNumber: 42, sequence: 7 }), 'CO-2026-C0042-007-ALD');
assert.equal(numbering.format(base, { documentType: 'revision', year: 2026, clientNumber: 42, sequence: 7 }), 'R-2026-C0042-007-ALD');
assert.equal(numbering.clientLabel(42, base), 'C0042');

assert.equal(numbering.format({ ...base, companyCodePosition: 'prefix' }, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'ALD-Q-2026-C0042-007');
assert.equal(numbering.format({ ...base, companyCodePosition: 'none' }, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'Q-2026-C0042-007');
assert.equal(numbering.format({ ...base, formatStyle: 'client_first' }, { documentType: 'invoice', year: 2026, clientNumber: 42, sequence: 7 }), 'C0042-I-2026-007-ALD');
assert.equal(numbering.format({ ...base, yearStyle: 'two_digit' }, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'Q-26-C0042-007-ALD');
assert.equal(numbering.format({ ...base, yearStyle: 'none' }, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'Q-C0042-007-ALD');
assert.equal(numbering.format({ ...base, clientPadding: 2, sequencePadding: 5 }, { documentType: 'quote', year: 2026, clientNumber: 42, sequence: 7 }), 'Q-2026-C42-00007-ALD');
assert.equal(numbering.cleanCompanyCode(' A-L_D direct! '), 'ALDDIRECT');

const legacy = loadNumbering({ prefix: 'ald', showPrefix: true }).current();
assert.equal(legacy.companyCode, 'ALD');
assert.equal(legacy.companyCodePosition, 'prefix');

console.log('document numbering format checks passed');
