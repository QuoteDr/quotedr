const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('quote-builder.html', 'utf8');
const toolbarMatch = source.match(/<div class="[^"]*\broom-toolbar\b[^"]*"/);
const start = toolbarMatch ? toolbarMatch.index : -1;
const end = source.indexOf('<!-- Mobile: Add Room button always visible + dropdown for rest -->');
assert(start > -1 && end > start, 'Quote builder should have a desktop toolbar block');

const toolbar = source.slice(start, end);
const headerStart = source.lastIndexOf('<div class="card-header', start);
const header = source.slice(headerStart, end);

assert(
  !header.includes('Quote by Room/Area</span>'),
  'Desktop room toolbar should not spend width on a Quote by Room/Area label'
);

assert(
  toolbar.includes('ms-auto') && /room-toolbar\s*\{[\s\S]*?width:\s*100%;/.test(source),
  'Desktop room toolbar should use the freed header width'
);

assert(
  /btn-quick-room\s*\{[^}]*background:\s*#4d93d6/.test(source),
  'Quick Add Room should use a lighter blue than Save Quote Template'
);

assert(
  toolbar.includes('fa-plus') &&
    toolbar.includes('fa-ruler-combined') &&
    toolbar.includes('fa-save') &&
    toolbar.includes('fa-folder-open') &&
    toolbar.includes('fa-database') &&
    toolbar.includes('fa-percent') &&
    toolbar.includes('fa-users') &&
    toolbar.includes('fa-eye-slash') &&
    toolbar.includes('fa-dollar-sign'),
  'Desktop toolbar should keep the existing Font Awesome icon choices'
);

const labels = [
  'Add Room',
  'Quick Add Room',
  'Save Quote Template',
  'Templates',
  'Manage Items',
  'Markup All',
  'Community',
  'Hide Timelines',
  'Total',
];

const positions = labels.map((label) => {
  const index = toolbar.indexOf(label);
  assert(index > -1, `Toolbar should include ${label}`);
  return [label, index];
});

for (let i = 1; i < positions.length; i += 1) {
  assert(
    positions[i - 1][1] < positions[i][1],
    `Desktop toolbar should place ${positions[i - 1][0]} before ${positions[i][0]}`
  );
}
