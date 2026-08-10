import assert from 'node:assert/strict';

const apiUrl = String(process.env.QD_DISPOSABLE_API_URL || '').replace(/\/$/, '');
const anonKey = String(process.env.QD_DISPOSABLE_ANON_KEY || '');

assert(apiUrl.startsWith('http://127.0.0.1:'), 'Disposable API URL must be local');
assert(anonKey, 'Disposable anon key is required');

const response = await fetch(`${apiUrl}/rest/v1/rpc/quotedr_accept_team_invitation`, {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ p_token: 'qd-valid-looking-anon-token-000000000001' })
});

const responseText = await response.text();
assert.equal(response.ok, false, 'anon invitation acceptance must fail');
assert(
  response.status === 401 || response.status === 403 || response.status === 404,
  `anon invitation acceptance returned unexpected status ${response.status}`
);
assert.doesNotMatch(responseText, /token_hash|auth\.users|account_memberships|SQLSTATE|search_path/i);

console.log('Disposable anon invitation RPC denial passed.');
