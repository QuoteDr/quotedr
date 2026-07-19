const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('supabase-v2.js', 'utf8');

function extractFunction(name) {
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

function makeSupabase(currentRow, counters) {
  return {
    from(table) {
      assert.strictEqual(table, 'quotes');
      return {
        select() {
          const read = {
            eq() { return read; },
            limit() { return read; },
            maybeSingle() { return Promise.resolve({ data: currentRow, error: null }); }
          };
          return read;
        },
        update() {
          counters.updates += 1;
          const write = {
            eq() { return write; },
            is() { return write; },
            select() {
              return Promise.resolve({
                data: [{ id: currentRow.id, updated_at: '2026-07-19T14:03:00.000Z' }],
                error: null
              });
            }
          };
          return write;
        }
      };
    }
  };
}

function makeOperation(editorInstanceId, clientEditedAt) {
  return {
    userId: 'user-1',
    operationId: 'new-operation',
    revision: 'new-revision',
    baseVersion: '2026-07-19T14:00:00.000Z',
    localSavedAt: '2026-07-19T14:02:00.000Z',
    payload: {
      _editorInstanceId: editorInstanceId,
      _clientEditedAt: clientEditedAt,
      savedAt: '2026-07-19T14:02:00.000Z'
    }
  };
}

(async function run() {
  const currentRow = {
    id: 'quote-1',
    user_id: 'user-1',
    status: 'sent',
    type: 'quote',
    quote_number: 'Q-100',
    updated_at: '2026-07-19T14:01:00.000Z',
    data: {
      _editorInstanceId: 'tab-1',
      _saveMeta: {
        operationId: 'previous-operation',
        revision: 'previous-revision',
        sourceInstanceId: 'tab-1',
        clientEditedAt: '2026-07-19T13:59:00.000Z',
        localSavedAt: '2026-07-19T14:01:00.000Z'
      }
    }
  };
  const counters = { updates: 0 };
  const context = {
    console,
    Date,
    Error,
    Number,
    String,
    _supabase: makeSupabase(currentRow, counters),
    qdApplyDurableFilters(query, filters) {
      (filters || []).forEach(filter => query.eq(filter.column, filter.value));
      return query;
    },
    qdDurableSaveError(error, fallback) {
      return error instanceof Error ? error : new Error((error && error.message) || fallback);
    }
  };
  vm.createContext(context);
  [
    'qdDurableVersionsMatch',
    'qdDurableSaveMetaMatches',
    'qdDurableSaveTime',
    'qdQuoteOperationEditTime',
    'qdQuoteCloudEditTime',
    'qdQuoteOperationSavedTime',
    'qdQuoteCloudSavedTime',
    'qdQuoteOperationIsSuperseded',
    'qdQuoteMetadataRow',
    'qdExecuteFreshQuoteUpdate'
  ].forEach(name => vm.runInContext(extractFunction(name), context));

  const target = {
    filters: [{ column: 'id', value: 'quote-1' }],
    requireCurrentQuoteBase: true,
    values: { data: { _editorInstanceId: 'tab-1' } }
  };

  const sameTabResult = await context.qdExecuteFreshQuoteUpdate(
    makeOperation('tab-1', '2026-07-19T14:02:00.000Z'),
    target,
    target.values
  );
  assert.strictEqual(counters.updates, 1, 'a newer save from the same editor should proceed after its earlier acknowledgement advances the cloud version');
  assert.strictEqual(sameTabResult.data[0].updated_at, '2026-07-19T14:03:00.000Z');

  let crossDeviceError = null;
  try {
    await context.qdExecuteFreshQuoteUpdate(
      makeOperation('tab-2', '2026-07-19T14:02:00.000Z'),
      target,
      target.values
    );
  } catch (error) {
    crossDeviceError = error;
  }
  assert(crossDeviceError && String(crossDeviceError.code) === '409', 'a different editor with a stale base must still conflict');
  assert.strictEqual(counters.updates, 1, 'a cross-device conflict must not write');

  const olderSameTab = await context.qdExecuteFreshQuoteUpdate(
    makeOperation('tab-1', '2026-07-19T13:58:00.000Z'),
    target,
    target.values
  );
  assert.strictEqual(olderSameTab.superseded, true, 'an actually older payload from the same editor should still yield to its newer cloud copy');
  assert.strictEqual(counters.updates, 1, 'a superseded same-editor payload must not write');

  currentRow.data.portal_visible = true;
  let portalLockedError = null;
  try {
    await context.qdExecuteFreshQuoteUpdate(
      makeOperation('tab-1', '2026-07-19T14:04:00.000Z'),
      target,
      target.values
    );
  } catch (error) {
    portalLockedError = error;
  }
  assert(portalLockedError && portalLockedError.code === 'PORTAL_LOCKED', 'a queued builder write must stop once the cloud quote is portal-visible');
  assert.strictEqual(counters.updates, 1, 'a queued builder write must not overwrite a portal-locked quote');

  const dashboardTarget = {
    filters: [{ column: 'id', value: 'quote-1' }],
    requireCurrentQuoteBase: false,
    values: { data: { portal_visible: false } }
  };
  await context.qdExecuteFreshQuoteUpdate(
    makeOperation('dashboard', '2026-07-19T14:04:00.000Z'),
    dashboardTarget,
    dashboardTarget.values
  );
  assert.strictEqual(counters.updates, 2, 'dashboard portal-management writes must remain able to remove the lock');

  console.log('quote same-editor compare-and-swap tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
