const assert = require('node:assert');
const fs = require('node:fs');
const test = require('node:test');

const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const start = viewer.indexOf('        function collectViewerSelectedUpgradeSummaryEntries() {');
const end = viewer.indexOf('        function viewerUpgradeDescriptionPanelId(', start);

assert(start >= 0 && end > start, 'accepted-upgrade summary renderer should be extractable');

const buildRenderer = new Function(
  'quoteData',
  'getViewerSelectedItemUpgradeOptions',
  'getViewerSelectedEnhancementOptions',
  'viewerUpgradeRuntimeTextKey',
  'getViewerUpgradeOptionDescription',
  'isViewerConsultationUpgradeOption',
  'quoteIsAccepted',
  'escapeHtml',
  'formatDescriptionText',
  viewer.slice(start, end) + '\nreturn { collectViewerSelectedUpgradeSummaryEntries, renderViewerSelectedUpgradeSummary };'
);

function rendererFor(quote, accepted = true) {
  return buildRenderer(
    quote,
    item => item._selectedUpgrades || [],
    group => group._selectedEnhancements || [],
    value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' '),
    option => String(option.description || option.itemDescription || ''),
    option => option.upgradeType === 'consultation',
    () => accepted,
    value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  );
}

test('accepted legacy upgrade title is glanceable while its description starts collapsed', () => {
  const quote = {
    rooms: [{
      name: 'Doors & Trim',
      items: [{
        description: 'Sliding Patio Door Manufacture and Supply',
        _selectedUpgrades: [{
          id: 'legacy_upgrade_option',
          name: 'Heavy-Duty Pet Screen Upgrade',
          description: 'Ultra-durable vinyl-coated polyester insect screen.',
          upgradeType: 'replacement',
          upgradeGroupName: 'Upgrade Options'
        }]
      }]
    }],
    original_rooms: [{ items: [{ description: 'Sliding Patio Door Manufacture and Supply' }] }]
  };
  const html = rendererFor(quote).renderViewerSelectedUpgradeSummary();
  assert(html.includes('Selected upgrades'));
  assert(html.includes('Heavy-Duty Pet Screen Upgrade'));
  assert(html.includes('Doors &amp; Trim · Sliding Patio Door Manufacture and Supply'));
  assert(html.includes('Ultra-durable vinyl-coated polyester insect screen.'));
  assert(html.includes('<details class="selected-upgrade-item">'));
  assert(!html.includes('<details class="selected-upgrade-item" open'), 'descriptions should be collapsed by default');
});
test('grouped upgrades and choice enhancements share one selected-only summary', () => {
  const quote = {
    rooms: [{
      name: 'Kitchen',
      items: [{
        name: 'Cabinet package',
        _selectedUpgrades: [
          { id: 'finish', name: 'Walnut Finish', description: 'Natural walnut veneer.', upgradeType: 'replacement', upgradeGroupName: 'Finish' },
          { id: 'lighting', name: 'Under-Cabinet Lighting', description: 'Dimmable LED lighting.', upgradeType: 'add_on', upgradeGroupName: 'Lighting' }
        ],
        choiceGroup: {
          _selectedEnhancements: [{ id: 'hardware', name: 'Soft-Close Hardware', description: 'Premium soft-close hinges.', upgradeType: 'add_on', enhancementGroupName: 'Hardware' }]
        }
      }]
    }]
  };
  const result = rendererFor(quote);
  const entries = result.collectViewerSelectedUpgradeSummaryEntries();
  const html = result.renderViewerSelectedUpgradeSummary();
  assert.deepEqual(entries.map(entry => entry.name), ['Walnut Finish', 'Under-Cabinet Lighting', 'Soft-Close Hardware']);
  assert(html.includes('3 selected'));
  assert(html.includes('Replacement'));
  assert(html.includes('Add-on'));
  assert(!rendererFor(quote, false).renderViewerSelectedUpgradeSummary(), 'unaccepted quotes should keep the interactive selection UI instead');
});
