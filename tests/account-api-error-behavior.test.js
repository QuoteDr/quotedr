const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'account-access.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

function accountContext(options = {}) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const ownerUserId = options.owner === false
    ? '22222222-2222-4222-8222-222222222222'
    : userId;
  const functionResult = options.functionResult;
  const client = {
    supabaseUrl: 'https://example.supabase.co',
    auth: {
      storageKey: 'sb-example-auth-token',
      getSession: async () => ({ data: { session: { user: { id: userId, email: 'owner@example.test' } } } }),
      onAuthStateChange() {}
    },
    functions: {
      async invoke(_name, request) {
        if (request.body.action === 'context') {
          return {
            error: null,
            data: {
              data: {
                user: { id: userId, email: 'owner@example.test' },
                accounts: [{
                  accountId: '33333333-3333-4333-8333-333333333333',
                  ownerUserId,
                  permissions: ['account.read', 'team.read', 'roles.manage'],
                  fields: {}
                }]
              }
            }
          };
        }
        return functionResult;
      }
    }
  };
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    localStorage: storage(),
    sessionStorage: storage(),
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    URL,
    Error,
    Object,
    Set,
    Map,
    Array,
    JSON,
    String,
    RegExp,
    _supabase: client,
    _supabaseClient: client
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'account-access.js' });
  return context;
}

test('FunctionsHttpError response bodies become controlled actionable role errors', async () => {
  const context = accountContext({
    functionResult: {
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'A role with this name already exists.',
            code: 'role_name_taken'
          })
        }
      }
    }
  });
  await context.QuoteDrAccount.init({ force: true });
  await assert.rejects(
    context.QuoteDrAccount.api('roles.save', {}),
    (error) => {
      assert.equal(error.code, 'role_name_taken');
      assert.equal(error.message, 'A role with this name already exists. Choose a different name or edit the existing role.');
      assert.doesNotMatch(error.message, /non-2xx/i);
      return true;
    }
  );
});

test('unexpected server details are not exposed and a safe support reference is retained', async () => {
  const context = accountContext({
    functionResult: {
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'duplicate key value includes private SQL details',
            code: 'PGRST_INTERNAL',
            supportId: 'ab12-cd34'
          })
        }
      }
    }
  });
  await context.QuoteDrAccount.init({ force: true });
  await assert.rejects(
    context.QuoteDrAccount.api('roles.save', {}),
    (error) => {
      assert.equal(error.code, 'PGRST_INTERNAL');
      assert.match(error.message, /account request could not be completed/i);
      assert.match(error.message, /Reference AB12-CD34/);
      assert.doesNotMatch(error.message, /duplicate key|private SQL|PGRST_INTERNAL/i);
      return true;
    }
  );
});

test('owner identity is distinct from a grantable permission', async () => {
  const owner = accountContext({ functionResult: { data: { data: {} }, error: null } });
  await owner.QuoteDrAccount.init({ force: true });
  assert.equal(owner.QuoteDrAccount.isOwner(), true);

  const nonOwner = accountContext({ owner: false, functionResult: { data: { data: {} }, error: null } });
  await nonOwner.QuoteDrAccount.init({ force: true });
  assert.equal(nonOwner.QuoteDrAccount.can('roles.manage'), true);
  assert.equal(nonOwner.QuoteDrAccount.isOwner(), false);
});
