const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.join(__dirname);
const starterSource = fs.readFileSync(path.join(root, 'community-starter-templates.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(root, 'quote-template-files.js'), 'utf8');
const context = { console };
context.window = context;
vm.createContext(context);
vm.runInContext(starterSource, context);
vm.runInContext(helperSource, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const templates = context.QuoteDrCommunityStarterTemplates;
assert(Array.isArray(templates), 'starter template catalog should be an array');
assert(templates.length >= 12, 'starter catalog should contain at least 12 templates');

const expectedNames = [
  'Full Bathroom Renovation',
  'Powder Room Renovation',
  'Full Kitchen Renovation',
  'Multi-Room Basement Renovation',
  'Whole-House Interior Painting',
  'Bedroom Paint and Trim Refresh',
  'Main-Floor Flooring Replacement',
  'Drywall Repair and Paint Blend',
  'New 300 sq ft Deck Build',
  '150 LF Fence and Gate Installation',
  'Two-Bedroom Rental Turnover',
  'Laundry and Mudroom Renovation'
];
expectedNames.forEach(name => assert(templates.some(template => template.name === name), 'missing starter template: ' + name));

const templateIds = new Set();
const roomIds = new Set();
let itemCount = 0;

templates.forEach(template => {
  assert(/^qd-starter-/.test(template.id), template.name + ' should use a stable qd-starter id');
  assert(!templateIds.has(template.id), 'duplicate template id: ' + template.id);
  templateIds.add(template.id);
  assert(template.creator_name === 'QuoteDr Starter Library', template.name + ' should use transparent starter attribution');
  assert(template.is_starter === true, template.name + ' should be marked as a starter');
  assert(template.is_anonymous === false, template.name + ' should not be anonymous');
  assert(template.include_pricing === false, template.name + ' should not include pricing');
  assert(template.status === 'published', template.name + ' should be publishable in the community list');
  assert(typeof template.trade === 'string' && template.trade.length > 0, template.name + ' should include a trade');
  assert(typeof template.region === 'string' && template.region.length > 0, template.name + ' should include a region');
  assert(typeof template.job_type === 'string' && template.job_type.length > 0, template.name + ' should include a job type');
  assert(typeof template.description === 'string' && template.description.length > 40, template.name + ' should include a useful summary');
  assert(Array.isArray(template.rooms) && template.rooms.length > 0, template.name + ' should include rooms');
  assert(template.room_count === template.rooms.length, template.name + ' room count should match its room data');

  template.rooms.forEach(room => {
    assert(room.id && !roomIds.has(room.id), 'room ids should be unique: ' + room.id);
    roomIds.add(room.id);
    assert(room.markup === 0, room.name + ' should have zero markup');
    assert(Array.isArray(room.items) && room.items.length > 0, room.name + ' should include line items');
    room.items.forEach(item => {
      itemCount += 1;
      assert(typeof item.description === 'string' && item.description.length > 2, room.name + ' has an item without a name');
      assert(item.serviceName === item.description, item.description + ' should preserve its service name');
      assert(typeof item.category === 'string' && item.category.length > 0, item.description + ' should include a category');
      assert(Number.isFinite(item.quantity) && item.quantity > 0, item.description + ' should include a positive starter quantity');
      assert(typeof item.unitType === 'string' && item.unitType.length > 0, item.description + ' should include a unit');
      assert(typeof item.itemDescription === 'string' && item.itemDescription.length > 20, item.description + ' should include a reusable client-facing description');
      ['rate', 'total', 'materialCost', 'laborCost', 'unit_rate', 'line_total', '_baseRate'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(item, field)) {
          assert(Number(item[field]) === 0, item.description + ' should have zero ' + field);
        }
      });
      ['note', 'notes', 'jobNote', 'job_note'].forEach(field => {
        assert(!Object.prototype.hasOwnProperty.call(item, field), item.description + ' should not include job-specific ' + field);
      });
    });
  });
});

assert(itemCount >= 200, 'starter catalog should provide a meaningful number of line items');

const bathroom = templates.find(template => template.name === 'Full Bathroom Renovation');
const bathroomNames = bathroom.rooms.flatMap(room => room.items.map(item => item.description.toLowerCase())).join(' | ');
[
  'demolition', 'subfloor opening', 'plumbing rough-in', 'electrical rough-in', 'exhaust fan',
  'drywall', 'waterproofing', 'shower pan', 'shower floor tile', 'shower wall tile',
  'vanity', 'toilet', 'mirror', 'toilet paper holder', 'towel bar', 'ceiling painting',
  'wall painting', 'baseboard', 'door'
].forEach(term => assert(bathroomNames.includes(term), 'full bathroom scope should include ' + term));

const basement = templates.find(template => template.name === 'Multi-Room Basement Renovation');
assert(basement.rooms.length >= 5, 'basement starter should demonstrate a multi-room quote');

const imported = context.QuoteDrTemplateFiles.prepareCommunityTemplateForImport(templates[0], [], { now: 5000 });
assert(imported.source === 'community', 'starter should use the normal community import flow');
assert(imported.communityCreator === 'QuoteDr Starter Library', 'starter attribution should survive import');
assert(imported.rooms[0].items[0].rate === 0, 'imported starter pricing should remain zero');

console.log('community starter template catalog test passed (' + templates.length + ' templates, ' + itemCount + ' items)');
