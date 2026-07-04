const fs = require('fs');
const assert = require('assert');

const storage = fs.readFileSync('quote-storage.js', 'utf8');
const builder = fs.readFileSync('quote-builder.html', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  /function openQuoteForChangeOrder\(quoteId\)\s*\{[\s\S]*?#change-order/.test(dashboard),
  'Dashboard should open the builder with the change-order hash for change order creation'
);

assert(
  /function quoteBuilderIsStartingChangeOrder\(\)\s*\{[\s\S]*window\.location\.hash === ['"]#change-order['"]/.test(storage),
  'Quote storage should recognize the change-order hash before applying normal portal edit locks'
);

assert(
  /if \(quoteIsPortalLockedForBuilder\(q\) && !quoteBuilderIsStartingChangeOrder\(\)\)/.test(storage),
  'Manual cloud loads should only block portal documents when they are not being used to start a change order'
);

assert(
  /if \(quoteIsPortalLockedForBuilder\(q\) && !quoteBuilderIsStartingChangeOrder\(\)\)/.test(storage) &&
  /if \(quoteIsPortalLockedForBuilder\(q\) && !quoteBuilderIsStartingChangeOrder\(\)\)[\s\S]*handlePortalLockedBuilderLoad/.test(storage),
  'URL loads should allow portal documents through only for the change-order startup path'
);

assert(
  /portal_visible:\s*isChangeOrder\s*\?\s*false\s*:\s*loadedData\.portal_visible === true/.test(storage),
  'Collected change-order data should not inherit parent portal visibility'
);

assert(
  /portal_id:\s*isChangeOrder\s*\?\s*''\s*:\s*loadedData\.portal_id/.test(storage) &&
  /portal_added_at:\s*isChangeOrder\s*\?\s*null\s*:\s*loadedData\.portal_added_at/.test(storage),
  'Collected change-order data should strip portal assignment metadata from the new draft'
);

assert(
  /window\._loadedQuoteData = Object\.assign\(\{\}, window\._loadedQuoteData \|\| \{\}, \{[\s\S]*portal_visible: false[\s\S]*portal_added_at: null/.test(builder),
  'Starting a change order should clear loaded portal metadata before autosave can save the copy'
);

assert(
  /window\._supabaseQuoteId = null;/.test(builder) &&
  /window\._parentQuoteId = parentId;/.test(builder),
  'Change order creation should detach the editable copy from the parent row while keeping the parent link'
);

console.log('change-order portal-copy static checks passed');
