const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSION_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FIELD_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FIELD_LEVELS = new Set(['hidden', 'read', 'write']);

export class AccountRolePolicyError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'AccountRolePolicyError';
    this.status = status;
    this.code = code;
  }
}

export function assertAccountRoleOwner(userId, ownerUserId) {
  if (typeof userId !== 'string' || typeof ownerUserId !== 'string' || userId !== ownerUserId) {
    throw new AccountRolePolicyError(
      'Only the account owner can manage role templates.',
      403,
      'permission_denied'
    );
  }
}

function roleInputError(message, code) {
  throw new AccountRolePolicyError(message, 400, code);
}

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeAccountRoleSave(body) {
  if (!isPlainObject(body)) roleInputError('Enter valid role settings.', 'invalid_role_request');

  const rawRoleId = body.roleId == null ? '' : body.roleId;
  if (typeof rawRoleId !== 'string') roleInputError('Choose a valid custom role.', 'invalid_role_id');
  const roleId = rawRoleId.trim();
  if (roleId && !UUID_PATTERN.test(roleId)) roleInputError('Choose a valid custom role.', 'invalid_role_id');

  if (typeof body.name !== 'string') roleInputError('Enter a role name between 1 and 80 characters.', 'invalid_role_name');
  const name = body.name.trim();
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    roleInputError('Enter a role name between 1 and 80 characters.', 'invalid_role_name');
  }

  if (body.description != null && typeof body.description !== 'string') {
    roleInputError('Keep the role description under 300 characters.', 'invalid_role_description');
  }
  const description = String(body.description || '').trim();
  if (description.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) {
    roleInputError('Keep the role description under 300 characters.', 'invalid_role_description');
  }

  if (!Array.isArray(body.permissionKeys) || body.permissionKeys.length > 100) {
    roleInputError('Review the selected capabilities and try again.', 'invalid_role_permissions');
  }
  const permissionKeys = [];
  const seenPermissions = new Set();
  for (const value of body.permissionKeys) {
    if (typeof value !== 'string') roleInputError('Review the selected capabilities and try again.', 'invalid_role_permissions');
    const key = value.trim();
    if (key.length > 100 || !PERMISSION_PATTERN.test(key)) {
      roleInputError('Review the selected capabilities and try again.', 'invalid_role_permissions');
    }
    if (!seenPermissions.has(key)) {
      seenPermissions.add(key);
      permissionKeys.push(key);
    }
  }

  if (!isPlainObject(body.fieldAccess) || Object.keys(body.fieldAccess).length > 200) {
    roleInputError('Review the field privacy settings and try again.', 'invalid_role_fields');
  }
  const fieldAccess = {};
  for (const [rawFieldKey, rawLevel] of Object.entries(body.fieldAccess)) {
    const fieldKey = String(rawFieldKey).trim();
    if (fieldKey.length > 100 || !FIELD_PATTERN.test(fieldKey) || typeof rawLevel !== 'string') {
      roleInputError('Review the field privacy settings and try again.', 'invalid_role_fields');
    }
    const level = rawLevel.trim();
    if (!FIELD_LEVELS.has(level)) roleInputError('Review the field privacy settings and try again.', 'invalid_role_fields');
    fieldAccess[fieldKey] = level;
  }

  return { roleId: roleId || null, name, description, permissionKeys, fieldAccess };
}

/** @type {ReadonlyArray<readonly [string, number, string, string]>} */
const ROLE_RPC_ERROR_RULES = Object.freeze([
  ['Role name must be', 400, 'invalid_role_name', 'Enter a role name between 1 and 80 characters.'],
  ['Role description is too long', 400, 'invalid_role_description', 'Keep the role description under 300 characters.'],
  ['A role with this name already exists', 409, 'role_name_taken', 'A role with this name already exists. Choose a different name or edit the existing role.'],
  ['Role contains an unknown permission', 400, 'invalid_role_permissions', 'One or more capabilities are no longer available. Reload Team settings and try again.'],
  ['Role contains an invalid number of permissions', 400, 'invalid_role_permissions', 'Review the selected capabilities and try again.'],
  ['Role contains an owner-only permission', 403, 'role_owner_only_permission', 'This capability is reserved for the account owner. Remove it and save again.'],
  ['Role is missing a required permission', 400, 'role_permission_dependency', 'A selected capability is missing a required capability. Reload Team settings and try again.'],
  ['Role contains an invalid field rule', 400, 'invalid_role_fields', 'Review the field privacy settings and try again.'],
  ['Role contains too many field rules', 400, 'invalid_role_fields', 'Review the field privacy settings and try again.'],
  ['Field access must be an object', 400, 'invalid_role_fields', 'Review the field privacy settings and try again.'],
  ['Field access requires its view permission', 400, 'role_field_view_required', 'A visible field is missing its matching view capability. Reload Team settings and try again.'],
  ['Field edit access requires its edit permission', 400, 'role_field_edit_required', 'An editable field is missing its matching edit capability. Reload Team settings and try again.'],
  ['Custom role was not found', 404, 'role_not_found', 'This custom role no longer exists. Reload Team settings and try again.'],
  ['Reassign members before archiving this role', 409, 'role_in_use', 'Reassign members before archiving this role.'],
  ['Revoke pending invitations before archiving this role', 409, 'role_invitation_pending', 'Revoke pending invitations before archiving this role.'],
  ['Permission denied', 403, 'permission_denied', 'Only the account owner can manage role templates.']
]);

export function accountRoleRpcFailure(error) {
  const raw = String(error && error.message || '');
  for (const [prefix, status, code, message] of ROLE_RPC_ERROR_RULES) {
    if (raw.startsWith(prefix)) return { status, code, message };
  }
  if (String(error && error.code || '') === '23505') {
    return {
      status: 409,
      code: 'role_name_taken',
      message: 'A role with this name already exists. Choose a different name or edit the existing role.'
    };
  }
  if (String(error && error.code || '') === '42501') {
    return { status: 403, code: 'permission_denied', message: 'Only the account owner can manage role templates.' };
  }
  return null;
}
