const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');

[
  ["#212529", 'Charcoal'],
  ["#475569", 'Slate'],
  ["#1e3a5f", 'Navy'],
  ["#285943", 'Forest'],
  ["#7a3346", 'Burgundy']
].forEach(([color, label]) => {
  assert(
    builder.includes(`{ color: '${color}', label: '${label}' }`),
    `Category style palette should include ${label}`
  );
});

assert(
  builder.includes('function getCategoryStyleTheme(background)') &&
    builder.includes("text: dark ? '#ffffff' : '#1a56a0'"),
  'Category styling should derive readable foreground colors from the selected background'
);

assert(
  items.match(/getCategoryStyleTheme\(cColor\)/g)?.length >= 2,
  'Both Manage Items category renderers should apply the shared contrast theme'
);

assert(
  builder.includes('var catTheme = getCategoryStyleTheme(catBg);'),
  'Quote builder category headers should stay readable when a dark category color is selected'
);

console.log('Manage Items category color static checks passed');
