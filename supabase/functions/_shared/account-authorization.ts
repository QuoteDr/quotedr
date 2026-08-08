import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export const ACCOUNT_PERMISSION = Object.freeze({
  ACCOUNT_READ: 'account.read',
  TEAM_READ: 'team.read',
  TEAM_MANAGE: 'team.manage',
  ROLES_MANAGE: 'roles.manage',
  BUSINESS_READ: 'business.read',
  BUSINESS_MANAGE: 'business.manage',
  SETTINGS_MANAGE: 'settings.manage',
  QUOTES_READ: 'quotes.read',
  QUOTES_CREATE: 'quotes.create',
  QUOTES_UPDATE: 'quotes.update',
  QUOTES_DELETE: 'quotes.delete',
  QUOTES_SEND: 'quotes.send',
  QUOTES_PRICING_READ: 'quotes.pricing.read',
  QUOTES_PRICING_MANAGE: 'quotes.pricing.manage',
  ITEMS_READ: 'items.read',
  ITEMS_MANAGE: 'items.manage',
  ITEMS_PRICING_READ: 'items.pricing.read',
  CLIENTS_READ: 'clients.read',
  CLIENTS_MANAGE: 'clients.manage',
  CLIENTS_DELETE: 'clients.delete',
  TEMPLATES_READ: 'templates.read',
  TEMPLATES_MANAGE: 'templates.manage',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_MANAGE: 'payments.manage',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  LABOR_READ: 'labor.read',
  LABOR_MANAGE: 'labor.manage',
  ANALYTICS_READ: 'analytics.read'
});

export type AccountAuthorization = {
  accountId: string;
  ownerUserId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  user: User;
  token: string;
  userClient: SupabaseClient;
};

export type AccountFieldAccess = Record<string, 'read' | 'write'>;

export class AccountAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = 'permission_denied') {
    super(message);
    this.name = 'AccountAccessError';
    this.status = status;
    this.code = code;
  }
}

function environment() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  // Supabase URL and keys are required.
  const configured = url.length > 0 && anonKey.length > 0;
  if (configured === false) throw new AccountAccessError('Account service unavailable', 503, 'service_unavailable');
  return { url, anonKey, serviceRoleKey };
}

export function bearerToken(req: Request) {
  const authorization = req.headers.get('Authorization') || '';
  if (authorization.startsWith('Bearer ') === false) {
    throw new AccountAccessError('Authentication required', 401, 'authentication_required');
  }
  const token = authorization.slice(7).trim();
  if (token.length === 0) {
    throw new AccountAccessError('Authentication required', 401, 'authentication_required');
  }
  return token;
}

export function serviceClient() {
  const { url, serviceRoleKey } = environment();
  if (serviceRoleKey.length === 0) {
    throw new AccountAccessError('Account service unavailable', 503, 'service_unavailable');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function authenticatedClient(req: Request) {
  const token = bearerToken(req);
  const { url, anonKey } = environment();
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || data.user == null) {
    throw new AccountAccessError('Authentication required', 401, 'authentication_required');
  }
  return { token, user: data.user, client };
}

export async function requireAccountPermission(
  req: Request,
  accountId: unknown,
  permissionKey: string
): Promise<AccountAuthorization> {
  const normalizedAccountId = String(accountId || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedAccountId) === false) {
    throw new AccountAccessError('Choose an account', 400, 'account_required');
  }
  const { token, user, client } = await authenticatedClient(req);
  const { data, error } = await client.rpc('quotedr_authorize_account', {
    p_account_id: normalizedAccountId,
    p_permission_key: permissionKey
  });
  const authorization = Array.isArray(data) ? data[0] : data;
  if (error || authorization == null) {
    throw new AccountAccessError('Permission denied', 403, 'permission_denied');
  }
  return {
    accountId: authorization.account_id,
    ownerUserId: authorization.owner_user_id,
    membershipId: authorization.membership_id,
    roleId: authorization.role_id,
    roleKey: authorization.role_key,
    roleName: authorization.role_name,
    user,
    token,
    userClient: client
  };
}

export async function loadAccountContext(req: Request) {
  const { client, user } = await authenticatedClient(req);
  const { data, error } = await client.rpc('quotedr_account_context');
  if (error) throw new AccountAccessError('Account context failed', 500, 'context_failed');
  return { user, accounts: Array.isArray(data) ? data : [] };
}

export async function loadAccountFieldAccess(
  auth: AccountAuthorization
): Promise<AccountFieldAccess> {
  const { data, error } = await serviceClient()
    .from('account_role_fields')
    .select('field_key,access_level')
    .eq('role_id', auth.roleId);
  if (error) {
    throw new AccountAccessError('Field permissions are unavailable', 503, 'field_permissions_unavailable');
  }
  const fields: AccountFieldAccess = {};
  for (const row of data || []) {
    const fieldKey = String(row.field_key || '');
    const accessLevel = String(row.access_level || '');
    if (fieldKey && (accessLevel === 'read' || accessLevel === 'write')) {
      fields[fieldKey] = accessLevel;
    }
  }
  return fields;
}

export async function requireAccountPermissionWithDefault(
  req: Request,
  accountId: unknown,
  permissionKey: string
) {
  let selected = String(accountId || '').trim();
  if (selected.length === 0) {
    const context = await loadAccountContext(req);
    const owned = context.accounts.find((account: Record<string, unknown>) => {
      return account.ownerUserId === context.user.id;
    });
    const fallback = owned || (context.accounts.length === 1 ? context.accounts[0] : null);
    if (!fallback) {
      throw new AccountAccessError('Choose an account', 400, 'account_required');
    }
    selected = fallback && fallback.accountId || '';
  }
  return requireAccountPermission(req, selected, permissionKey);
}

let referenceKeyPromise: Promise<CryptoKey> | null = null;

async function referenceKey() {
  if (referenceKeyPromise == null) {
    const { serviceRoleKey } = environment();
    const secret = Deno.env.get('TEAM_DATA_REFERENCE_SECRET') || serviceRoleKey;
    if (secret.length === 0) {
      throw new AccountAccessError('Account service unavailable', 503, 'service_unavailable');
    }
    referenceKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return referenceKeyPromise;
}

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signedReference(value: string) {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await referenceKey(),
    new TextEncoder().encode(value)
  );
  return 'v1.' + base64Url(signature);
}

export async function annotateQuoteReferences<T extends Record<string, unknown>>(
  accountId: string,
  row: T
): Promise<T> {
  const output = JSON.parse(JSON.stringify(row || {}));
  const data = output.data && typeof output.data === 'object' ? output.data : null;
  const rooms = data && Array.isArray(data.rooms) ? data.rooms : [];
  const quoteId = String(output.id || 'new');
  for (let roomIndex = 0; roomIndex < rooms.length; roomIndex += 1) {
    const room = rooms[roomIndex];
    if (room == null || typeof room !== 'object') continue;
    const roomIdentity = (room.id == null ? 'no-id' : 'id:' + room.id) + ':index:' + roomIndex;
    room._quotedrTeamRef = await signedReference(
      accountId + ':' + quoteId + ':room:' + roomIdentity
    );
    const items = Array.isArray(room.items) ? room.items : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (item == null || typeof item !== 'object') continue;
      const itemIdentity = (item.id == null ? 'no-id' : 'id:' + item.id) + ':index:' + itemIndex;
      item._quotedrTeamRef = await signedReference(
        accountId + ':' + quoteId + ':room:' + roomIdentity + ':item:' + itemIdentity
      );
    }
  }
  return output;
}
