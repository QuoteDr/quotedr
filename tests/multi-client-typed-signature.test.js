const assert = require('node:assert');
const fs = require('node:fs');

const browserMatcher = require('../typed-signature.js');
const edgeSource = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');

function extractFunction(source, name) {
  const signature = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = signature.exec(source);
  assert(match, `expected ${name} in client-document Edge Function`);
  const start = match.index;
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`could not extract ${name}`);
}

const edgeValidatorSource = [
  'rowData',
  'displayQuoteName',
  'normalizeSignerName',
  'signerWordCount',
  'clientSignerCandidates',
  'validateTypedSigner'
].map((name) => extractFunction(edgeSource, name)).join('\n')
  .replace(/:\s*QuoteRow/g, '')
  .replace(/:\s*unknown/g, '')
  .replace(/\s+as\s+Record<string, unknown>/g, '')
  .replace(/\s+as\s+string\[\]/g, '')
  .replace(/new Set<string>\(\)/g, 'new Set()');

const validateTypedSigner = new Function(`${edgeValidatorSource}\nreturn validateTypedSigner;`)();
const multiClientName = 'Victoria Niven, James Miller';
const quoteRow = { client_name: multiClientName, data: {} };

for (const signer of ['Victoria Niven', 'James Miller']) {
  assert.strictEqual(
    browserMatcher.matchClientName(signer, multiClientName).matches,
    true,
    `browser should allow listed client ${signer}`
  );
  assert.strictEqual(
    validateTypedSigner(quoteRow, signer).valid,
    true,
    `secure signing endpoint should allow listed client ${signer}`
  );
}

for (const signer of ['Victoria', 'James', 'Unlisted Person']) {
  assert.strictEqual(
    browserMatcher.matchClientName(signer, multiClientName).matches,
    false,
    `browser should reject incomplete or unlisted signer ${signer}`
  );
  assert.strictEqual(
    validateTypedSigner(quoteRow, signer).valid,
    false,
    `secure signing endpoint should reject incomplete or unlisted signer ${signer}`
  );
}

assert.strictEqual(
  validateTypedSigner({ client_name: 'Old Display Name', data: { portal_client_name: multiClientName } }, 'James Miller').valid,
  true,
  'secure signing should use the current portal client names when present'
);

console.log('multi-client typed signature tests passed');
