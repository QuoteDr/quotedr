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
    parentElement: { querySelector() { return null; } },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    classList: { remove() {}, add() {} }
  };
}

const elements = {};
const document = {
  addEventListener() {},
  createElement() { return createElement('created'); },
  getElementById(id) {
    if (!elements[id]) elements[id] = createElement(id);
    return elements[id];
  },
  querySelector(selector) {
    if (selector === 'input[name="ceilingHeight"]:checked') return elements.ceil8;
    return null;
  },
  querySelectorAll() {
    return [];
  }
};

let savedPricing = {
  flooring: { enabled: false },
  wallPaint: { enabled: false },
  ceilingPaint: { enabled: false },
  drywall: { enabled: false },
  baseboard: { enabled: false },
  crownMolding: { enabled: false },
  doorCasing: { enabled: false },
  windowCasing: { enabled: false },
  framing: { rate: 12, enabled: true }
};

const context = {
  console,
  setTimeout(fn) { fn(); },
  document,
  localStorage: {
    getItem(key) {
      if (key === 'ald_estimator_pricing') return JSON.stringify(savedPricing);
      return '{}';
    },
    setItem() {}
  },
  bootstrap: {
    Modal: Object.assign(function Modal() { return { show() {}, hide() {} }; }, {
      getInstance() { return { hide() {} }; }
    })
  },
  rooms: [],
  qdAlert(message) {
    throw new Error(message);
  },
  getMeasurementSystem() {
    return 'imperial';
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

context.openEstimatorPricing();
const pricingHtml = elements.estPricingRows.innerHTML;

if (!pricingHtml.includes('id="epUse_framing"')) {
  throw new Error('pricing setup should render a Use toggle for Framing');
}
if (!pricingHtml.includes('Framing') || !pricingHtml.includes('per LF')) {
  throw new Error('pricing setup should include Framing as a linear-foot output');
}

document.getElementById('estRoomName').value = 'Test Room';
document.getElementById('estWidth').value = '10';
document.getElementById('estLength').value = '12';
document.getElementById('estDoors').value = '0';
document.getElementById('estWindows').value = '0';
document.getElementById('estFloorWaste').value = '0';
document.getElementById('estWallPaintWaste').value = '0';
document.getElementById('estPaintDeductOpenings').checked = true;
document.getElementById('estCeilingPaint').checked = false;
document.getElementById('estCeilingDrywall').checked = false;
document.getElementById('ceil8').value = '8';
document.getElementById('ceil8').checked = true;

context.calculateEstimate();

const resultHtml = elements.estResultsBody.innerHTML;
if (!resultHtml.includes('data-name="Framing - Test Room"')) {
  throw new Error('enabled Framing should be included in Quick Room Quoter results');
}
if (!resultHtml.includes('data-unit="LF"') || !resultHtml.includes('data-qty="44"') || !resultHtml.includes('data-rate="12"')) {
  throw new Error('Framing should calculate from room perimeter in linear feet');
}

console.log('quick room quoter framing test passed');
