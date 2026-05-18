const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-calculators.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const addItemBlock = source.slice(source.indexOf('function addEstimatorPricingItem'), source.indexOf('function collectEstimatorItemsFromMap'));

assert(!addItemBlock.includes('if (rate <= 0) return;'), 'estimator pricing setup should include saved items even when their rate is 0');
assert(addItemBlock.includes('searchText'), 'estimator pricing items should carry richer searchable text');
assert(!source.includes('estimatorPricingDatalistHtml'), 'pricing setup should not use native datalist suggestions now that it renders its own dropdown');
assert(!source.includes('list="epSuggestions_'), 'search inputs should not attach native datalist suggestions');
assert(!source.includes('<datalist id="epSuggestions_'), 'pricing setup should not render native datalist elements');
assert(source.includes('findEstimatorSavedItemIds'), 'estimator pricing should support multiple saved item ids');
assert(source.includes('estimatorSelectedItemsHtml'), 'estimator pricing should render selected item chips');
assert(source.includes('removeEstimatorPricingItem'), 'estimator pricing should allow removing selected items');
assert(source.includes('getEstimatorPricingSelections'), 'estimator calculations should expand multiple selected items');
assert(source.includes('commitEstimatorPricingSearchMatch'), 'search suggestion selection should immediately add the matching saved item');
assert(source.includes('onchange="commitEstimatorPricingSearchMatch'), 'saved-item search onchange should still commit exact typed selections');
assert(source.includes('estimatorPricingSearchResultsHtml'), 'typing in pricing setup should render visible clickable search results');
assert(source.includes('pickEstimatorPricingSearchResult'), 'pricing setup search results should be clickable and link saved items');
assert(source.includes('onfocus="filterEstimatorPricingItems'), 'pricing setup search should refresh visible results when focused');
assert(source.includes('handleEstimatorPricingSearchKey(event'), 'pricing setup search should support keyboard selection');
assert(source.includes('toggleEstimatorPricingBrowse'), 'category item browsing should be available as an optional secondary control');
assert(source.includes('Browse all items'), 'pricing setup should expose browsing as a small optional button');
assert(source.includes('style="display:none;" id="epBrowseWrap_'), 'category dropdown should be hidden until the user asks to browse');
assert(!source.includes('<label class="form-label small text-muted mb-1" for="epItem_'), 'category dropdown should no longer be a full-time visible column');
assert(source.includes('estimator-pricing-row'), 'pricing setup rows should have a visual grouping class');
assert(source.includes('estimator-pricing-field'), 'pricing setup row labels should align within each grouped row');
assert(source.includes("document.addEventListener('pointerdown'"), 'search result items should select on pointerdown before input change redraws the list');
assert(source.includes('pickEstimatorPricingSearchButton'), 'search result pointer and click handlers should share one picker helper');
