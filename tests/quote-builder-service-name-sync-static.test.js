const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('function setLineItemNameFromService'), 'quote builder should synchronize selected service names');
assert(
  /Enter new service name:[\s\S]*?setLineItemNameFromService\(newSvc\)/.test(source),
  'creating a service should replace partial Quick Search text with the complete service name'
);
assert(
  /function autoFillPricing[\s\S]*?setLineItemNameFromService\(selectedOption\.text\)/.test(source),
  'selecting an existing service should synchronize the complete service name'
);
assert(
  /function selectItemFromSearch[\s\S]*?setLineItemNameFromService\(name\)/.test(source),
  'choosing a Quick Search result should keep its complete name visible'
);

assert(
  /function editLineItem[\s\S]*?isLikelyTruncatedServiceName\(item\.description, matchedService\.name\)[\s\S]*?setLineItemNameFromService\(matchedService\.name\)/.test(source),
  'editing an already-truncated quote item should repair its mid-word service name'
);

console.log('quote builder service name synchronization static test passed');
