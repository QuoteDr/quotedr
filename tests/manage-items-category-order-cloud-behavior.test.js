const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('quote-items.js', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

function createLocalStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    clear() { values.clear(); }
  };
}

(async function run() {
  let cloudValue = null;
  const localStorage = createLocalStorage({
    ald_manage_items_category_order_mode: 'custom',
    ald_manage_items_category_custom_order: JSON.stringify(['Demolition', 'Framing', 'Electrical'])
  });
  const context = vm.createContext({
    console,
    Date,
    Set,
    localStorage,
    renderAllItemsList() {},
    renderRooms() {},
    async saveUserDataValue(key, value) {
      assert.equal(key, 'manage_items_category_order');
      cloudValue = JSON.parse(JSON.stringify(value));
      return { state: 'cloud_saved' };
    },
    async loadUserDataValue(key) {
      assert.equal(key, 'manage_items_category_order');
      return { data: cloudValue };
    }
  });

  vm.runInContext([
    "var MANAGE_CATEGORY_ORDER_MODE_KEY = 'ald_manage_items_category_order_mode';",
    "var MANAGE_CATEGORY_CUSTOM_ORDER_KEY = 'ald_manage_items_category_custom_order';",
    "var MANAGE_CATEGORY_ORDER_UPDATED_AT_KEY = 'ald_manage_items_category_order_updated_at';",
    "var MANAGE_CATEGORY_ORDER_CLOUD_KEY = 'manage_items_category_order';",
    "var manageItemsCategoryOrderMode = 'alphabetical';",
    'var manageItemsCategoryCustomOrder = [];',
    extractFunction('loadManageCategoryOrderState'),
    extractFunction('getManageCategoryOrderUpdatedAt'),
    extractFunction('getManageItemsCategoryOrderMode'),
    extractFunction('getManageCategoryOrderSnapshot'),
    extractFunction('persistManageCategoryOrderState'),
    extractFunction('_saveManageCategoryOrderToCloud'),
    extractFunction('_restoreManageCategoryOrderFromCloud'),
    'this.loadLocal = loadManageCategoryOrderState;',
    'this.restoreCloud = _restoreManageCategoryOrderFromCloud;',
    "this.readState = function() { return { mode: manageItemsCategoryOrderMode, order: manageItemsCategoryCustomOrder.slice() }; };",
    "this.resetState = function() { manageItemsCategoryOrderMode = 'alphabetical'; manageItemsCategoryCustomOrder = []; };"
  ].join('\n'), context);

  context.loadLocal();
  await context.restoreCloud();
  assert.equal(cloudValue.mode, 'custom', 'legacy browser-only mode should migrate to the account');
  assert.deepEqual(cloudValue.order, ['Demolition', 'Framing', 'Electrical']);
  assert(cloudValue.updatedAt, 'migrated account snapshot should be timestamped');

  localStorage.clear();
  context.resetState();
  context.loadLocal();
  await context.restoreCloud();
  const restored = context.readState();
  assert.equal(restored.mode, 'custom', 'a second browser should restore the account mode');
  assert.deepEqual(Array.from(restored.order), ['Demolition', 'Framing', 'Electrical']);
  assert.equal(localStorage.getItem('ald_manage_items_category_order_mode'), 'custom');

  console.log('manage items category order cloud behavior test passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
