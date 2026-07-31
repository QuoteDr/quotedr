const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const items = read('quote-items.js');
const edgeFunction = read('supabase/functions/ai-assistant/index.ts');
const helperStart = items.indexOf('function buildAiDescriptionPrompt');
const dialogStart = items.indexOf('function openAiDescriptionModeDialog');

assert(helperStart >= 0 && dialogStart > helperStart, 'AI description helpers should precede the choice dialog');

const context = {};
vm.createContext(context);
vm.runInContext(
  items.slice(helperStart, dialogStart) +
    '\nthis.buildAiDescriptionPrompt = buildAiDescriptionPrompt;' +
    '\nthis.normalizeAiDescriptionReply = normalizeAiDescriptionReply;' +
    '\nthis.aiDescriptionModeChoiceMarkup = aiDescriptionModeChoiceMarkup;' +
    '\nthis.aiDescriptionModeCreateMarkup = aiDescriptionModeCreateMarkup;',
  context
);

const notes = 'install vanity and reconnect plumbing';
const originalPrompt =
  'Improve this renovation line item description so it is clear, professional, client-friendly, and concise. Return only the improved description, no heading or quotes.\n\nDescription: ' +
  notes;
const refinePrompt = context.buildAiDescriptionPrompt('refine_existing', notes);
const createPrompt = context.buildAiDescriptionPrompt('create_from_task', notes);
const choiceMarkup = context.aiDescriptionModeChoiceMarkup();
const createMarkup = context.aiDescriptionModeCreateMarkup();

assert(refinePrompt === originalPrompt, 'existing AI Refine prompt must remain unchanged');
assert(createPrompt.includes('Create a strong renovation line item description'), 'creation mode should request a complete description');
assert(createPrompt.includes('Task details or rough notes: ' + notes), 'creation mode should send task notes');
assert(createPrompt.includes('do not invent materials, measurements, quantities, pricing, warranties, or work'), 'creation mode should constrain unsupported details');
assert(createPrompt !== refinePrompt, 'creation and refinement prompts should be distinct');
assert(context.normalizeAiDescriptionReply('"Polished description"') === 'Polished description', 'normalizer should remove double quotes');
assert(context.normalizeAiDescriptionReply("'Polished description'") === 'Polished description', 'normalizer should remove single quotes');

assert(choiceMarkup.includes("Refine what I've written"), 'dialog should expose the existing refine path');
assert(choiceMarkup.includes('Describe the task to create the description'), 'dialog should expose the creation path');
assert(choiceMarkup.includes('data-ai-description-mode="refine_existing"'), 'refine choice should use an explicit mode');
assert(choiceMarkup.includes('data-ai-description-mode="create_from_task"'), 'create choice should use an explicit mode');
assert(choiceMarkup.includes('col-12 col-md-6'), 'choices should stack on mobile and share a row on desktop');
assert(createMarkup.includes('aria-live="polite"'), 'task validation should be announced accessibly');
assert(createMarkup.includes('form id="aiDescriptionCreateForm"'), 'creation input should be keyboard-submittable');

const refineFunction = items.slice(
  items.indexOf('async function refineDescription'),
  items.indexOf('function toggleRefinedDescription')
);
assert(refineFunction.indexOf('await openAiDescriptionModeDialog') < refineFunction.indexOf("requireProFeature('ai_refine'"), 'choice should happen before the usage gate');
assert(refineFunction.includes("if (!request.sourceText.trim()) { qdAlert('Please enter a description first.'); return; }"), 'empty refine input should retain current validation');
assert(refineFunction.includes("body: JSON.stringify({ feature: 'ai_refine', refineMode: request.mode"), 'client should send mode in the existing usage bucket');

assert(edgeFunction.includes("refineMode === 'create_from_task'"), 'Edge Function should allowlist creation mode');
assert(edgeFunction.includes(": 'refine_existing'"), 'missing or unknown modes should default to refinement');
assert(edgeFunction.includes('turn contractor task details and rough notes into complete, polished'), 'creation mode should have distinct generation intent');
assert(edgeFunction.includes("Keep the user\\'s meaning, make it clear and professional"), 'backend rewrite semantics should remain intact');
assert(edgeFunction.includes("feature === 'ai_refine'"), 'both modes should retain the AI Refine policy');

class FakeClassList {
  constructor(classes) {
    this.values = new Set(String(classes || '').split(/\s+/).filter(Boolean));
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(id, classes) {
    this.id = id;
    this.classList = new FakeClassList(classes);
    this.listeners = {};
    this.attributes = {};
    this.value = '';
    this.removed = false;
  }

  addEventListener(type, listener, options) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push({ listener, once: !!(options && options.once) });
  }

  dispatch(type, event) {
    const payload = event || {};
    if (!payload.preventDefault) payload.preventDefault = function() {};
    (this.listeners[type] || []).slice().forEach(entry => entry.listener(payload));
    this.listeners[type] = (this.listeners[type] || []).filter(entry => !entry.once);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  closest(selector) {
    return selector === '[data-ai-description-mode]' && this.attributes['data-ai-description-mode'] ? this : null;
  }

  focus() {
    this.owner.activeId = this.id;
  }

  setSelectionRange() {}

  requestSubmit() {
    this.dispatch('submit');
  }

  remove() {
    this.removed = true;
  }
}

function createDialogHarness() {
  const state = { elements: {}, activeId: '' };

  function add(id, classes) {
    const element = new FakeElement(id, classes);
    element.owner = state;
    state.elements[id] = element;
    return element;
  }

  const document = {
    body: {
      insertAdjacentHTML(position, markup) {
        assert(position === 'beforeend', 'dialog should append to the document body');
        assert(markup.includes('aiDescriptionModeModal'), 'dialog markup should include its modal root');
        state.elements = {};
        const modal = add('aiDescriptionModeModal');
        const refineChoice = add('aiDescriptionRefineChoice');
        const createChoice = add('aiDescriptionCreateChoice');
        refineChoice.setAttribute('data-ai-description-mode', 'refine_existing');
        createChoice.setAttribute('data-ai-description-mode', 'create_from_task');
        modal.querySelector = selector =>
          selector.includes('refine_existing') ? refineChoice : createChoice;
        add('aiDescriptionModeTitle');
        add('aiDescriptionChoicePane');
        add('aiDescriptionCreatePane', 'd-none');
        add('aiDescriptionCreateForm');
        add('aiDescriptionTaskNotes');
        add('aiDescriptionBackBtn', 'd-none');
        add('aiDescriptionCreateBtn', 'd-none');
      }
    },
    getElementById(id) {
      return state.elements[id] || null;
    }
  };

  return {
    document,
    get(id) {
      return state.elements[id];
    },
    activeId() {
      return state.activeId;
    }
  };
}

class FakeBootstrapModal {
  constructor(element) {
    this.element = element;
  }

  show() {
    this.element.dispatch('shown.bs.modal');
  }

  hide() {
    this.element.dispatch('hidden.bs.modal');
  }
}

async function runDialogInteractionChecks() {
  const harness = createDialogHarness();
  context.document = harness.document;
  context.bootstrap = { Modal: FakeBootstrapModal };
  context.setTimeout = callback => {
    callback();
    return 1;
  };

  const refineStart = items.indexOf('async function refineDescription');
  vm.runInContext(
    items.slice(dialogStart, refineStart) + '\nthis.openAiDescriptionModeDialog = openAiDescriptionModeDialog;',
    context
  );

  const refineResultPromise = context.openAiDescriptionModeDialog('Existing wording');
  assert(harness.activeId() === 'aiDescriptionRefineChoice', 'dialog should focus the first choice when opened');
  harness.get('aiDescriptionChoicePane').dispatch('click', {
    target: harness.get('aiDescriptionRefineChoice')
  });
  const refineResult = await refineResultPromise;
  assert(refineResult.mode === 'refine_existing', 'refine choice should return refine mode');
  assert(refineResult.sourceText === 'Existing wording', 'refine choice should preserve field text');

  const createResultPromise = context.openAiDescriptionModeDialog('rough starting text');
  harness.get('aiDescriptionChoicePane').dispatch('click', {
    target: harness.get('aiDescriptionCreateChoice')
  });
  assert(harness.get('aiDescriptionChoicePane').classList.contains('d-none'), 'create choice should hide the choice pane');
  assert(!harness.get('aiDescriptionCreatePane').classList.contains('d-none'), 'create choice should reveal task notes');
  assert(harness.get('aiDescriptionTaskNotes').value === 'rough starting text', 'task notes should prefill from the field');
  assert(harness.activeId() === 'aiDescriptionTaskNotes', 'task notes should receive focus');
  assert(harness.get('aiDescriptionModeModal').getAttribute('aria-describedby') === 'aiDescriptionTaskHelp', 'creation pane should expose relevant help text');

  let createResolved = false;
  createResultPromise.then(() => { createResolved = true; });
  harness.get('aiDescriptionTaskNotes').value = '   ';
  harness.get('aiDescriptionCreateForm').requestSubmit();
  await Promise.resolve();
  assert(!createResolved, 'blank task notes should not submit');
  assert(harness.get('aiDescriptionTaskNotes').classList.contains('is-invalid'), 'blank notes should show validation');
  assert(harness.get('aiDescriptionTaskNotes').getAttribute('aria-invalid') === 'true', 'blank notes should expose invalid state');

  harness.get('aiDescriptionTaskNotes').value = 'remove vanity and reconnect plumbing';
  harness.get('aiDescriptionTaskNotes').dispatch('input');
  assert(harness.get('aiDescriptionTaskNotes').getAttribute('aria-invalid') === null, 'valid notes should clear invalid state');
  harness.get('aiDescriptionTaskNotes').dispatch('keydown', {
    ctrlKey: true,
    metaKey: false,
    key: 'Enter'
  });
  const createResult = await createResultPromise;
  assert(createResult.mode === 'create_from_task', 'create choice should return creation mode');
  assert(createResult.sourceText === 'remove vanity and reconnect plumbing', 'creation mode should return trimmed notes');
}

runDialogInteractionChecks()
  .then(() => console.log('AI Refine dual-flow tests passed'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
