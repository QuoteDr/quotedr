const fs = require('fs');
const path = require('path');

const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const quoteStyle = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const viewer = fs.readFileSync(path.join(__dirname, '..', 'interactive-quote-viewer.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('Option Group Colour'), 'quote settings should expose an Option Group Colour control');
assert(builder.includes('id="optionAccentSwatches"'), 'quote settings should render option group colour swatches');
assert(builder.includes('data-option-accent'), 'style presets/swatches should carry option group colours');

assert(quoteStyle.includes("optionAccent: '#1a56a0'"), 'quote style defaults should include optionAccent');
assert(quoteStyle.includes("style.optionAccent = document.querySelector('#optionAccentSwatches .style-swatch.selected')?.getAttribute('data-option-accent')"), 'quote style should read selected option group colour');
assert(quoteStyle.includes("setFieldValue('quoteOptionAccent'"), 'quote style should apply optionAccent to a hidden control');
assert(quoteStyle.includes("#optionAccentSwatches .style-swatch"), 'quote style should bind option group colour swatches');
assert(quoteStyle.includes("_quoteStyle.optionAccent = sw.getAttribute('data-option-accent')"), 'option swatch clicks should update optionAccent');

assert(viewer.includes('--quote-option-accent'), 'viewer should expose a CSS variable for option group colour');
assert(viewer.includes('--quote-option-accent-soft'), 'viewer should expose a soft tint for unselected options');
assert(viewer.includes('.choice-option-btn.choice-option-selected'), 'viewer should style selected choice options with semantic classes');
assert(viewer.includes("viewerStyle.optionAccent || viewerStyle.accent"), 'viewer should read optionAccent with accent fallback');
assert(viewer.includes('choice-option-selected'), 'choice group renderer should use selected option classes');
assert(!viewer.includes('border-left:4px solid #0d6efd'), 'choice group renderer should not hard-code blue borders');
assert(!viewer.includes("checked ? 'btn-primary' : 'btn-outline-primary'"), 'choice group renderer should not hard-code Bootstrap blue button colours');

console.log('quote option group colour static test passed');
