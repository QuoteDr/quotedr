const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const quoteStyle = fs.readFileSync(path.join(root, 'quote-style.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(builder.includes('Upgrade Options Colour'), 'send quote settings should expose an upgrade action colour control');
assert(builder.includes('id="upgradeAccentSwatches"'), 'upgrade action colour swatches should have a stable id');
assert(builder.includes('id="upgradeBgSwatches"'), 'upgrade background swatches should have a stable id');
assert(builder.includes('id="quoteUpgradeAccent"'), 'upgrade accent should be stored in a hidden style field');
assert(builder.includes('id="quoteUpgradeBg"'), 'upgrade background should be stored in a hidden style field');
assert(builder.includes('<button type="button" class="style-swatch upgrade-swatch selected"'), 'upgrade action colour swatches should be click-safe buttons');
assert(builder.includes('<button type="button" class="style-swatch upgrade-bg-swatch selected"'), 'upgrade background colour swatches should be click-safe buttons');

assert(quoteStyle.includes("upgradeAccent: '#0d9488'"), 'quote style defaults should use a non-warning teal upgrade accent');
assert(quoteStyle.includes("upgradeBg: '#f8fafc'"), 'quote style defaults should use a quiet slate upgrade background');
assert(quoteStyle.includes("style.upgradeAccent = document.querySelector('#upgradeAccentSwatches .style-swatch.selected')"), 'quote style should read upgrade accent from swatches');
assert(quoteStyle.includes("style.upgradeBg = document.querySelector('#upgradeBgSwatches .style-swatch.selected')"), 'quote style should read upgrade background from swatches');
assert(quoteStyle.includes("setFieldValue('quoteUpgradeAccent'"), 'quote style should apply upgrade accent to controls');
assert(quoteStyle.includes("setFieldValue('quoteUpgradeBg'"), 'quote style should apply upgrade background to controls');
assert(quoteStyle.includes("bindStyleSwatchGroup('upgradeAccentSwatches', 'data-upgrade-accent', 'quoteUpgradeAccent', 'upgradeAccent'"), 'upgrade action colour swatches should use delegated click handling');
assert(quoteStyle.includes("bindStyleSwatchGroup('upgradeBgSwatches', 'data-upgrade-bg', 'quoteUpgradeBg', 'upgradeBg'"), 'upgrade background swatches should use delegated click handling');
assert(quoteStyle.includes('event.stopPropagation();'), 'upgrade swatch clicks should not bubble into parent modal controls');

assert(builder.includes('--quote-upgrade-accent'), 'builder should define upgrade CSS variables');
assert(builder.includes('quote-upgrade-option-btn'), 'builder should render upgrade options with themed button classes');
assert(!builder.includes("btn-warning' : 'btn-outline-warning') + ' py-0\" onclick=\"event.stopPropagation(); toggleItemUpgradeOption"), 'builder item upgrade buttons should not use warning classes');

assert(viewer.includes('--quote-upgrade-accent'), 'viewer should define upgrade CSS variables');
assert(viewer.includes('viewerStyle.upgradeAccent'), 'viewer should load saved upgrade accent');
assert(viewer.includes('viewerStyle.upgradeBg'), 'viewer should load saved upgrade background');
assert(viewer.includes('quote-upgrade-option-btn'), 'viewer should render upgrade options with themed button classes');
assert(!viewer.includes("btn-warning' : 'btn-outline-warning') + ' py-0\" onclick=\"toggleViewerItemUpgradeOption"), 'viewer item upgrade buttons should not use warning classes');

console.log('Quote upgrade style static checks passed');
