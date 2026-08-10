const fs = require('fs');
const path = require('path');

const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
const quoteStyle = fs.readFileSync(path.join(__dirname, '..', 'quote-style.js'), 'utf8');
const viewer = fs.readFileSync(path.join(__dirname, '..', 'interactive-quote-viewer.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('Header Background Effect'), 'quote settings should expose a header background effect control');
assert(builder.includes('id="quoteHeaderEffect"'), 'quote settings should include a quoteHeaderEffect field');
assert(builder.includes('value="soft-gradient"'), 'quote settings should include a soft gradient effect');
assert(builder.includes('value="spotlight"'), 'quote settings should include a spotlight effect');
assert(builder.includes('value="premium-sheen"'), 'quote settings should include a premium sheen effect');
assert(builder.includes('value="subtle-texture"'), 'quote settings should include a subtle texture effect');
assert(builder.includes('value="solid"'), 'quote settings should allow the old solid colour style');

assert(quoteStyle.includes("headerEffect: 'soft-gradient'"), 'quote style defaults should include a premium soft-gradient header effect');
assert(quoteStyle.includes("style.headerEffect = document.getElementById('quoteHeaderEffect')?.value"), 'quote style should read quoteHeaderEffect from controls');
assert(quoteStyle.includes("setFieldValue('quoteHeaderEffect'"), 'quote style should apply quoteHeaderEffect to controls');
assert(quoteStyle.includes("'quoteHeaderEffect'"), 'quote style modal should bind quoteHeaderEffect changes');
assert(
  quoteStyle.includes("type: 'quotedr-quote-studio-style'") &&
    quoteStyle.includes('style: quoteStudioClone(_quoteStyle)'),
  'style preview should send the selected header effect to the real client viewer'
);
assert(!quoteStyle.includes('function quoteHeaderBackgroundForEffect'), 'builder should not retain an unused duplicate of the viewer renderer');

assert(viewer.includes('function quoteHeaderBackgroundForEffect'), 'client quote viewer should include the header effect background helper');
assert(viewer.includes("viewerStyle.headerEffect || 'soft-gradient'"), 'client quote viewer should read saved header effects with a soft-gradient fallback');
assert(viewer.includes('quoteHeaderBackgroundForEffect(accent, headerStyle'), 'client quote viewer should render the selected header effect');
assert(viewer.includes('radial-gradient'), 'client quote viewer should support layered premium effects');

console.log('quote header effects static test passed');
