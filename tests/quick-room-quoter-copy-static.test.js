const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const quoteBuilder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const helpContent = fs.readFileSync(path.join(root, 'help-content.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(quoteBuilder.includes('Quick Room Quoter'), 'quote builder should label the estimator modal as Quick Room Quoter');
assert(helpContent.includes("title: 'Quick Room Quoter'"), 'contextual help should use the Quick Room Quoter title');
assert(!/Material Estimator/i.test(quoteBuilder), 'old Material Estimator label should not appear in quote builder copy');
assert(!/title:\s*'Material Estimator'/i.test(helpContent), 'old Material Estimator title should not appear in help content');

console.log('quick room quoter copy static test passed');
