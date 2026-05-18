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
    classList: { remove() {}, add() {} }
  };
}

const elements = {};
const document = {
  addEventListener() {},
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
  flooring: { rate: 1, enabled: true },
  wallPaint: { rate: 1, enabled: true },
  ceilingPaint: { rate: 1, enabled: true },
  baseboard: { rate: 1, enabled: false },
  doorCasing: { rate: 1, enabled: false },
  windowCasing: { rate: 1, enabled: false },
  drywall: { rate: 1, enabled: true },
  crownMolding: { rate: 1, enabled: false }
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
    setItem(key, value) {
      if (key === 'ald_estimator_pricing') savedPricing = JSON.parse(value);
    }
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

document.getElementById('estRoomName').value = 'Test Room';
document.getElementById('estWidth').value = '10';
document.getElementById('estLength').value = '12';
document.getElementById('estDoors').value = '1';
document.getElementById('estWindows').value = '1';
document.getElementById('estFloorWaste').value = '0';
document.getElementById('estPaintDeductOpenings').checked = true;
document.getElementById('estCeilingPaint').checked = true;
document.getElementById('estWallPaintWaste').value = '0';
document.getElementById('ceil8').value = '8';
document.getElementById('ceil8').checked = true;

context.calculateEstimate();

const html = elements.estResultsBody.innerHTML;

if (!html.includes('data-name="Drywall - Test Room"')) {
  throw new Error('enabled drywall should be included in Quick Room Quoter results');
}
if (html.includes('data-name="Crown Molding - Test Room"')) {
  throw new Error('disabled crown molding should be skipped until Use is turned back on');
}
if (html.includes('data-name="Baseboard - Test Room"')) {
  throw new Error('disabled baseboard should be skipped until Use is turned back on');
}

savedPricing = {};
context.openEstimatorPricing();
const pricingHtml = elements.estPricingRows.innerHTML;

if (!pricingHtml.includes('id="epUse_drywall"') || !pricingHtml.includes('id="epUse_crownMolding"')) {
  throw new Error('pricing setup should render Use toggles for new quoter outputs');
}
if (!pricingHtml.includes('Drywall') || !pricingHtml.includes('Crown Molding')) {
  throw new Error('pricing setup should include drywall and crown molding outputs');
}
if (!pricingHtml.includes('checked')) {
  throw new Error('new quoter output Use toggles should default to checked');
}

console.log('quick room quoter use-fields test passed');
