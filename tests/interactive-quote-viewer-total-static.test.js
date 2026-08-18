const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const normalizedSource = source.replace(/\r\n/g, '\n');

assert(source.includes('function viewerItemBaseTotal'), 'interactive viewer should centralize base line total calculation');
assert(source.includes('viewerItemActiveTotal(item)'), 'interactive viewer should use saved line totals for live total calculation');
assert(source.includes('function viewerMoney'), 'interactive viewer should centralize money formatting');
assert(source.includes("toLocaleString('en-CA'"), 'interactive viewer money should include thousands separators');
assert(source.includes('heroTotal.textContent = viewerMoney(balanceDue)'), 'hero total should use the recalculated comma-formatted balance');
assert(source.includes('viewerMoney(coTotals.originalTotal)'), 'change-order original totals should use comma-formatted money');
assert(source.includes('viewerMoney(total)'), 'updated quote totals should use comma-formatted money');
assert(!source.includes("heroTotal.textContent = '$' + originalTotal.toFixed(2)"), 'hero total should not render ungrouped fixed decimals');
assert(!source.includes("document.getElementById('newGrandTotal').textContent = `$${total.toFixed(2)}`"), 'bottom total should not render ungrouped fixed decimals');
assert(source.includes('height: clamp(185px, 18vw, 250px)'), 'proposal logo should be larger on desktop');
assert(source.includes('function qvLineTotal'), 'interactive viewer should centralize discount-aware line totals');
assert(source.includes('viewerItemActiveTotal(item)'), 'discount-aware line totals should preserve existing active total behavior');
assert(
  source.includes('room.items.reduce((sum, item) => item._removed ? sum : sum + (isChangeOrder ? viewerChangeOrderLineDisplayTotal(item, room) : viewerItemMarkedAmount(room, item, qvLineTotal(item))), 0)'),
  'room totals should use marked-up discount-aware item totals, change-order display totals, and skip removed items'
);
assert(source.includes('function viewerVisibleNotes'), 'interactive viewer should centralize note visibility so duplicate descriptions can be suppressed');
assert(source.includes('viewerVisibleNotes(item, displayDesc)'), 'item rendering should hide notes that duplicate the displayed description');
assert(source.includes('viewer-undo-removed-btn'), 'removed optional items should use an obvious restore button style');
assert(source.includes('Undo removal'), 'removed optional item restore action should use clearer undo copy');
const choiceApplyBlock = source.slice(source.indexOf('function applyViewerChoiceGroupToItem'), source.indexOf('function normalizeViewerUpgradeType'));
assert(choiceApplyBlock.includes('resetViewerItemUpgradeBaseState(item);'), 'choice group selection changes should reset stale upgrade base state before recalculating option upgrades');
assert(normalizedSource.includes('if (item.choiceGroup) {\n                applyViewerChoiceGroupToItem(item);\n                return viewerNumber(item.rate);\n            }'), 'choice group active rate should come from the currently selected option');
assert(normalizedSource.includes('if (item.choiceGroup) {\n                applyViewerChoiceGroupToItem(item);\n                return viewerNumber(item.total);\n            }'), 'choice group active total should come from the currently selected option instead of stale base totals');
assert(!source.includes('let subtotal = 0;\n            let upgradesTotal = 0;\n            if (quoteData.rooms) {\n                quoteData.rooms.forEach(room => {\n                    room.items.forEach(item => {\n                        applyViewerChoiceGroupToItem(item);\n                        if (item._removed) return; // skip removed items\n                        const activeRate = (item.upgraded && item.upgrade) ? item.upgrade.rate : (item._baseRate || item.rate);\n                        const baseTotal = item.quantity * (item._baseRate || item.rate);\n                        const activeTotal = item.quantity * activeRate;'), 'viewer updateTotal should not recalculate imported legacy quote totals from quantity times rate');

console.log('interactive quote viewer total static test passed');
