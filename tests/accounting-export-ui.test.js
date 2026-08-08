const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor(tagName, id) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.indeterminate = false;
    this.parentNode = null;
    this.listeners = {};
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
  }
}

function createHarness(options = {}) {
  const registry = new Map();
  const all = [];
  function add(id, tagName = 'div') {
    const node = new FakeElement(tagName, id);
    registry.set(id, node);
    all.push(node);
    return node;
  }

  [
    'accountingExportMessage', 'accountingExportDocumentList', 'accountingExportSelectionCount',
    'accountingExportOwnerSection', 'accountingTransactionExportModal'
  ].forEach(id => add(id));
  ['accountingExportFromDate', 'accountingExportToDate'].forEach(id => add(id, 'input'));
  ['accountingExportFindBtn', 'accountingExportDownloadBtn'].forEach(id => add(id, 'button'));
  add('accountingExportSelectAll', 'input');

  ['accepted_quote', 'invoice_issued', 'invoice_partially_paid', 'invoice_paid'].forEach((status, index) => {
    const input = add('status-' + index, 'input');
    input.value = status;
    input.checked = true;
    input.setAttribute('data-accounting-export-status', '');
  });

  const document = {
    body: add('body', 'body'),
    getElementById(id) { return registry.get(id) || null; },
    createElement(tagName) {
      const node = new FakeElement(tagName);
      all.push(node);
      return node;
    },
    querySelectorAll(selector) {
      if (selector === '[data-accounting-export-status]:checked') {
        return all.filter(node => node.checked && node.getAttribute('data-accounting-export-status') !== null);
      }
      if (selector === '[data-accounting-export-document]') {
        return all.filter(node => node.getAttribute('data-accounting-export-document') !== null && node.parentNode);
      }
      return [];
    },
    addEventListener() {}
  };

  const alerts = [];
  let invoked = 0;
  const owner = options.owner !== false;
  const response = options.response || { data: { data: { documents: [], truncated: false, limit: 500 } }, error: null };
  const context = {
    window: null,
    globalThis: null,
    document,
    console,
    Intl,
    Date,
    Array,
    Object,
    String,
    Number,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    alert(message) { alerts.push(String(message)); },
    qdAlert(message) { alerts.push(String(message)); },
    addEventListener() {},
    QuoteDrAccount: {
      async init() {},
      snapshot() {
        return {
          user: { id: 'signed-in-user' },
          active: { accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: owner ? 'signed-in-user' : 'another-user' }
        };
      }
    },
    _supabase: {
      functions: {
        async invoke() {
          invoked += 1;
          return response;
        }
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('accounting-export-ui.js', 'utf8'), context);
  return { context, registry, alerts, invoked: () => invoked };
}

(async function() {
  const blocked = createHarness({ owner: false });
  await blocked.context.QuoteDrAccountingExportUI.open();
  assert.equal(blocked.invoked(), 0, 'non-owner UI must not call the accounting API');
  assert.deepEqual(blocked.alerts, ['Accounting exports are available only to the account owner.']);

  const empty = createHarness();
  await empty.context.QuoteDrAccountingExportUI.loadDocuments();
  assert.equal(empty.invoked(), 1);
  assert.equal(empty.registry.get('accountingExportMessage').textContent, 'No accepted quotes or issued invoices match these dates and statuses.');
  assert.equal(empty.registry.get('accountingExportDownloadBtn').disabled, true);
  assert(empty.registry.get('accountingExportDocumentList').children.some(child => child.textContent === '' || child.children.length), 'empty state should render without throwing');

  const failed = createHarness({ response: { data: null, error: { message: 'network unavailable', code: 'failed' } } });
  await failed.context.QuoteDrAccountingExportUI.loadDocuments();
  assert.match(failed.registry.get('accountingExportMessage').textContent, /network unavailable.*No data was changed\./);
  assert.equal(failed.registry.get('accountingExportDownloadBtn').disabled, true);

  console.log('accounting export UI empty, error, and owner-boundary tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
