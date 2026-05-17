const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-calculators.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const addItemBlock = source.slice(source.indexOf('function addEstimatorPricingItem'), source.indexOf('function collectEstimatorItemsFromMap'));

assert(!addItemBlock.includes('if (rate <= 0) return;'), 'estimator pricing setup should include saved items even when their rate is 0');
assert(addItemBlock.includes('searchText'), 'estimator pricing items should carry richer searchable text');
assert(source.includes('estimatorPricingDatalistHtml'), 'pricing setup should provide datalist suggestions for search inputs');
assert(source.includes('list="epSuggestions_'), 'search inputs should attach to datalist suggestions');
assert(source.includes('findEstimatorSavedItemIds'), 'estimator pricing should support multiple saved item ids');
assert(source.includes('estimatorSelectedItemsHtml'), 'estimator pricing should render selected item chips');
assert(source.includes('removeEstimatorPricingItem'), 'estimator pricing should allow removing selected items');
assert(source.includes('getEstimatorPricingSelections'), 'estimator calculations should expand multiple selected items');
assert(source.includes('commitEstimatorPricingSearchMatch'), 'search suggestion selection should immediately add the matching saved item');
assert(source.includes('onchange="commitEstimatorPricingSearchMatch'), 'saved-item search onchange should commit exact datalist selections');
