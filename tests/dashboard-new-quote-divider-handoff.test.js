const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

function sourceFunction(name) {
  const starts = [
    dashboard.indexOf('        function ' + name + '('),
    dashboard.indexOf('        async function ' + name + '(')
  ].filter((index) => index >= 0);
  assert(starts.length, name + ' should exist in dashboard.html');
  const start = Math.min(...starts);
  const openingBrace = dashboard.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < dashboard.length; index += 1) {
    if (dashboard[index] === '{') depth += 1;
    if (dashboard[index] === '}') depth -= 1;
    if (depth === 0) return dashboard.slice(start, index + 1);
  }
  throw new Error('Could not extract ' + name);
}

assert(
  dashboard.indexOf('await hideNewQuoteModalForDividerPrompt()') <
    dashboard.indexOf('await askQuoteDividerForNewQuote()'),
  'New Quote should finish hiding before the divider wording prompt opens'
);
assert(
  sourceFunction('settleQuoteDividerPrompt').includes("hidden.bs.modal") &&
    sourceFunction('settleQuoteDividerPrompt').includes('resolve(value)'),
  'The divider choice should resolve only after its modal finishes hiding'
);
assert(
  sourceFunction('createAndOpenQuote').includes('showNewQuoteModalAfterDividerPrompt()'),
  'Cancel and save-error paths should restore the unchanged New Quote form'
);

function makeElement(id, value) {
  const classes = new Set();
  const listeners = Object.create(null);
  return {
    id,
    value: value || '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    attributes: {},
    classList: {
      contains(name) { return classes.has(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); }
    },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((candidate) => candidate !== listener);
    },
    dispatch(type) {
      (listeners[type] || []).slice().forEach((listener) => listener());
    },
    setAttribute(name, attributeValue) { this.attributes[name] = attributeValue; },
    focus() { focused.push(id); }
  };
}

const focused = [];
const events = [];
const saves = [];
const stored = [];
let dividerPromptMode = 'ask';
let saveError = null;
let nextSavedId = 1;

const elements = {
  newQuoteModal: makeElement('newQuoteModal'),
  quoteDividerPromptModal: makeElement('quoteDividerPromptModal'),
  quoteDividerPromptError: makeElement('quoteDividerPromptError'),
  quoteDividerPromptSingular: makeElement('quoteDividerPromptSingular', 'Room'),
  quoteDividerPromptPlural: makeElement('quoteDividerPromptPlural', 'Rooms'),
  newQuoteClientName: makeElement('newQuoteClientName', 'Test Client'),
  newQuoteAddress: makeElement('newQuoteAddress', '123 Main St'),
  newQuoteClientEmail: makeElement('newQuoteClientEmail', 'test@example.com'),
  newQuoteClientPhone: makeElement('newQuoteClientPhone', '905-555-0100'),
  newQuoteNumber: makeElement('newQuoteNumber', ''),
  newQuoteFileName: makeElement('newQuoteFileName', 'Test Project'),
  newQuoteError: makeElement('newQuoteError'),
  newQuoteCreateBtn: makeElement('newQuoteCreateBtn')
};

const modalInstances = Object.create(null);
function modalFor(element) {
  if (!modalInstances[element.id]) {
    modalInstances[element.id] = {
      show() {
        events.push({
          action: 'show',
          id: element.id,
          newQuoteStillVisible: elements.newQuoteModal.classList.contains('show')
        });
        element.classList.add('show');
      },
      hide() {
        events.push({ action: 'hide', id: element.id });
        element.classList.remove('show');
        element.dispatch('hidden.bs.modal');
      }
    };
  }
  return modalInstances[element.id];
}

const context = {
  allQuotes: [],
  document: {
    body: { classList: { remove() {} } },
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; }
  },
  bootstrap: {
    Modal: {
      getOrCreateInstance: modalFor,
      getInstance: modalFor
    }
  },
  getNewQuoteClientDraft() {
    return {
      name: elements.newQuoteClientName.value.trim(),
      address: elements.newQuoteAddress.value.trim(),
      email: elements.newQuoteClientEmail.value.trim(),
      phone: elements.newQuoteClientPhone.value.trim()
    };
  },
  findNewQuoteClientByName() { return null; },
  findDashboardClientByEmail() { return null; },
  async maybePromptSaveNewQuoteClient() {},
  getDashboardQuoteDividerPrefs() {
    return { dividerPromptMode, singular: 'Room', plural: 'Rooms' };
  },
  setQuoteDividerPromptFields(singular, plural) {
    elements.quoteDividerPromptSingular.value = singular;
    elements.quoteDividerPromptPlural.value = plural;
  },
  normalizeDashboardQuoteDividerLabel(value, fallback) {
    return String(value || '').trim() || fallback;
  },
  async saveQuoteToSupabase(payload) {
    events.push({ action: 'save', id: 'quote' });
    saves.push(payload);
    if (saveError) return { data: null, error: { message: saveError } };
    return { data: { id: 'saved-' + nextSavedId++ }, error: null };
  },
  localStorage: {
    setItem(key, value) { stored.push([key, value]); }
  },
  setTimeout(callback) { callback(); return 1; },
  console
};
context.window = context;
context.location = { href: '' };
context._newQuoteSelectedClient = null;

vm.createContext(context);
vm.runInContext([
  'hideNewQuoteModalForDividerPrompt',
  'showNewQuoteModalAfterDividerPrompt',
  'settleQuoteDividerPrompt',
  'askQuoteDividerForNewQuote',
  'confirmQuoteDividerPrompt',
  'cancelQuoteDividerPrompt',
  'createAndOpenQuote'
].map(sourceFunction).join('\n'), context);

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function resetScenario() {
  events.length = 0;
  focused.length = 0;
  elements.newQuoteModal.classList.add('show');
  elements.quoteDividerPromptModal.classList.remove('show');
  elements.newQuoteCreateBtn.disabled = false;
  elements.newQuoteCreateBtn.innerHTML = 'Create';
  elements.newQuoteError.textContent = '';
  elements.newQuoteError.innerHTML = '';
  elements.newQuoteClientName.value = 'Test Client';
  elements.newQuoteFileName.value = 'Test Project';
  context.location.href = '';
  context._quoteDividerPromptResolve = null;
  saveError = null;
  dividerPromptMode = 'ask';
}

(async () => {
  resetScenario();
  const confirmedCreation = context.createAndOpenQuote();
  await flushPromises();

  const hideNewIndex = events.findIndex((event) => event.action === 'hide' && event.id === 'newQuoteModal');
  const showDividerIndex = events.findIndex((event) => event.action === 'show' && event.id === 'quoteDividerPromptModal');
  assert(hideNewIndex >= 0 && showDividerIndex > hideNewIndex, 'New Quote should hide before the divider prompt shows');
  assert.strictEqual(events[showDividerIndex].newQuoteStillVisible, false, 'The divider prompt must not be covered by New Quote');
  assert.strictEqual(saves.length, 0, 'The quote row should not be created before wording is confirmed');

  elements.quoteDividerPromptSingular.value = 'Phase';
  elements.quoteDividerPromptPlural.value = 'Phases';
  context.confirmQuoteDividerPrompt();
  await confirmedCreation;

  const hideDividerIndex = events.findIndex((event) => event.action === 'hide' && event.id === 'quoteDividerPromptModal');
  const saveIndex = events.findIndex((event) => event.action === 'save');
  assert(hideDividerIndex >= 0 && saveIndex > hideDividerIndex, 'The quote should save only after the wording modal is fully hidden');
  assert.strictEqual(saves.length, 1, 'Confirming divider wording should create exactly one quote');
  assert.strictEqual(saves[0].dividerSingular, 'Phase');
  assert.strictEqual(saves[0].dividerPlural, 'Phases');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(saves[0].data.quoteDividerLabels)), { singular: 'Phase', plural: 'Phases' });
  assert.strictEqual(context.location.href, 'quote-builder.html?load=saved-1');

  resetScenario();
  elements.newQuoteClientName.value = 'Preserved Client';
  elements.newQuoteFileName.value = 'Preserved File Name';
  const saveCountBeforeCancel = saves.length;
  const cancelledCreation = context.createAndOpenQuote();
  await flushPromises();
  context.cancelQuoteDividerPrompt();
  await cancelledCreation;

  assert.strictEqual(saves.length, saveCountBeforeCancel, 'Cancelling wording should not create a quote row');
  assert(elements.newQuoteModal.classList.contains('show'), 'Cancelling wording should reopen New Quote');
  assert.strictEqual(elements.newQuoteClientName.value, 'Preserved Client', 'Cancel should preserve the client name');
  assert.strictEqual(elements.newQuoteFileName.value, 'Preserved File Name', 'Cancel should preserve the file name');
  assert.strictEqual(elements.newQuoteCreateBtn.disabled, false);
  assert(elements.newQuoteCreateBtn.innerHTML.includes('Create & Open Builder'));

  resetScenario();
  saveError = 'Network unavailable';
  const failedCreation = context.createAndOpenQuote();
  await flushPromises();
  context.confirmQuoteDividerPrompt();
  await failedCreation;

  assert(elements.newQuoteModal.classList.contains('show'), 'Save errors after wording should reopen New Quote');
  assert.strictEqual(elements.newQuoteError.textContent, 'Error: Network unavailable');
  assert.strictEqual(context.location.href, '');

  resetScenario();
  dividerPromptMode = 'default';
  const defaultCreation = context.createAndOpenQuote();
  await defaultCreation;
  assert(!events.some((event) => event.action === 'show' && event.id === 'quoteDividerPromptModal'), 'Default mode should keep the existing no-prompt flow');
  assert.strictEqual(context.location.href, 'quote-builder.html?load=saved-2');

  console.log('dashboard new quote divider modal handoff test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
