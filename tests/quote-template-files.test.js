const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-template-files.js'), 'utf8');

const context = { console };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const template = {
  id: 42,
  name: 'Basement Bathroom',
  rooms: [{
    id: 9,
    name: 'Bathroom',
    markup: 12,
    items: [{
      description: 'Tile floor',
      category: 'Tile',
      quantity: 80,
      unitType: 'sqft',
      rate: 14,
      total: 1120,
      materialCost: 4.25,
      upgrade: { name: 'Large format', rate: 18 }
    }]
  }]
};

const files = context.QuoteDrTemplateFiles;
const noPricing = files.createExportPayload([template], false, { now: '2026-05-05T01:00:00.000Z' });
const exportedItem = noPricing.templates[0].rooms[0].items[0];

assert(noPricing.app === 'QuoteDr', 'payload should identify QuoteDr');
assert(noPricing.type === 'quote-template-pack', 'payload should use a versioned template pack type');
assert(noPricing.includePricing === false, 'payload should record that pricing was stripped');
assert(exportedItem.rate === 0, 'item rate should be blanked when pricing is excluded');
assert(exportedItem.total === 0, 'item total should be blanked when pricing is excluded');
assert(exportedItem.materialCost === 0, 'material cost should be blanked when pricing is excluded');
assert(exportedItem.upgrade.rate === 0, 'upgrade pricing should be blanked when pricing is excluded');
assert(noPricing.templates[0].rooms[0].markup === 0, 'room markup should be blanked when pricing is excluded');

const withPricing = files.createExportPayload([template], true, { now: '2026-05-05T01:00:00.000Z' });
assert(withPricing.templates[0].rooms[0].items[0].rate === 14, 'pricing export should keep item rates');

const imported = files.prepareTemplatesForImport(noPricing, [{ id: 1, name: 'Basement Bathroom', rooms: [] }], { now: 1000 });
assert(imported.length === 1, 'one template should be prepared for import');
assert(imported[0].id === 1000, 'import should assign a fresh id');
assert(imported[0].name === 'Basement Bathroom (Imported)', 'import should avoid name collisions');
assert(imported[0].rooms[0].id === 1001, 'import should assign fresh room ids');

const community = files.createCommunityTemplatePayload(template, {
  description: 'Full bathroom starter scope',
  trade: 'Bathroom Renovation',
  region: 'Ontario',
  jobType: 'Bathroom',
  creatorName: 'Adam',
  now: '2026-05-05T02:00:00.000Z'
});
assert(community.name === 'Basement Bathroom', 'community payload should keep the template name');
assert(community.description === 'Full bathroom starter scope', 'community payload should include description');
assert(community.trade === 'Bathroom Renovation', 'community payload should include trade');
assert(community.region === 'Ontario', 'community payload should include region');
assert(community.jobType === 'Bathroom', 'community payload should include job type');
assert(community.creatorName === 'Adam', 'community payload should include creator name');
assert(community.rooms[0].items[0].rate === 0, 'community payload should always strip item rates');
assert(community.rooms[0].items[0].total === 0, 'community payload should always strip totals');
assert(community.rooms[0].items[0].upgrade.rate === 0, 'community payload should always strip upgrade rates');
assert(community.rooms[0].markup === 0, 'community payload should always strip markup');

const communityImport = files.prepareCommunityTemplateForImport({
  name: 'Basement Bathroom',
  rooms: community.rooms,
  creator_name: 'Adam'
}, [{ id: 1, name: 'Basement Bathroom', rooms: [] }], { now: 2000 });
assert(communityImport.id === 2000, 'community import should assign a fresh id');
assert(communityImport.name === 'Basement Bathroom (Community)', 'community import should avoid name collisions');
assert(communityImport.source === 'community', 'community import should mark source');
assert(communityImport.communityCreator === 'Adam', 'community import should keep creator attribution');
assert(communityImport.rooms[0].id === 2001, 'community import should assign fresh room ids');

console.log('quote-template file helper test passed');
