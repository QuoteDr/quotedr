import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRequest,
  callCoordinator,
  renderReviewableBrief,
} from '../scripts/ai-operations-coordinator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const edge = read('supabase/functions/ai-operations-coordinator/index.ts');
const sensitivity = read('supabase/functions/_shared/coordinator-review-sensitivity.mjs');
const migration = read('supabase/migrations/20260808200503_ai_operations_coordinator_receiver.sql');
const config = read('supabase/config.toml');
const envExample = read('scripts/ai-operations-coordinator.env.example');
const fixture = JSON.parse(read('tests/fixtures/ai-operations-coordinator-synthetic.json'));

assert(edge.includes("Deno.env.get('QUOTEDR_COORDINATOR_TOKEN')"), 'receiver must use a separate coordinator secret');
assert(edge.includes("Deno.env.get('QUOTEDR_COORDINATOR_ENABLED') === 'true'"), 'receiver should fail closed behind an explicit kill switch');
assert(edge.includes("Deno.env.get('QUOTEDR_COORDINATOR_TEST_EMAIL_ENABLED') === 'true'"), 'the one test email should have a separate kill switch');
assert(edge.includes('constantTimeEqual'), 'coordinator secret comparison should use a constant-time digest comparison');
assert(edge.indexOf('await authenticate(req)') < edge.indexOf('const body = await readBody(req)'), 'authorization must happen before request parsing or database access');
assert(!edge.includes(".from('ai_support_cases')"), 'receiver must not query raw support cases');
assert(!edge.includes(".from('ai_engineering_work_items')"), 'receiver must not query broader engineering work items');
assert(edge.includes(".from('ai_engineering_coordinator_inbox')"), 'receiver should query only the privacy-minimized inbox');
const reviewableColumns = edge.match(/const REVIEWABLE_COLUMNS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
assert(!reviewableColumns.includes('claimed_by_email'), 'review responses should omit coordinator email identity');
assert(!reviewableColumns.includes('idempotency_key'), 'review responses should omit internal action keys');
assert(!edge.includes('Access-Control-Allow-Origin'), 'machine-only receiver should not expose browser CORS');
assert(edge.includes("if (req.method !== 'POST')"), 'receiver should be POST-only');
assert(edge.includes('MAX_ACTIONS_PER_MINUTE = 30') && edge.includes('rate_limit_unavailable'), 'receiver should enforce a fail-closed coordinator-only rate limit');
assert(edge.includes("action === 'poll'") && edge.includes("action === 'heartbeat'"), 'receiver should expose single poll and explicit heartbeat actions');
assert(edge.includes("actionType: 'request_rejected'"), 'authenticated rejected actions should receive a sanitized audit record');
assert(edge.includes("findAudit(client, key, 'notification_confirmed')"), 'notification confirmation should be idempotent');
assert(edge.includes("findAudit(client, key, 'owner_decision')"), 'owner decision recording should be idempotent');
assert(!edge.includes("action === 'launch_agent'"), 'receiver must not expose agent launch');
assert(!edge.includes("action === 'deploy_code'"), 'receiver must not expose deployment');
assert(!edge.includes("action === 'send_customer_message'"), 'receiver must not expose customer messaging');
assert(edge.includes("const OWNER_NOTIFICATION_EMAIL = 'admin@quotedr.io'"), 'test email recipient must be fixed');
assert(edge.includes('[TEST — NO ACTION REQUIRED] QuoteDr code review notification'), 'test subject must carry the required no-action prefix');
assert(edge.includes('ownerAuthorizedSingleTestEmail') && edge.includes('syntheticDashboardFlowPassed') && edge.includes('dryRunGatesPassed'), 'all test-email gates should be explicit');
assert(edge.includes("'Idempotency-Key': `quotedr-aiops-test-${requestId}`"), 'email provider request should be idempotent');
assert(edge.includes('deliveryConfirmed: notification.status === \'confirmed\''), 'provider acceptance must not be called delivery');
assert(edge.includes("actualBridge !== 'pinned_orchestrator_manual_local_worktree'"), 'recorded local work must disclose the actual manual bridge');
assert(edge.includes('deploymentAuthorized: false') && edge.includes('deploymentPerformed: false'), 'owner test decision must remain local-only');
assert(sensitivity.includes('refund|chargeback|financial|banking|data loss|privacy|access|security|breach|unauthori[sz]ed|expos'), 'mandatory owner-review language should include financial, privacy, security, access, and exposure categories');
assert(sensitivity.includes('signature|legal|medical|health'), 'mandatory owner-review language should retain signature, legal, and medical categories');
assert(!sensitivity.includes('request?.task_brief'), 'safety boilerplate must not be classified as issue content');

assert(/\[functions\.ai-operations-coordinator\]\s*verify_jwt\s*=\s*false/.test(config), 'custom-token receiver should disable platform JWT verification only for its own function');
assert(/\[functions\.ai-operations\]\s*verify_jwt\s*=\s*true/.test(config), 'existing browser admin function must retain JWT verification');
assert.equal(envExample.replace(/\r\n/g, '\n').trim(), [
  '# Copy these names into a local operating-system secret environment only after',
  '# the receiver has been separately approved and deployed. Never commit values.',
  'QUOTEDR_COORDINATOR_ENDPOINT=',
  'QUOTEDR_COORDINATOR_TOKEN=',
].join('\n'), 'environment template should contain names only and no credentials');

for (const table of [
  'ai_engineering_coordinator_action_audit',
  'ai_engineering_coordinator_notifications',
  'ai_engineering_coordinator_owner_decisions',
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `migration should create ${table}`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table} should enable RLS`);
  assert(migration.includes(`revoke all on table public.${table}`), `${table} should revoke default grants`);
}
assert(migration.includes('from public, anon, authenticated, service_role'), 'receiving tables should revoke all roles before least-privilege service grants');
assert(migration.includes('grant select, insert on table public.ai_engineering_coordinator_action_audit to service_role'), 'audit should be append-only');
assert(!migration.includes('grant select, insert, update on table public.ai_engineering_coordinator_action_audit'), 'audit must not grant update');
assert(migration.includes('ai_engineering_coordinator_inbox_claim_key_idx'), 'claims should have durable idempotency');
assert(migration.includes('ai_engineering_coordinator_inbox_heartbeat_key_idx'), 'heartbeats should have durable idempotency');
assert(migration.includes('coordinator_inbox_heartbeat'), 'heartbeat should be audited');
assert(migration.includes("notification_kind in ('synthetic_test', 'owner_deploy_review')"), 'notification schema should distinguish the one test from future owner review notices');
assert(migration.includes("pg_catalog.strpos(subject, '[TEST — NO ACTION REQUIRED] QuoteDr code review notification') = 1"), 'test notification subject should use valid PostgreSQL prefix enforcement');
assert(migration.includes("check (not deployment_authorized)"), 'synthetic owner decision must be unable to authorize deployment');
assert(!migration.toLowerCase().includes('grant delete'), 'receiver schema should grant no deletion');

const pollBody = buildRequest(['poll', '--idempotency-key', 'synthetic:poll:0001', '--limit', '1']);
assert.deepEqual(pollBody, { action: 'poll', idempotencyKey: 'synthetic:poll:0001', limit: 1 });
const claimBody = buildRequest([
  'claim', '--request-id', fixture.coordinatorRequest.id,
  '--idempotency-key', 'synthetic:claim:0001',
  '--owner-review-repeated', '--risk-checks-completed', '--privacy-review-repeated',
]);
assert.equal(claimBody.ownerReviewRepeated, true);
assert.equal(claimBody.riskChecksCompleted, true);
assert.equal(claimBody.privacyReviewRepeated, true);

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeSyntheticReceiver() {
  const state = {
    request: structuredClone(fixture.coordinatorRequest),
    audit: new Map(),
    fetchCount: 0,
  };
  const fetchImpl = async (_url, options) => {
    state.fetchCount += 1;
    assert.equal(options.headers.Authorization, 'Bearer ' + 'x'.repeat(43));
    const body = JSON.parse(options.body);
    if (state.audit.has(body.idempotencyKey)) return response({ ...state.audit.get(body.idempotencyKey), idempotentReplay: true });
    let result;
    if (body.action === 'poll') {
      result = { success: true, requests: [structuredClone(state.request)], pollMode: 'single_run', taskCreated: false };
    } else if (body.action === 'claim') {
      assert.equal(state.request.state, 'queued');
      state.request.state = 'claimed';
      state.request.attempt_count += 1;
      state.request.lease_expires_at = '2026-08-08T20:15:00.000Z';
      result = { success: true, request: structuredClone(state.request), reviewStillRequired: true, agentLaunched: false };
    } else if (body.action === 'heartbeat') {
      assert.equal(state.request.state, 'claimed');
      state.request.last_heartbeat_at = '2026-08-08T20:05:00.000Z';
      state.request.lease_expires_at = '2026-08-08T20:20:00.000Z';
      result = { success: true, requestId: state.request.id, singleHeartbeatRecorded: true, schedulerStarted: false };
    } else if (body.action === 'record_review') {
      assert.equal(body.disposition, 'synthetic_dry_run_ready');
      result = { success: true, requestId: state.request.id, disposition: body.disposition, codingTaskCreated: false, agentLaunched: false, deploymentPerformed: false };
    } else if (body.action === 'cancel_synthetic_test') {
      state.request.state = 'cancelled';
      result = { success: true, requestId: state.request.id, state: 'cancelled', syntheticAuditRetained: true, productionDataDeleted: false, deploymentPerformed: false };
    } else return response({ error: 'unsupported' }, 400);
    if (body.idempotencyKey) state.audit.set(body.idempotencyKey, structuredClone(result));
    return response(result);
  };
  return { state, fetchImpl };
}

const fake = makeSyntheticReceiver();
const endpoint = 'https://example.supabase.co/functions/v1/ai-operations-coordinator';
const token = 'x'.repeat(43);
const poll = await callCoordinator({ endpoint, token, body: pollBody, fetchImpl: fake.fetchImpl });
assert.equal(fake.state.fetchCount, 1, 'each local invocation should make one request only');
assert.equal(poll.requests[0].task_payload.case.customer_email_included, false);
assert.match(renderReviewableBrief(poll), /Deployment authorized: no/);
assert.match(renderReviewableBrief(poll), /SYNTHETIC COORDINATOR TEST/);

const claim = await callCoordinator({ endpoint, token, body: claimBody, fetchImpl: fake.fetchImpl });
assert.equal(claim.request.state, 'claimed');
const replayedClaim = await callCoordinator({ endpoint, token, body: claimBody, fetchImpl: fake.fetchImpl });
assert.equal(replayedClaim.idempotentReplay, true, 'claim retry should replay safely');

const heartbeat = await callCoordinator({
  endpoint, token,
  body: buildRequest(['heartbeat', '--request-id', fixture.coordinatorRequest.id, '--idempotency-key', 'synthetic:heartbeat:0001']),
  fetchImpl: fake.fetchImpl,
});
assert.equal(heartbeat.singleHeartbeatRecorded, true);
assert.equal(heartbeat.schedulerStarted, false);

const review = await callCoordinator({
  endpoint, token,
  body: buildRequest([
    'review', '--request-id', fixture.coordinatorRequest.id,
    '--idempotency-key', 'synthetic:review:0001',
    '--disposition', 'synthetic_dry_run_ready',
    '--review-summary', 'Synthetic brief is complete, privacy-minimized, and harmless.',
    '--brief-reviewed', '--evidence-reviewed', '--blast-radius-reviewed',
  ]),
  fetchImpl: fake.fetchImpl,
});
assert.equal(review.codingTaskCreated, false);
assert.equal(review.deploymentPerformed, false);

const closed = await callCoordinator({
  endpoint, token,
  body: buildRequest([
    'cancel-test', '--request-id', fixture.coordinatorRequest.id,
    '--idempotency-key', 'synthetic:cancel:0001',
    '--owner-approved-synthetic-cleanup',
    '--owner-decision-reference', 'Local dry run completed without external action.',
  ]),
  fetchImpl: fake.fetchImpl,
});
assert.equal(closed.state, 'cancelled');
assert.equal(closed.productionDataDeleted, false);
assert.equal(closed.syntheticAuditRetained, true);

assert.equal(fake.state.fetchCount, 6, 'dry run should use bounded single requests and no busy loop');
console.log('ai operations coordinator receiver tests passed');
