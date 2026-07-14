const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const style = fs.readFileSync(path.join(root, 'quote-style.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'interactive-quote-viewer.html'), 'utf8');

assert(builder.includes('id="quoteAccentStrength"'), 'Accent Colour should expose a strength slider');
assert(builder.includes('id="quoteOptionAccentStrength"'), 'Option Group Colour should expose a strength slider');
assert(!builder.includes('Controls the colour of grouped choice cards in the client quote.'), 'The old option-group helper copy should be removed');

['accent', 'optionAccent', 'upgradeAccent', 'upgradeBg', 'bg'].forEach((area) => {
  assert(
    builder.includes(`data-style-colour-area="${area}"`),
    `${area} should opt into the reusable custom colour picker`
  );
  assert(
    style.includes(`${area}: { containerId:`),
    `${area} should have an isolated colour favourite configuration`
  );
});

assert(style.includes("QUOTE_STYLE_COLOUR_FAVOURITES_KEY = 'quotedr_quote_style_colour_favourites'"), 'Custom colours should persist locally');
assert(style.includes('QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT = 5'), 'Each style area should be limited to five favourites');
assert(style.includes("wheel.innerHTML = '<i class=\"fas fa-palette\""), 'Every colour area should receive a palette button');
assert(style.includes("'<input type=\"color\""), 'The palette should expose a native exact-colour control');
assert(style.includes("'Colour applied but not saved. Delete a favourite to save another.'"), 'The limit should be explicit without blocking colour use');
assert(style.includes('function deleteQuoteStyleColourFavourite('), 'Saved custom colours should be removable');

assert(style.includes('accentStrength: 100'), 'Existing quotes should default to full accent strength');
assert(style.includes('optionAccentStrength: 100'), 'Existing quotes should default to full option-group strength');
assert(style.includes("document.getElementById('quoteAccentStrength')"), 'Accent strength should be read into quote style data');
assert(style.includes("document.getElementById('quoteOptionAccentStrength')"), 'Option strength should be read into quote style data');
assert(style.includes("['quoteAccentStrength','quoteOptionAccentStrength'"), 'Both strength sliders should update the live preview');

assert(viewer.includes('viewerStyle.accentStrength'), 'The client viewer should consume saved accent strength');
assert(viewer.includes('viewerStyle.optionAccentStrength'), 'The client viewer should consume saved option-group strength');
assert(viewer.includes('effectiveOptionAccent = blendColorWithWhite'), 'Option colour strength should derive the rendered colour');
assert(viewer.includes('--quote-option-accent-contrast'), 'Low-strength option colours should get readable selected text');
assert(viewer.includes('function readableTextColor('), 'Low-strength accents should calculate readable text contrast');
assert(builder.includes('--quote-upgrade-accent-contrast') && builder.includes('--quote-upgrade-bg-contrast'), 'Builder upgrade controls should stay readable with custom colours');
assert(viewer.includes('--quote-upgrade-accent-contrast') && viewer.includes('--quote-upgrade-bg-contrast'), 'Client upgrade controls should stay readable with custom colours');

console.log('Quote style colour controls static checks passed');
