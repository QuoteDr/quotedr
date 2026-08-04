const assert = require('node:assert');
const typedSignature = require('../typed-signature.js');

assert.strictEqual(
  typedSignature.normalizeName('  Jane   SMITH  '),
  'jane smith',
  'name normalization should ignore case and repeated spacing'
);
assert.strictEqual(
  typedSignature.matchClientName('  JANE   smith ', 'Jane Smith').matches,
  true,
  'case and insignificant spacing should not reject the client'
);
assert.strictEqual(
  typedSignature.matchClientName('Jose O-Neil', 'José O’Neil').matches,
  true,
  'common accents and punctuation variants should normalize consistently'
);
assert.strictEqual(typedSignature.matchClientName('Victoria Niven', 'Victoria Niven, James Miller').matches, true, 'either complete client name should match a multi-client quote');
assert.strictEqual(typedSignature.matchClientName('James Miller', 'Victoria Niven, James Miller').matches, true, 'the second complete client name should match a multi-client quote');
assert.strictEqual(typedSignature.matchClientName('Jane Smith', 'Smith, Jane').matches, true, 'last-name-first records should accept a conventional full-name signature');
assert.strictEqual(typedSignature.matchClientName('Jane', 'Jane Smith').matches, false, 'a partial first name must be rejected');
assert.strictEqual(typedSignature.matchClientName('Jane', 'Jane').matches, false, 'a one-word record must not bypass the full-name requirement');
assert.strictEqual(typedSignature.matchClientName('John Smith', 'Jane Smith').matches, false, 'a different person must be rejected');
assert.strictEqual(typedSignature.matchClientName('Smith Jane', 'Jane Smith').matches, false, 'word order must not be silently reversed without a comma-formatted client record');

const candidates = typedSignature.clientNameCandidates('Victoria Niven & James Miller');
assert(candidates.includes('Victoria Niven'), 'ampersand-delimited clients should expose the first full name');
assert(candidates.includes('James Miller'), 'ampersand-delimited clients should expose the second full name');

console.log('typed signature tests passed');
