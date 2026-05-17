const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const builder = read('quote-builder.html');
const items = read('quote-items.js');
const viewer = read('interactive-quote-viewer.html');
const dashboard = read('dashboard.html');
const invoice = read('invoice-viewer.html');

assert(builder.includes('createChoiceGroupFromRoomItems'), 'builder should create quote-level choice groups from room items');
assert(builder.includes('applyChoiceGroupSelectionToItem'), 'builder should apply choice group selections to totals');
assert(builder.includes('choiceGroupTemplates'), 'builder should know about reusable choice group templates');
assert(builder.includes('addChoiceTemplateToRoom'), 'builder should attach reusable templates to quote rooms');

assert(items.includes('choiceGroupTemplates'), 'manage items should persist reusable choice group templates');
assert(items.includes('openChoiceGroupTemplateModal'), 'manage items should provide a choice group template editor');
assert(items.includes('suggestChoiceGroupTemplates'), 'manage items should suggest but not auto-save possible groups');
assert(items.includes('openChoiceGroupSuggestionPicker'), 'suggested choice groups should render in a picker instead of a text prompt');
const suggestBlock = items.slice(items.indexOf('async function suggestChoiceGroupTemplates'), items.indexOf('async function refineDescription'));
assert(!suggestBlock.includes('qdPrompt('), 'suggested choice groups should not ask users to type a number into qdPrompt');

assert(viewer.includes('renderViewerChoiceGroup'), 'client viewer should render choice group cards');
assert(viewer.includes('toggleViewerChoiceOption'), 'client viewer should let clients select choice options');
assert(viewer.includes('_clientChoiceGroups'), 'client viewer should save selected choice group summaries');
assert(viewer.includes('applyClientChoiceGroupsToRooms'), 'client viewer should apply selected choices on submit or accept');

assert(dashboard.includes('_clientChoiceGroups'), 'dashboard review should show client selected choice groups');
assert(invoice.includes('choiceGroupSelection'), 'invoice should preserve/display accepted choice-group selections');
