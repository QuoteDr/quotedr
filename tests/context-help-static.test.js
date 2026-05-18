const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const helpContentPath = path.join(root, 'help-content.js');
const modalHelpPath = path.join(root, 'modal-help.js');
const helpContent = fs.readFileSync(helpContentPath, 'utf8');
const modalHelp = fs.readFileSync(modalHelpPath, 'utf8');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(helpContent, context);

const topics = context.window.QuoteDrHelpContent.topics;
const aliases = context.window.QuoteDrHelpContent.aliases;

const requiredTopicIds = [
  'communityTemplatesModal',
  'shareTemplateModal',
  'roomColorModal',
  'invoiceSettingsModal',
  'aiVoiceTemplatesModal',
  'aiVoiceMemoryModal',
  'aiVoiceTradeRulesModal',
  'aiVoiceMeasurementModal',
  'aiVoiceReviewModal',
  'portalAssignModal',
  'featureDetailModal',
  'tradeDetailModal'
];

for (const id of requiredTopicIds) {
  if (!topics[id]) {
    throw new Error(`Missing contextual help topic for ${id}`);
  }
  if (!topics[id].summary || topics[id].summary.length < 60) {
    throw new Error(`Contextual help summary for ${id} is too thin`);
  }
  if (!Array.isArray(topics[id].steps) || topics[id].steps.length < 3) {
    throw new Error(`Contextual help steps for ${id} need more detail`);
  }
}

if (aliases.templateManagerModal !== 'manageTemplatesModal') {
  throw new Error('Legacy templateManagerModal should alias to manageTemplatesModal');
}

const bannedFallbacks = [
  'This window helps you complete the current QuoteDr task',
  'Read the title and field labels to confirm what this tool is for',
  'Most QuoteDr windows save or apply changes'
];

for (const text of bannedFallbacks) {
  if (helpContent.includes(text) || modalHelp.includes(text)) {
    throw new Error(`Generic contextual help fallback still present: ${text}`);
  }
}

if (!modalHelp.includes('if (!topic) return;')) {
  throw new Error('Unknown modals should not receive fake generic Help buttons');
}

console.log('context help static test passed');
