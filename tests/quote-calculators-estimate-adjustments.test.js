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

const context = {
  console,
  document,
  localStorage: {
    getItem(key) {
      if (key === 'ald_estimator_pricing') {
        return JSON.stringify({
          flooring: { rate: 1 },
          wallPaint: { rate: 1 },
          ceilingPaint: { rate: 1 },
          baseboard: { rate: 1 },
          doorCasing: { rate: 1 },
          windowCasing: { rate: 1 }
        });
      }
      return '{}';
    },
    setItem() {}
  },
  bootstrap: { Modal: function Modal() { return { show() {}, hide() {} }; } },
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
document.getElementById('estLength').value = '10';
document.getElementById('estDoors').value = '1';
document.getElementById('estWindows').value = '1';
document.getElementById('estFloorWaste').value = '10';
document.getElementById('estPaintDeductOpenings').checked = true;
document.getElementById('estCeilingPaint').checked = true;
document.getElementById('estWallPaintWaste').value = '0';
document.getElementById('ceil8').value = '8';
document.getElementById('ceil8').checked = true;

context.calculateEstimate();

const html = elements.estResultsBody.innerHTML;
if (!html.includes('data-name="Flooring - Test Room" data-unit="sqft" data-qty="110"')) {
  throw new Error('flooring row should include 10% waste');
}
if (!html.includes('data-name="Wall Paint - Test Room" data-unit="sqft" data-qty="285"')) {
  throw new Error('wall paint row should deduct one door and one window opening');
}
if (!html.includes('10% waste added')) {
  throw new Error('flooring adjustment should explain waste in notes');
}
if (!html.includes('35 sqft openings deducted')) {
  throw new Error('wall paint adjustment should explain opening deductions');
}

console.log('quote-calculators estimate adjustment test passed');
