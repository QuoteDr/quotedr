const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const html = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const fileMenuStart = html.indexOf('<!-- File dropdown -->');
const toolsMenuStart = html.indexOf('<!-- Tools dropdown -->');
assert(fileMenuStart !== -1 && toolsMenuStart !== -1, 'file and tools dropdown markers should exist');

const fileMenu = html.slice(fileMenuStart, toolsMenuStart);
assert(fileMenu.includes('onclick="exportToPDF()"'), 'file menu should include an Export as PDF action');
assert(fileMenu.includes('Export as PDF'), 'file menu should label the PDF action clearly');

console.log('quote builder file menu static test passed');
