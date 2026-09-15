const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('quote-items.js', 'utf8');
const fn = source.slice(source.indexOf('async function addNewCategory()'), source.indexOf('async function addNewUnitType()'));
async function run(name, error = null) {
  let saved, toast;
  const ctx = { pricingDatabase: {}, customItems: {}, window: {},
    qdPrompt: async () => name, qdAlert: async () => {},
    populateNewItemCategorySelect() {}, renderAllItemsList() {},
    saveCustomItems: async () => { saved = JSON.parse(JSON.stringify(ctx.customItems)); return {error}; },
    showManageItemsToast: (...args) => { toast = args; }
  };
  vm.createContext(ctx); vm.runInContext(fn, ctx);
  await ctx.addNewCategory(); return {ctx, saved, toast};
}
(async () => {
  const good = await run('Materials');
  assert.deepEqual(good.saved, {Materials: []});
  assert.equal(good.toast[1], true);
  const offline = await run('Materials', 'offline');
  assert.deepEqual(offline.saved, {Materials: []});
  assert.equal(offline.toast[1], false);
  assert.match(offline.toast[0], /not confirmed/);
  assert.equal((await run('')).saved, undefined);
  assert.equal((await run('__proto__')).saved, undefined);
  console.log('empty category save behavior passed');
})();
