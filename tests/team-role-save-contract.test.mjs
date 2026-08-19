import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccountRolePolicyError,
  accountRoleRpcFailure,
  assertAccountRoleOwner,
  normalizeAccountRoleSave
} from '../supabase/functions/_shared/account-role-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const originalMigration = read('supabase/migrations/20260808000808_custom_role_field_permissions.sql');
const repairMigration = read('supabase/migrations/20260809041332_repair_account_role_save.sql');
const accountApi = read('supabase/functions/team-account/index.ts');

function estimatorDuplicate(overrides = {}) {
  return {
    roleId: null,
    name: 'Testing Estimator',
    description: 'Build quotes without protected account settings.',
    permissionKeys: [
      'account.read', 'team.read', 'quotes.read', 'quotes.create', 'quotes.update',
      'quotes.fields.write', 'items.read', 'clients.read', 'clients.manage', 'templates.read'
    ],
    fieldAccess: {
      'quotes.number': 'write',
      'quotes.scope': 'write',
      'items.name': 'read',
      'items.description': 'read',
      'items.sell_price': 'read',
      'business.tax_number': 'hidden'
    },
    ...overrides
  };
}

test('the reported Estimator duplicate payload is normalized without changing its access choices', () => {
  const normalized = normalizeAccountRoleSave(estimatorDuplicate({
    name: '  Testing Estimator  ',
    permissionKeys: ['account.read', 'team.read', 'quotes.read', 'quotes.read']
  }));
  assert.equal(normalized.name, 'Testing Estimator');
  assert.deepEqual(normalized.permissionKeys, ['account.read', 'team.read', 'quotes.read']);
  assert.equal(normalized.fieldAccess['business.tax_number'], 'hidden');
});

test('role names and descriptions fail with controlled validation errors', () => {
  for (const payload of [
    estimatorDuplicate({ name: '   ' }),
    estimatorDuplicate({ name: 'x'.repeat(81) }),
    estimatorDuplicate({ name: 'bad\nname' })
  ]) {
    assert.throws(() => normalizeAccountRoleSave(payload), (error) => {
      assert.ok(error instanceof AccountRolePolicyError);
      assert.equal(error.code, 'invalid_role_name');
      return true;
    });
  }
  assert.throws(
    () => normalizeAccountRoleSave(estimatorDuplicate({ description: 'x'.repeat(301) })),
    (error) => error instanceof AccountRolePolicyError && error.code === 'invalid_role_description'
  );
});

test('malformed capabilities and field rules are rejected before the RPC', () => {
  for (const permissionKeys of ['quotes.read', [42], ['quotes read'], Array(101).fill('quotes.read')]) {
    assert.throws(
      () => normalizeAccountRoleSave(estimatorDuplicate({ permissionKeys })),
      (error) => error instanceof AccountRolePolicyError && error.code === 'invalid_role_permissions'
    );
  }
  for (const fieldAccess of [[], null, { 'quotes.scope': 'owner' }, { 'quotes scope': 'read' }]) {
    assert.throws(
      () => normalizeAccountRoleSave(estimatorDuplicate({ fieldAccess })),
      (error) => error instanceof AccountRolePolicyError && error.code === 'invalid_role_fields'
    );
  }
});

test('permission-key validation stays aligned with the extensible database key format', () => {
  const normalized = normalizeAccountRoleSave(estimatorDuplicate({
    permissionKeys: ['quotes.read', 'quotes.line_items.read']
  }));
  assert.deepEqual(normalized.permissionKeys, ['quotes.read', 'quotes.line_items.read']);
});

test('only the owner identity can manage role templates even if a member has the capability', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  assert.doesNotThrow(() => assertAccountRoleOwner(ownerId, ownerId));
  assert.throws(
    () => assertAccountRoleOwner('22222222-2222-4222-8222-222222222222', ownerId),
    (error) => error instanceof AccountRolePolicyError
      && error.status === 403
      && error.code === 'permission_denied'
  );
});

test('database role errors map to fixed actionable messages without exposing SQL details', () => {
  assert.deepEqual(
    accountRoleRpcFailure({ code: '23505', message: 'duplicate key value violates unique constraint account_roles_active_account_name_unique' }),
    {
      status: 409,
      code: 'role_name_taken',
      message: 'A role with this name already exists. Choose a different name or edit the existing role.'
    }
  );
  assert.deepEqual(
    accountRoleRpcFailure({ code: '42501', message: 'Permission denied' }),
    { status: 403, code: 'permission_denied', message: 'Only the account owner can manage role templates.' }
  );
  assert.equal(
    accountRoleRpcFailure({ code: '42883', message: 'function jsonb_object_length(jsonb) does not exist' }),
    null
  );
});

test('repair removes the invalid audit call and keeps all writes inside one atomic RPC', () => {
  assert.match(originalMigration, /jsonb_object_length\(v_field_access\)/);
  assert.doesNotMatch(repairMigration, /jsonb_object_length\s*\(/);
  assert.match(repairMigration, /create or replace function public\.quotedr_save_account_role/i);
  assert.match(repairMigration, /begin;[\s\S]+create or replace function public\.quotedr_save_account_role[\s\S]+commit;/i);
  assert.match(repairMigration, /delete from public\.account_role_permissions[\s\S]+insert into public\.account_role_fields[\s\S]+insert into public\.account_audit_events/i);
  assert.match(repairMigration, /'fieldRuleCount', v_field_rule_count/);
  assert.match(repairMigration, /select count\(\*\)::integer[\s\S]{0,100}from jsonb_each_text\(v_field_access\)/i);
});

test('same-name retries are serialized and exact replays return the existing role', () => {
  assert.match(repairMigration, /create unique index if not exists account_roles_active_account_name_unique/i);
  assert.match(repairMigration, /pg_advisory_xact_lock\([\s\S]{0,180}hashtextextended/i);
  assert.match(repairMigration, /v_existing_permissions = v_permission_keys[\s\S]{0,120}v_existing_fields = v_visible_field_access[\s\S]{0,80}return v_role_id;/i);
  assert.match(repairMigration, /raise exception 'A role with this name already exists' using errcode = '23505'/i);
});

test('role management is owner-only while sensitive permissions remain catalog-driven', () => {
  assert.match(repairMigration, /a\.owner_user_id = auth\.uid\(\)/i);
  assert.match(repairMigration, /assignable_to_custom = false[\s\S]{0,80}permission_key = 'roles\.manage'/i);
  assert.match(repairMigration, /where not p\.assignable_to_custom/i);
  assert.match(accountApi, /function requireRoleManagementOwner/i);
  assert.match(accountApi, /assertAccountRoleOwner\(auth\.user\.id, auth\.ownerUserId\)/i);
  assert.match(accountApi, /customRoleAllowed: permission\.assignable_to_custom !== false/i);
  assert.doesNotMatch(accountApi, /roleKey\s*={2,3}\s*['"]owner['"]/i);
});

test('accounting export additions remain wired beside the repaired RBAC actions', () => {
  assert.match(accountApi, /from '\.\.\/_shared\/accounting-export\.mjs'/);
  assert.match(accountApi, /action === 'accounting\.export'/);
  assert.match(accountApi, /action === 'roles\.save'/);
});
