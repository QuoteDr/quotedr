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
    classList: { remove() {}, add() {} },
    appendChild() {}
  };
}

const elements = {};
const estimateRows = [];
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
  querySelectorAll(selector) {
    if (selector === '#estResultsBody tr') return estimateRows;
    return [];
  }
};

const context = {
  console,
  document,
  localStorage: {
    getItem() { return '{}'; },
    setItem() {}
  },
  bootstrap: { Modal: { getInstance() { return { hide() {} }; } } },
  rooms: [{ id: 1, name: 'Kitchen', items: [], notes: '', scopeNotes: '' }],
  renderCount: 0,
  renderRooms() { this.renderCount += 1; },
  showToast() {},
  qdAlert(message) { throw new Error(message); },
  getMeasurementSystem() { return 'imperial'; }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

document.getElementById('estTargetRoom').value = '__new__';
document.getElementById('estResultRoomName').textContent = 'Powder Room';

estimateRows.push({
  dataset: {
    cat: 'Flooring',
    name: 'Vinyl Plank (LVP) Installation',
    itemDescription: 'Install floating LVP flooring.',
    unit: 'sq ft',
    qty: '132',
    rate: '2',
    notes: '10% waste added'
  },
  querySelector(selector) {
    if (selector === '.est-check') return { checked: true };
    return null;
  }
});

(async () => {
  await context.addEstimateToQuote();

  if (context.rooms.length !== 2) {
    throw new Error('add estimate should create a new room when target is __new__');
  }
  const newRoom = context.rooms.find((room) => room.name === 'Powder Room');
  if (!newRoom) {
    throw new Error('new estimator room should use the calculated room name');
  }
  if (context.rooms[0].items.length !== 0) {
    throw new Error('add estimate should not append to the previous room when creating a new room');
  }
  const item = newRoom.items[0];
  if (!item) {
    throw new Error('new estimator room should receive the checked item');
  }
  if (item.description !== 'Vinyl Plank (LVP) Installation') {
    throw new Error('added estimator item should store the visible item name in description');
  }
  if (item.name !== 'Vinyl Plank (LVP) Installation') {
    throw new Error('added estimator item should keep the item name for integrations');
  }
  if (item.itemDescription !== 'Install floating LVP flooring.') {
    throw new Error('added estimator item should preserve saved item descriptions');
  }
  if (item.notes !== '10% waste added') {
    throw new Error('added estimator item should preserve estimator notes');
  }
  console.log('quote-calculators add estimate test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
