const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-calculators.js'), 'utf8');
const quoteBuilder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

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
  baseboard: { enabled: false },
  crownMolding: { enabled: false },
  doorCasing: { enabled: false },
  windowCasing: { enabled: false },
  drywall: { rate: 1, enabled: true }
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

function fillRoom() {
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
}

function drywallQtyFromResults() {
  const match = elements.estResultsBody.innerHTML.match(/data-name="Drywall - Test Room"[^>]*data-qty="([^"]+)"/);
  return match ? Number(match[1]) : null;
}

if (!quoteBuilder.includes('id="estCeilingDrywall"') || !quoteBuilder.includes('Include ceiling drywall')) {
  throw new Error('Quick Room Quoter modal should include an Include ceiling drywall checkbox');
}

document.getElementById('estCeilingDrywallWrap').style.display = 'sentinel';
document.getElementById('estCeilingDrywall').checked = false;
context.openMaterialEstimator();

if (elements.estCeilingDrywallWrap.style.display === 'none' || elements.estCeilingDrywallWrap.style.display === 'sentinel') {
  throw new Error('ceiling drywall option should show when drywall is enabled in pricing setup');
}
if (!elements.estCeilingDrywall.checked) {
  throw new Error('ceiling drywall option should default to checked when visible');
}

fillRoom();
elements.estCeilingDrywall.checked = true;
context.calculateEstimate();
if (drywallQtyFromResults() !== 437) {
  throw new Error('ceiling drywall checked should include wall and ceiling drywall area');
}

fillRoom();
elements.estCeilingDrywall.checked = false;
context.calculateEstimate();
if (drywallQtyFromResults() !== 317) {
  throw new Error('ceiling drywall unchecked should include wall drywall area only');
}

savedPricing = { drywall: { rate: 1, enabled: false } };
context.openMaterialEstimator();
if (elements.estCeilingDrywallWrap.style.display !== 'none') {
  throw new Error('ceiling drywall option should hide when drywall is disabled in pricing setup');
}

console.log('quick room quoter ceiling drywall test passed');
