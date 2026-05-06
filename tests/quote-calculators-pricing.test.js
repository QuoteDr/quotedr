const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-calculators.js'), 'utf8');

function createElement(id) {
  return {
    id,
    value: '',
    style: {},
    innerHTML: '',
    textContent: '',
    checked: false,
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    }
  };
}

function createContext() {
  const elements = {};
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements[id]) elements[id] = createElement(id);
      return elements[id];
    },
    querySelector() {
      return null;
    },
    createElement(tag) {
      const el = createElement(tag);
      el.tagName = tag.toUpperCase();
      return el;
    },
    body: {
      appendChild() {}
    }
  };

  const context = {
    console,
    document,
    localStorage: {
      getItem() {
        return '{}';
      },
      setItem() {}
    },
    bootstrap: {},
    rooms: [],
    customItems: {
      Painting: [
        { name: 'Ceiling Paint Labour', rate: 2.25, unitType: 'sq ft' },
        { name: 'Wall Paint Labour', rate: 1.85, unitType: 'sq ft' }
      ],
      'Trim & Millwork': [
        { name: 'Baseboard Install', rate: 6.5, unitType: 'LF' }
      ]
    },
    setTimeout(fn) {
      fn();
    }
  };
  context.bootstrap.Modal = function Modal() {
    return { show() {}, hide() {} };
  };
  context.bootstrap.Modal.getInstance = function getInstance() {
    return { hide() {} };
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, elements };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { context, elements } = createContext();
context.openEstimatorPricing({ preventDefault() {}, stopPropagation() {} });

const html = elements.estPricingRows.innerHTML;
assert(html.includes('data-estimator-item-search="flooring"'), 'pricing setup should render searchable item inputs for each estimator field');
assert(html.includes('<optgroup label="Painting">'), 'pricing setup should group saved items by category');
assert(html.includes('Ceiling Paint Labour'), 'pricing setup should list saved user items');
assert(html.includes('oninput="filterEstimatorPricingItems'), 'search input should narrow the item dropdown');

const roomFallback = createContext();
roomFallback.context.customItems = {};
roomFallback.context.rooms = [{
  name: 'Kitchen',
  items: [
    { description: 'Filler piece', category: 'Millwork & Cabinets', quantity: 4, unitType: 'each', rate: 56, total: 224 },
    { description: 'Floor tile install', category: 'Tile', quantity: 120, unitType: 'sqft', rate: 12, total: 1440 }
  ]
}];
roomFallback.context.openEstimatorPricing({ preventDefault() {}, stopPropagation() {} });
const fallbackHtml = roomFallback.elements.estPricingRows.innerHTML;
assert(fallbackHtml.includes('Filler piece'), 'pricing setup should include priced items from the current quote when saved items are unavailable');
assert(fallbackHtml.includes('<optgroup label="Current Quote">'), 'current quote fallback items should be grouped separately');

console.log('quote-calculators pricing setup test passed');
