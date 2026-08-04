const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(__dirname);
const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const publicArtifact = fs.readFileSync(path.join(root, 'config', 'public-artifact.mjs'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('<script src="community-starter-templates.js?v='), 'quote builder should load the starter catalog');
assert(builder.includes('function getCommunityStarterTemplates()'), 'quote builder should expose starter templates to the marketplace');
assert(builder.includes("communityTemplateSectionHtml('starter', 'QuoteDr Starter Library'"), 'starter templates should have a clearly labeled section');
assert(builder.includes("communityTemplateSectionHtml('community', 'Shared by the Community'"), 'user-shared templates should remain separately labeled');
assert(builder.includes('window._communityTemplateCache = shared.concat(starters);'), 'starter and user-shared templates should share the import cache');
assert(builder.includes('User-shared templates could not be loaded right now.'), 'starter templates should remain available when the marketplace request fails');
assert(builder.includes('function previewCommunityTemplate(id)'), 'community templates should support preview before import');
assert(builder.includes('View Template</button>'), 'community cards should include a preview command');
assert(builder.includes('data-section="\' + section + \'"'), 'community filters should track starter and shared sections');
assert(builder.includes("var feedbackButtons = isStarter ? ''"), 'official starter templates should not show community moderation controls');
assert(publicArtifact.includes("'community-starter-templates.js'"), 'production artifact should include the starter catalog');

console.log('community starter template marketplace static test passed');
