const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const items = fs.readFileSync(path.join(root, 'quote-items.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(items.includes('enhancementGroups'), 'Manage Items should persist enhancementGroups on choice group templates');
assert(items.includes('openChoiceGroupEnhancementsModal'), 'Choice Group manager should include an Enhancements modal');
assert(items.includes('data-choice-group-template-action="enhancements"'), 'Choice Group rows should expose an Enhancements button');
assert(items.includes('Available With'), 'Enhancement UI should use contractor-friendly Available With wording');
assert(items.includes('Blocked By'), 'Enhancement UI should expose simple conflict controls');
assert(items.includes('single_optional'), 'Enhancement groups should support Pick One Optional');
assert(items.includes('upgradeType'), 'Enhancement options should store replacement/add-on behavior');
assert(items.includes('replacement') && items.includes('add_on'), 'Enhancement options should support replacement and add_on types');

assert(builder.includes('normalizeChoiceGroupEnhancementGroups'), 'Quote builder should normalize enhancementGroups from templates');
assert(builder.includes('clearInvalidChoiceGroupEnhancementSelections'), 'Quote builder should clear incompatible enhancement selections');
assert(builder.includes('renderChoiceGroupEnhancements'), 'Quote builder should render enhancement controls under base options');
assert(builder.includes('toggleChoiceGroupEnhancementOption'), 'Quote builder should let users select compatible enhancements');
assert(builder.includes('applyChoiceGroupEnhancementsToItem'), 'Quote builder should include enhancements in grouped line totals');

assert(viewer.includes('normalizeViewerChoiceGroupEnhancementGroups'), 'Client viewer should normalize enhancementGroups');
assert(viewer.includes('renderViewerChoiceGroupEnhancements'), 'Client viewer should render client-facing enhancements');
assert(viewer.includes('toggleViewerChoiceGroupEnhancement'), 'Client viewer should let clients select enhancements');
assert(viewer.includes('clearInvalidViewerChoiceGroupEnhancementSelections'), 'Client viewer should clear blocked enhancement selections');
assert(viewer.includes('_clientEnhancements'), 'Approval payload should record selected enhancements');

console.log('choice group enhancements static checks passed');
