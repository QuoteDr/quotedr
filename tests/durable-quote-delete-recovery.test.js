const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const supabase = fs.readFileSync('supabase-v2.js', 'utf8');
const coordinator = fs.readFileSync('save-coordinator.js', 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const supabaseContext = { String };
vm.createContext(supabaseContext);
vm.runInContext(extractFunction(supabase, 'qdDurableWriteRequiresRows'), supabaseContext);

assert.strictEqual(
  supabaseContext.qdDurableWriteRequiresRows('delete', {}),
  false,
  'legacy queued deletes should accept an already-absent cloud row'
);
assert.strictEqual(
  supabaseContext.qdDurableWriteRequiresRows('update', {}),
  true,
  'updates must still require a returned cloud row'
);
assert.strictEqual(
  supabaseContext.qdDurableWriteRequiresRows('update', { expectRows: false }),
  false,
  'explicit fire-and-confirm targets may opt out of returned rows'
);

const coordinatorContext = {
  String,
  Array,
  errorObject(error) {
    return {
      code: error && error.code || '',
      message: error && error.message || ''
    };
  }
};
vm.createContext(coordinatorContext);
vm.runInContext(extractFunction(coordinator, 'isQuoteDeleteOperation'), coordinatorContext);
vm.runInContext(extractFunction(coordinator, 'isMissingCloudQuoteOperation'), coordinatorContext);

const legacyDelete = {
  entityType: 'quote',
  action: 'delete',
  target: { table: 'quotes', action: 'delete' }
};
assert.strictEqual(
  coordinatorContext.isQuoteDeleteOperation(legacyDelete),
  true,
  'quote conflict recovery should preserve a delete tombstone instead of saving the quote again'
);
assert.strictEqual(
  coordinatorContext.isMissingCloudQuoteOperation({
    entityType: 'quote',
    action: 'update',
    target: { table: 'quotes', action: 'update' }
  }, { code: 'QD_NO_ROWS_MATCHED', message: 'Cloud save matched no records.' }),
  true,
  'an update for a cloud quote that no longer exists should require a user recovery decision'
);
assert.strictEqual(
  coordinatorContext.isMissingCloudQuoteOperation(legacyDelete, {
    code: 'QD_NO_ROWS_MATCHED',
    message: 'Cloud save matched no records.'
  }),
  false,
  'an already-absent delete should be acknowledged rather than sent to manual recovery'
);

assert(
  supabase.includes("noRowsError.code = 'QD_NO_ROWS_MATCHED'") &&
    supabase.includes('if (qdDurableWriteRequiresRows(action, target)') &&
    supabase.includes("target: { table: 'quotes', action: 'delete'") &&
    supabase.includes('expectRows: false'),
  'quote deletes should be explicitly idempotent and no-row updates should retain a stable recovery code'
);
assert(
  coordinator.includes('if (isQuoteDeleteOperation(operation))') &&
    coordinator.includes("operation.state = 'delete_pending'") &&
    coordinator.includes('Export &amp; Clear Obsolete Retry'),
  'recovery should finish delete conflicts as deletes and expose a normal-user cleanup path'
);

console.log('durable quote delete recovery checks passed');
