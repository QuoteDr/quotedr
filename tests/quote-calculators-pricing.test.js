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

console.log('quote-calculators pricing setup test passed');
