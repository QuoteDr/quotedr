import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Trusted local receiver for the privacy-minimized AI Operations coordinator
// inbox. This endpoint intentionally has no browser CORS, customer-table read,
// Codex/agent launch, code push, merge, deployment, credit, or customer-send
// capability. The only email action is the separately owner-authorized,
// synthetic end-to-end test notification.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const COORDINATOR_ENABLED = Deno.env.get('QUOTEDR_COORDINATOR_ENABLED') === 'true';
const SYNTHETIC_TEST_EMAIL_ENABLED = Deno.env.get('QUOTEDR_COORDINATOR_TEST_EMAIL_ENABLED') === 'true';
const COORDINATOR_TOKEN = Deno.env.get('QUOTEDR_COORDINATOR_TOKEN') ?? '';
const COORDINATOR_ACTOR_ID = Deno.env.get('QUOTEDR_COORDINATOR_ACTOR_ID') ?? '';
const COORDINATOR_ACTOR_EMAIL = normalizeEmail(Deno.env.get('QUOTEDR_COORDINATOR_ACTOR_EMAIL'));
const COORDINATOR_LABEL = cleanLabel(Deno.env.get('QUOTEDR_COORDINATOR_LABEL') || 'QuoteDr pinned Orchestrator');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const COORDINATOR_FROM_EMAIL = String(Deno.env.get('QUOTEDR_COORDINATOR_FROM_EMAIL') ?? '').trim();

const OWNER_NOTIFICATION_EMAIL = 'admin@quotedr.io';
const REVIEW_BASE_URL = 'https://quotedr.io/ai-operations.html';
const SYNTHETIC_PREFIX = '[SYNTHETIC COORDINATOR TEST]';
const TEST_SUBJECT_PREFIX = '[TEST — NO ACTION REQUIRED] QuoteDr code review notification';
const BRIDGE_NAME = 'pinned_orchestrator_manual_bridge';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LEASE_SECONDS = 15 * 60;
const MAX_ACTIONS_PER_MINUTE = 30;
const MIN_TOKEN_LENGTH = 43;
const COORDINATOR_COLUMNS = [
  'id', 'case_id', 'work_item_id', 'handoff_revision', 'state', 'task_brief',
  'task_payload', 'advisory_assessment', 'owner_confirmed', 'privacy_minimized',
  'queued_at', 'available_at', 'claimed_at', 'claimed_by', 'claimed_by_email',
  'claim_label', 'lease_expires_at', 'attempt_count', 'retry_count',
  'last_error_code', 'last_error_message', 'task_created_at', 'task_reference',
  'cancelled_at', 'cancellation_reason', 'coordinator_bridge',
  'claim_idempotency_key', 'heartbeat_idempotency_key',
  'outcome_idempotency_key', 'cancel_idempotency_key', 'last_heartbeat_at',
  'created_at', 'updated_at',
].join(',');
const REVIEWABLE_COLUMNS = new Set([
  'id', 'case_id', 'work_item_id', 'handoff_revision', 'state', 'task_brief',
  'task_payload', 'advisory_assessment', 'owner_confirmed', 'privacy_minimized',
  'queued_at', 'available_at', 'claimed_at', 'lease_expires_at', 'attempt_count',
  'retry_count', 'last_error_code', 'last_error_message', 'task_created_at',
  'task_reference', 'cancelled_at', 'coordinator_bridge', 'last_heartbeat_at',
  'created_at', 'updated_at',
]);

const REVIEW_DISPOSITIONS = new Set([
  'needs_owner_decision', 'dispatched_to_engineering', 'declined',
  'synthetic_dry_run_ready',
]);
const SENSITIVE_TOPICS = new Set(['invoices_payments', 'account_plan']);

type JsonMap = Record<string, unknown>;
type AdminClient = SupabaseClient<any, 'public', any>;

class OperationError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: JsonMap, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function cleanLabel(value: unknown) {
  return String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, 160);
}

function safeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function safeText(value: unknown, max: number, label: string) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new OperationError(`${label} is too long`);
  return result;
}

function requiredText(value: unknown, max: number, label: string) {
  const result = safeText(value, max, label);
  if (!result) throw new OperationError(`${label} is required`);
  return result;
}

function uuid(value: unknown, label: string) {
  const result = requiredText(value, 80, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new OperationError(`Invalid ${label}`);
  }
  return result;
}

function idempotencyKey(value: unknown) {
  const result = requiredText(value, 180, 'Idempotency key');
  if (result.length < 8 || !/^[A-Za-z0-9:._/-]+$/.test(result)) {
    throw new OperationError('Idempotency key must be 8-180 safe characters');
  }
  return result;
}

function rejectPrivateMaterial(value: unknown, label: string, max: number) {
  const result = requiredText(value, max, label);
  if (/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(result)
      || /https?:\/\/\S+[?&](?:token|access_token|signature|sig|key|secret|auth)=/i.test(result)
      || /\b(?:bearer\s+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})\b/i.test(result)) {
    throw new OperationError(`${label} must not contain customer email, secure links, or tokens`);
  }
  return result;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requireBaseConfiguration() {
  if (!COORDINATOR_ENABLED) {
    throw new OperationError('Coordinator receiver is disabled', 503, 'receiver_disabled');
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new OperationError('Coordinator receiver is not configured', 503, 'configuration_missing');
  }
  if (COORDINATOR_TOKEN.length < MIN_TOKEN_LENGTH) {
    throw new OperationError('Coordinator receiver authentication is not configured', 503, 'configuration_missing');
  }
}

function requireActorConfiguration() {
  requireBaseConfiguration();
  if (!isUuid(COORDINATOR_ACTOR_ID) || !COORDINATOR_ACTOR_EMAIL || !COORDINATOR_LABEL) {
    throw new OperationError('Coordinator actor is not configured', 503, 'configuration_missing');
  }
}

function adminClient() {
  requireBaseConfiguration();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function constantTimeEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let mismatch = leftHash.length ^ rightHash.length;
  for (let i = 0; i < Math.max(leftHash.length, rightHash.length); i += 1) {
    mismatch |= (leftHash[i % leftHash.length] ?? 0) ^ (rightHash[i % rightHash.length] ?? 0);
  }
  return mismatch === 0;
}

async function authenticate(req: Request) {
  requireBaseConfiguration();
  const authorization = req.headers.get('Authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (supplied.length < MIN_TOKEN_LENGTH || !(await constantTimeEqual(supplied, COORDINATOR_TOKEN))) {
    throw new OperationError('Invalid coordinator authorization', 401, 'invalid_authorization');
  }
}

async function readBody(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new OperationError('Request is too large', 413, 'request_too_large');
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as JsonMap;
  } catch {
    throw new OperationError('Invalid JSON request');
  }
}

async function enforceRateLimit() {
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const result = await adminClient().from('ai_engineering_coordinator_action_audit')
    .select('id', { count: 'exact', head: true })
    .eq('actor_type', 'trusted_local_coordinator')
    .gte('occurred_at', cutoff);
  if (result.error) throw new OperationError('Coordinator rate limit could not be verified', 503, 'rate_limit_unavailable');
  if (Number(result.count ?? 0) >= MAX_ACTIONS_PER_MINUTE) {
    throw new OperationError('Coordinator rate limit exceeded', 429, 'rate_limit_exceeded');
  }
}

function payloadAt(request: any, ...keys: string[]) {
  let current = request?.task_payload;
  for (const key of keys) current = current && typeof current === 'object' ? current[key] : undefined;
  return current;
}

function validatePrivacyBoundary(request: any) {
  if (request?.owner_confirmed !== true || request?.privacy_minimized !== true
      || payloadAt(request, 'case', 'customer_name_included') !== false
      || payloadAt(request, 'case', 'customer_email_included') !== false
      || payloadAt(request, 'privacy', 'privacy_minimized') !== true
      || payloadAt(request, 'privacy', 'secure_links_or_tokens_included') !== false
      || payloadAt(request, 'coordinator_inbox', 'owner_confirmed') !== true
      || payloadAt(request, 'safety_boundaries', 'live_codex_desktop_connection') !== false) {
    throw new OperationError('Coordinator request failed the privacy and owner-confirmation contract', 409, 'privacy_contract_failed');
  }
}

function syntheticTest(request: any) {
  return String(payloadAt(request, 'case', 'subject') ?? '').startsWith(SYNTHETIC_PREFIX);
}

function requestSnapshot(request: any) {
  validatePrivacyBoundary(request);
  const allowed: JsonMap = {};
  for (const column of REVIEWABLE_COLUMNS) allowed[column] = request?.[column];
  return allowed;
}

async function findRequest(client: AdminClient, requestId: string) {
  const result = await client.from('ai_engineering_coordinator_inbox')
    .select(COORDINATOR_COLUMNS).eq('id', requestId).maybeSingle();
  if (result.error) throw new OperationError('Could not load coordinator request', 500, 'inbox_read_failed');
  if (!result.data) throw new OperationError('Coordinator request not found', 404, 'not_found');
  validatePrivacyBoundary(result.data);
  return result.data;
}

async function findAudit(client: AdminClient, key: string, expectedAction = '') {
  const result = await client.from('ai_engineering_coordinator_action_audit')
    .select('id,inbox_id,action_type,idempotency_key,details,occurred_at')
    .eq('idempotency_key', key).maybeSingle();
  if (result.error) throw new OperationError('Could not check coordinator action audit', 500, 'audit_read_failed');
  if (result.data && expectedAction && result.data.action_type !== expectedAction) {
    throw new OperationError('Idempotency key was already used for another action', 409, 'idempotency_key_reused');
  }
  return result.data;
}

function replayResponse(audit: any) {
  const response = audit?.details?.response;
  if (!response || typeof response !== 'object') {
    throw new OperationError('The prior action exists without a replayable result', 409, 'audit_replay_unavailable');
  }
  return { ...(response as JsonMap), idempotentReplay: true };
}

async function recordAudit(client: AdminClient, input: {
  requestId?: string | null;
  actionType: string;
  key: string;
  synthetic?: boolean;
  details: JsonMap;
}) {
  const insert = await client.from('ai_engineering_coordinator_action_audit').insert({
    inbox_id: input.requestId || null,
    action_type: input.actionType,
    idempotency_key: input.key,
    actor_type: 'trusted_local_coordinator',
    actor_label: COORDINATOR_LABEL,
    synthetic_test: input.synthetic === true,
    details: input.details,
  }).select('id').single();
  if (!insert.error) return true;
  if (String(insert.error.code) === '23505') return false;
  throw new OperationError('Could not append coordinator action audit', 500, 'audit_write_failed');
}

async function pollInbox(body: JsonMap) {
  requireActorConfiguration();
  const key = idempotencyKey(body.idempotencyKey);
  const client = adminClient();
  const existing = await findAudit(client, key, 'poll');
  if (existing) return jsonResponse(replayResponse(existing));
  const rawLimit = Number(body.limit ?? 1);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 5) {
    throw new OperationError('Poll limit must be between 1 and 5');
  }
  const now = new Date().toISOString();
  const result = await client.from('ai_engineering_coordinator_inbox')
    .select(COORDINATOR_COLUMNS)
    .in('state', ['queued', 'retry_required'])
    .lte('available_at', now)
    .order('queued_at', { ascending: true })
    .limit(rawLimit);
  if (result.error) throw new OperationError('Could not poll coordinator inbox', 500, 'poll_failed');
  const requests = (result.data ?? []).map(requestSnapshot);
  const response: JsonMap = {
    success: true,
    requests,
    pollMode: 'single_run',
    busyLoopStarted: false,
    customerTablesQueried: false,
    rawSupportContentQueried: false,
    taskCreated: false,
    agentLaunched: false,
    deploymentPerformed: false,
  };
  const inserted = await recordAudit(client, {
    actionType: 'poll', key, synthetic: false,
    details: { requestCount: requests.length, response },
  });
  if (!inserted) {
    const winner = await findAudit(client, key, 'poll');
    if (!winner) throw new OperationError('Concurrent poll audit could not be replayed', 409, 'poll_replay_unavailable');
    return jsonResponse(replayResponse(winner));
  }
  return jsonResponse(response);
}

function activeLease(request: any) {
  const lease = new Date(String(request?.lease_expires_at ?? '')).getTime();
  return Number.isFinite(lease) && lease > Date.now();
}

function assertHeldClaim(request: any) {
  if (request.state !== 'claimed' || request.claimed_by !== COORDINATOR_ACTOR_ID
      || normalizeEmail(request.claimed_by_email) !== COORDINATOR_ACTOR_EMAIL
      || request.coordinator_bridge !== BRIDGE_NAME || !activeLease(request)) {
    throw new OperationError('The trusted local coordinator does not hold an active claim', 409, 'claim_not_held');
  }
}

async function claimRequest(body: JsonMap) {
  requireActorConfiguration();
  if (body.ownerReviewRepeated !== true || body.riskChecksCompleted !== true || body.privacyReviewRepeated !== true) {
    throw new OperationError('Owner, risk, and privacy checks must be repeated before claim');
  }
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const existing = await findAudit(client, key, 'claim');
  if (existing) return jsonResponse(replayResponse(existing));
  let request = await findRequest(client, requestId);
  if (request.claim_idempotency_key === key && request.state === 'claimed') {
    const response = claimResult(request);
    await recordAudit(client, { requestId, actionType: 'claim', key, synthetic: syntheticTest(request), details: { response } });
    return jsonResponse({ ...response, idempotentReplay: true });
  }
  const availableAt = new Date(String(request.available_at ?? request.queued_at)).getTime();
  const expiredClaim = request.state === 'claimed' && !activeLease(request);
  if (!['queued', 'retry_required'].includes(request.state) && !expiredClaim) {
    throw new OperationError('Request is not available to claim', 409, 'claim_unavailable');
  }
  if (request.state === 'retry_required' && (!Number.isFinite(availableAt) || availableAt > Date.now())) {
    throw new OperationError('Retry is not available yet', 409, 'retry_not_available');
  }
  const now = new Date();
  const patch = {
    state: 'claimed',
    claimed_at: now.toISOString(),
    claimed_by: COORDINATOR_ACTOR_ID,
    claimed_by_email: COORDINATOR_ACTOR_EMAIL,
    claim_label: COORDINATOR_LABEL,
    lease_expires_at: new Date(now.getTime() + MAX_LEASE_SECONDS * 1000).toISOString(),
    attempt_count: Number(request.attempt_count ?? 0) + 1,
    coordinator_bridge: BRIDGE_NAME,
    claim_idempotency_key: key,
    heartbeat_idempotency_key: '',
    last_heartbeat_at: null,
  };
  const update = await client.from('ai_engineering_coordinator_inbox').update(patch)
    .eq('id', requestId).eq('state', request.state).eq('updated_at', request.updated_at)
    .select(COORDINATOR_COLUMNS).maybeSingle();
  if (update.error) throw new OperationError('Claim failed', 500, 'claim_failed');
  if (!update.data) {
    request = await findRequest(client, requestId);
    if (request.claim_idempotency_key !== key || request.state !== 'claimed') {
      throw new OperationError('Request changed before claim; poll again', 409, 'claim_race_lost');
    }
  } else request = update.data;
  const response = claimResult(request);
  await recordAudit(client, { requestId, actionType: 'claim', key, synthetic: syntheticTest(request), details: { response } });
  return jsonResponse(response);
}

function claimResult(request: any): JsonMap {
  return {
    success: true,
    request: requestSnapshot(request),
    claimRecordsOwnershipOnly: true,
    reviewStillRequired: true,
    taskCreated: false,
    agentLaunched: false,
    deploymentPerformed: false,
  };
}

async function heartbeat(body: JsonMap) {
  requireActorConfiguration();
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const existing = await findAudit(client, key, 'heartbeat');
  if (existing) return jsonResponse(replayResponse(existing));
  let request = await findRequest(client, requestId);
  if (request.heartbeat_idempotency_key === key && request.state === 'claimed') {
    const response = heartbeatResult(request);
    await recordAudit(client, { requestId, actionType: 'heartbeat', key, synthetic: syntheticTest(request), details: { response } });
    return jsonResponse({ ...response, idempotentReplay: true });
  }
  assertHeldClaim(request);
  const now = new Date();
  const update = await client.from('ai_engineering_coordinator_inbox').update({
    heartbeat_idempotency_key: key,
    last_heartbeat_at: now.toISOString(),
    lease_expires_at: new Date(now.getTime() + MAX_LEASE_SECONDS * 1000).toISOString(),
  }).eq('id', requestId).eq('state', 'claimed').eq('updated_at', request.updated_at)
    .select(COORDINATOR_COLUMNS).maybeSingle();
  if (update.error) throw new OperationError('Heartbeat failed', 500, 'heartbeat_failed');
  if (!update.data) {
    request = await findRequest(client, requestId);
    if (request.heartbeat_idempotency_key !== key) {
      throw new OperationError('Claim changed before heartbeat; claim again', 409, 'heartbeat_race_lost');
    }
  } else request = update.data;
  const response = heartbeatResult(request);
  await recordAudit(client, { requestId, actionType: 'heartbeat', key, synthetic: syntheticTest(request), details: { response } });
  return jsonResponse(response);
}

function heartbeatResult(request: any): JsonMap {
  return {
    success: true,
    requestId: request.id,
    leaseExpiresAt: request.lease_expires_at,
    singleHeartbeatRecorded: true,
    schedulerStarted: false,
  };
}

function requestIsSensitive(request: any) {
  const risk = String(payloadAt(request, 'classification', 'risk_level') ?? 'low');
  const topic = String(payloadAt(request, 'classification', 'topic_key') ?? 'other');
  const flags = payloadAt(request, 'classification', 'escalation_flags');
  const minimizedText = [
    payloadAt(request, 'case', 'subject'),
    payloadAt(request, 'case', 'summary'),
    request?.task_brief,
  ].join(' ');
  const mandatoryReviewLanguage = /\b(?:billing|payment|refund|chargeback|data loss|privacy|access|security|breach|signature|legal|cross[- ]device|broad incident)\b/i;
  return risk !== 'low' || SENSITIVE_TOPICS.has(topic)
    || (Array.isArray(flags) && flags.length > 0)
    || mandatoryReviewLanguage.test(minimizedText);
}

async function recordReview(body: JsonMap) {
  requireActorConfiguration();
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const existing = await findAudit(client, key, 'review');
  if (existing) return jsonResponse(replayResponse(existing));
  const request = await findRequest(client, requestId);
  assertHeldClaim(request);
  const disposition = safeKey(body.disposition);
  if (!REVIEW_DISPOSITIONS.has(disposition)) throw new OperationError('Invalid review disposition');
  if (body.briefReviewed !== true || body.evidenceReviewed !== true || body.blastRadiusReviewed !== true) {
    throw new OperationError('Brief, evidence, and blast radius must be reviewed');
  }
  const isSynthetic = syntheticTest(request);
  if (disposition === 'synthetic_dry_run_ready' && !isSynthetic) {
    throw new OperationError('Synthetic dry-run disposition is only allowed for the labeled synthetic case', 409);
  }
  if (requestIsSensitive(request) && disposition !== 'needs_owner_decision') {
    throw new OperationError('Sensitive or high-impact requests require an owner decision', 409, 'owner_decision_required');
  }
  const improvementType = String(payloadAt(request, 'classification', 'improvement_type') ?? '');
  if (improvementType !== 'bug' && disposition === 'dispatched_to_engineering') {
    throw new OperationError('Feature or non-bug work requires an owner decision before engineering dispatch', 409, 'owner_decision_required');
  }
  const reviewSummary = rejectPrivateMaterial(body.reviewSummary, 'Review summary', 1000);
  const response: JsonMap = {
    success: true,
    requestId,
    disposition,
    reviewSummary,
    codingTaskCreated: false,
    agentLaunched: false,
    deploymentPerformed: false,
    ownerDecisionStillRequired: disposition === 'needs_owner_decision',
  };
  await recordAudit(client, {
    requestId, actionType: 'review', key, synthetic: isSynthetic,
    details: { disposition, reviewSummary, response },
  });
  return jsonResponse(response);
}

async function recordOutcome(body: JsonMap) {
  requireActorConfiguration();
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const outcome = safeKey(body.outcome);
  if (!['task_created', 'retry_required'].includes(outcome)) throw new OperationError('Invalid outcome');
  const client = adminClient();
  const existing = await findAudit(client, key, outcome);
  if (existing) return jsonResponse(replayResponse(existing));
  let request = await findRequest(client, requestId);
  if (request.outcome_idempotency_key === key && request.state === outcome) {
    const response = outcomeResult(request, outcome);
    await recordAudit(client, { requestId, actionType: outcome, key, synthetic: syntheticTest(request), details: { response } });
    return jsonResponse({ ...response, idempotentReplay: true });
  }
  assertHeldClaim(request);
  const now = new Date();
  let patch: JsonMap;
  if (outcome === 'task_created') {
    if (body.taskCreatedOutsideDashboard !== true || body.localOnly !== true
        || body.deploymentAuthorized !== false || body.noCustomerDataIncluded !== true
        || body.agentLaunched !== false || body.actualBridge !== 'pinned_orchestrator_manual_local_worktree') {
      throw new OperationError('Local task boundary confirmations are required');
    }
    const taskReference = rejectPrivateMaterial(body.taskReference, 'Task reference', 500);
    patch = {
      state: 'task_created',
      task_created_at: now.toISOString(),
      task_reference: taskReference,
      outcome_idempotency_key: key,
    };
  } else {
    if (body.noCustomerDataIncluded !== true) throw new OperationError('Retry details must contain no customer data');
    const errorCode = safeKey(body.errorCode);
    if (!/^[a-z0-9_.-]{1,80}$/.test(errorCode)) throw new OperationError('Invalid retry error code');
    const errorMessage = rejectPrivateMaterial(body.errorMessage, 'Retry message', 1000);
    const retryAfterMinutes = Number(body.retryAfterMinutes);
    if (!Number.isInteger(retryAfterMinutes) || retryAfterMinutes < 1 || retryAfterMinutes > 10080) {
      throw new OperationError('Retry delay must be between 1 minute and 7 days');
    }
    patch = {
      state: 'retry_required',
      last_error_code: errorCode,
      last_error_message: errorMessage,
      last_error_at: now.toISOString(),
      retry_count: Number(request.retry_count ?? 0) + 1,
      available_at: new Date(now.getTime() + retryAfterMinutes * 60000).toISOString(),
      outcome_idempotency_key: key,
    };
  }
  const update = await client.from('ai_engineering_coordinator_inbox').update(patch)
    .eq('id', requestId).eq('state', 'claimed').eq('claimed_by', COORDINATOR_ACTOR_ID)
    .eq('updated_at', request.updated_at).select(COORDINATOR_COLUMNS).maybeSingle();
  if (update.error) throw new OperationError('Recording outcome failed', 500, 'outcome_failed');
  if (!update.data) {
    request = await findRequest(client, requestId);
    if (request.outcome_idempotency_key !== key || request.state !== outcome) {
      throw new OperationError('Request changed before outcome; review again', 409, 'outcome_race_lost');
    }
  } else request = update.data;
  const response = outcomeResult(request, outcome);
  await recordAudit(client, { requestId, actionType: outcome, key, synthetic: syntheticTest(request), details: { response } });
  return jsonResponse(response);
}

function outcomeResult(request: any, outcome: string): JsonMap {
  return {
    success: true,
    request: requestSnapshot(request),
    outcome,
    outcomeRecordedOnly: true,
    taskCreatedByDashboard: false,
    actualBridge: outcome === 'task_created' ? 'pinned_orchestrator_manual_local_worktree' : '',
    agentLaunched: false,
    pushed: false,
    merged: false,
    deploymentPerformed: false,
  };
}

async function cancelSyntheticTest(body: JsonMap) {
  requireActorConfiguration();
  if (body.ownerApprovedSyntheticCleanup !== true) throw new OperationError('Owner-approved synthetic cleanup is required');
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const existing = await findAudit(client, key, 'cancel_synthetic_test');
  if (existing) return jsonResponse(replayResponse(existing));
  let request = await findRequest(client, requestId);
  if (!syntheticTest(request)) throw new OperationError('Only the labeled synthetic test can be cancelled by this route', 403);
  if (request.cancel_idempotency_key === key && request.state === 'cancelled') {
    const response = cancelResult(request);
    await recordAudit(client, { requestId, actionType: 'cancel_synthetic_test', key, synthetic: true, details: { response } });
    return jsonResponse({ ...response, idempotentReplay: true });
  }
  if (['task_created', 'cancelled'].includes(request.state)) {
    throw new OperationError('Completed or cancelled requests are immutable', 409);
  }
  const decisionReference = rejectPrivateMaterial(body.ownerDecisionReference, 'Owner decision reference', 500);
  const update = await client.from('ai_engineering_coordinator_inbox').update({
    state: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by: COORDINATOR_ACTOR_ID,
    cancellation_reason: `Synthetic test cleanup approved by owner: ${decisionReference}`,
    cancel_idempotency_key: key,
  }).eq('id', requestId).eq('state', request.state).eq('updated_at', request.updated_at)
    .select(COORDINATOR_COLUMNS).maybeSingle();
  if (update.error) throw new OperationError('Synthetic cleanup failed', 500, 'cancel_failed');
  if (!update.data) {
    request = await findRequest(client, requestId);
    if (request.cancel_idempotency_key !== key || request.state !== 'cancelled') {
      throw new OperationError('Request changed before synthetic cleanup', 409, 'cancel_race_lost');
    }
  } else request = update.data;
  const response = cancelResult(request);
  await recordAudit(client, { requestId, actionType: 'cancel_synthetic_test', key, synthetic: true, details: { response } });
  return jsonResponse(response);
}

function cancelResult(request: any): JsonMap {
  return {
    success: true,
    requestId: request.id,
    state: request.state,
    syntheticAuditRetained: true,
    productionDataDeleted: false,
    deploymentPerformed: false,
  };
}

function notificationCopy(request: any) {
  if (!syntheticTest(request)) throw new OperationError('Test notification requires the labeled synthetic case', 409);
  const caseReference = rejectPrivateMaterial(payloadAt(request, 'case', 'reference'), 'Case reference', 80);
  const title = rejectPrivateMaterial(payloadAt(request, 'case', 'subject'), 'Synthetic title', 300);
  const severity = safeKey(payloadAt(request, 'classification', 'risk_level') || 'low');
  if (!['low', 'sensitive', 'critical'].includes(severity)) throw new OperationError('Invalid synthetic severity');
  const reviewUrl = `${REVIEW_BASE_URL}?coordinatorRequest=${request.id}`;
  const subject = `${TEST_SUBJECT_PREFIX} — ${caseReference}`;
  const bodyText = [
    'This is a synthetic test. No customer, code, or deployment action is required.',
    '',
    `Case: ${caseReference}`,
    `Title: ${title}`,
    `Severity: ${severity}`,
    `Review: ${reviewUrl}`,
    '',
    'No customer content is included. This test does not authorize deployment.',
  ].join('\n');
  return { caseReference, title, severity, reviewUrl, subject, bodyText };
}

async function findSyntheticReview(client: AdminClient, requestId: string) {
  const result = await client.from('ai_engineering_coordinator_action_audit')
    .select('id,details,occurred_at').eq('inbox_id', requestId).eq('action_type', 'review')
    .eq('synthetic_test', true).order('occurred_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new OperationError('Could not verify synthetic review gate', 500, 'review_gate_read_failed');
  if (!result.data || result.data.details?.disposition !== 'synthetic_dry_run_ready') {
    throw new OperationError('Synthetic dry-run review must pass before the test email', 409, 'dry_run_gate_incomplete');
  }
}

async function sendSyntheticTestNotification(body: JsonMap) {
  requireActorConfiguration();
  if (!SYNTHETIC_TEST_EMAIL_ENABLED) {
    throw new OperationError('Synthetic test notification is disabled', 503, 'test_notification_disabled');
  }
  if (body.ownerAuthorizedSingleTestEmail !== true || body.syntheticDashboardFlowPassed !== true
      || body.dryRunGatesPassed !== true) {
    throw new OperationError('Owner authorization and both synthetic gates are required before the one test email');
  }
  if (!RESEND_API_KEY || !COORDINATOR_FROM_EMAIL || !/@quotedr\.io$/i.test(COORDINATOR_FROM_EMAIL)) {
    throw new OperationError('Synthetic notification sender is not configured', 503, 'notification_configuration_missing');
  }
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const priorAction = await findAudit(client, key, 'notification_prepared');
  const request = await findRequest(client, requestId);
  assertHeldClaim(request);
  if (!syntheticTest(request)) throw new OperationError('Only the labeled synthetic case can send the test notification', 403);
  await findSyntheticReview(client, requestId);
  const copy = notificationCopy(request);
  let notificationResult = await client.from('ai_engineering_coordinator_notifications')
    .select('*').eq('inbox_id', requestId).eq('notification_kind', 'synthetic_test').maybeSingle();
  if (notificationResult.error) throw new OperationError('Could not check test notification', 500, 'notification_read_failed');
  let notification = notificationResult.data;
  if (notification && notification.idempotency_key !== key) {
    throw new OperationError('A single test notification is already reserved for this request', 409, 'test_notification_already_reserved');
  }
  if (notification?.status === 'accepted' || notification?.status === 'confirmed') {
    return jsonResponse(notificationResultBody(notification, true));
  }
  if (notification?.status === 'failed') {
    throw new OperationError('The single test attempt failed closed; owner review is required before any new test', 409, 'test_notification_failed_closed');
  }
  if (!notification) {
    const insert = await client.from('ai_engineering_coordinator_notifications').insert({
      inbox_id: requestId,
      notification_kind: 'synthetic_test',
      recipient: OWNER_NOTIFICATION_EMAIL,
      subject: copy.subject,
      body_text: copy.bodyText,
      case_reference: copy.caseReference,
      title: copy.title,
      severity: copy.severity,
      review_url: copy.reviewUrl,
      status: 'prepared',
      idempotency_key: key,
      actor_label: COORDINATOR_LABEL,
    }).select('*').single();
    if (insert.error) {
      if (String(insert.error.code) !== '23505') throw new OperationError('Could not prepare test notification', 500, 'notification_prepare_failed');
      notificationResult = await client.from('ai_engineering_coordinator_notifications')
        .select('*').eq('inbox_id', requestId).eq('notification_kind', 'synthetic_test').single();
      if (notificationResult.error) throw new OperationError('Could not reload test notification', 500);
      notification = notificationResult.data;
    } else notification = insert.data;
  }
  if (!priorAction) {
    await recordAudit(client, {
      requestId,
      actionType: 'notification_prepared',
      key,
      synthetic: true,
      details: {
        response: {
          success: true,
          notificationId: notification.id,
          status: 'prepared',
          syntheticTest: true,
          noActionRequired: true,
          deploymentPerformed: false,
        },
      },
    });
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `quotedr-aiops-test-${requestId}`,
      },
      body: JSON.stringify({
        from: COORDINATOR_FROM_EMAIL,
        to: [OWNER_NOTIFICATION_EMAIL],
        subject: copy.subject,
        text: copy.bodyText,
      }),
    });
  } catch {
    await markNotificationFailed(client, notification.id, 'provider_unreachable', 'The email provider could not be reached.');
    throw new OperationError('Test notification failed closed', 502, 'provider_unreachable');
  }
  const providerText = await providerResponse.text();
  let providerData: JsonMap = {};
  try { providerData = providerText ? JSON.parse(providerText) : {}; } catch { providerData = {}; }
  if (!providerResponse.ok) {
    await markNotificationFailed(client, notification.id, `provider_${providerResponse.status}`, 'The email provider rejected the test request.');
    throw new OperationError('Test notification failed closed', 502, 'provider_rejected');
  }
  const providerId = safeText(providerData.id, 500, 'Provider message id');
  if (!providerId) {
    await markNotificationFailed(client, notification.id, 'provider_missing_id', 'The provider response had no message id.');
    throw new OperationError('Test notification failed closed', 502, 'provider_missing_id');
  }
  const acceptedAt = new Date().toISOString();
  const update = await client.from('ai_engineering_coordinator_notifications').update({
    status: 'accepted', provider_message_id: providerId,
    attempted_at: acceptedAt, provider_accepted_at: acceptedAt,
  }).eq('id', notification.id).eq('status', 'prepared').select('*').single();
  if (update.error) throw new OperationError('Provider accepted the email but its audit record could not be finalized', 500, 'notification_audit_incomplete');
  return jsonResponse(notificationResultBody(update.data, false));
}

async function markNotificationFailed(client: AdminClient, notificationId: string, code: string, message: string) {
  const result = await client.from('ai_engineering_coordinator_notifications').update({
    status: 'failed', attempted_at: new Date().toISOString(),
    failure_code: code, failure_message: message,
  }).eq('id', notificationId).eq('status', 'prepared');
  if (result.error) throw new OperationError('The test notification failed and its audit could not be finalized', 500, 'notification_audit_incomplete');
}

function notificationResultBody(notification: any, replay: boolean): JsonMap {
  return {
    success: true,
    notificationId: notification.id,
    recipient: OWNER_NOTIFICATION_EMAIL,
    subject: notification.subject,
    status: notification.status,
    providerAccepted: ['accepted', 'confirmed'].includes(notification.status),
    deliveryConfirmed: notification.status === 'confirmed',
    syntheticTest: true,
    noActionRequired: true,
    customerContentIncluded: false,
    deploymentPerformed: false,
    idempotentReplay: replay,
  };
}

async function confirmSyntheticTestNotification(body: JsonMap) {
  requireActorConfiguration();
  if (body.ownerConfirmedInboxReceipt !== true) throw new OperationError('Owner inbox confirmation is required');
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const confirmationReference = rejectPrivateMaterial(body.confirmationReference, 'Confirmation reference', 500);
  const client = adminClient();
  const existingAudit = await findAudit(client, key, 'notification_confirmed');
  if (existingAudit) return jsonResponse(replayResponse(existingAudit));
  const request = await findRequest(client, requestId);
  if (!syntheticTest(request)) throw new OperationError('Only the synthetic test notification can be confirmed here', 403);
  const current = await client.from('ai_engineering_coordinator_notifications')
    .select('*').eq('inbox_id', requestId).eq('notification_kind', 'synthetic_test').single();
  if (current.error) throw new OperationError('Test notification not found', 404);
  if (current.data.status === 'confirmed') {
    const response = notificationResultBody(current.data, true);
    await recordAudit(client, { requestId, actionType: 'notification_confirmed', key, synthetic: true, details: { response } });
    return jsonResponse(response);
  }
  if (current.data.status !== 'accepted') throw new OperationError('Only a provider-accepted test notification can be confirmed', 409);
  const update = await client.from('ai_engineering_coordinator_notifications').update({
    status: 'confirmed', confirmed_at: new Date().toISOString(),
    confirmation_reference: confirmationReference,
  }).eq('id', current.data.id).eq('status', 'accepted').select('*').single();
  if (update.error) throw new OperationError('Could not record owner inbox confirmation', 500);
  const response = notificationResultBody(update.data, false);
  await recordAudit(client, { requestId, actionType: 'notification_confirmed', key, synthetic: true, details: { response } });
  return jsonResponse(response);
}

async function recordOwnerDecision(body: JsonMap) {
  requireActorConfiguration();
  const key = idempotencyKey(body.idempotencyKey);
  const requestId = uuid(body.requestId, 'coordinator request id');
  const client = adminClient();
  const existingAudit = await findAudit(client, key, 'owner_decision');
  if (existingAudit) return jsonResponse(replayResponse(existingAudit));
  const request = await findRequest(client, requestId);
  if (!syntheticTest(request) || request.state !== 'task_created') {
    throw new OperationError('Owner review is only recorded after the synthetic local result is ready', 409);
  }
  if (body.deploymentAuthorized !== false || body.actualBridge !== 'pinned_orchestrator_manual_local_worktree') {
    throw new OperationError('The synthetic owner decision must explicitly keep deployment unauthorized');
  }
  const notification = await client.from('ai_engineering_coordinator_notifications')
    .select('status').eq('inbox_id', requestId).eq('notification_kind', 'synthetic_test').single();
  if (notification.error || notification.data?.status !== 'confirmed') {
    throw new OperationError('Owner inbox receipt must be confirmed before recording the final test decision', 409);
  }
  const rawDecision = safeKey(body.decision);
  const decision = rawDecision === 'approve' ? 'approved_local_only' : rawDecision === 'reject' ? 'rejected' : '';
  if (!decision) throw new OperationError('Decision must be approve or reject');
  const localTaskReference = rejectPrivateMaterial(body.localTaskReference, 'Local task reference', 500);
  const localCommitSha = safeKey(body.localCommitSha);
  if (!/^[0-9a-f]{7,40}$/.test(localCommitSha)) throw new OperationError('Invalid local commit SHA');
  const verificationSummary = rejectPrivateMaterial(body.verificationSummary, 'Verification summary', 2000);
  const ownerDecisionReference = rejectPrivateMaterial(body.ownerDecisionReference, 'Owner decision reference', 500);
  const existing = await client.from('ai_engineering_coordinator_owner_decisions')
    .select('*').eq('inbox_id', requestId).maybeSingle();
  if (existing.error) throw new OperationError('Could not check owner decision', 500);
  if (existing.data) {
    if (existing.data.decision !== decision || existing.data.local_commit_sha !== localCommitSha) {
      throw new OperationError('An immutable owner decision is already recorded', 409);
    }
    const response = ownerDecisionResult(existing.data, true);
    await recordAudit(client, { requestId, actionType: 'owner_decision', key, synthetic: true, details: { response } });
    return jsonResponse(response);
  }
  const insert = await client.from('ai_engineering_coordinator_owner_decisions').insert({
    inbox_id: requestId,
    decision,
    deployment_authorized: false,
    local_task_reference: localTaskReference,
    local_commit_sha: localCommitSha,
    verification_summary: verificationSummary,
    owner_decision_reference: ownerDecisionReference,
    actor_label: COORDINATOR_LABEL,
  }).select('*').single();
  if (insert.error) {
    if (String(insert.error.code) === '23505') {
      const replay = await client.from('ai_engineering_coordinator_owner_decisions')
        .select('*').eq('inbox_id', requestId).single();
      if (!replay.error && replay.data?.decision === decision && replay.data?.local_commit_sha === localCommitSha) {
        const response = ownerDecisionResult(replay.data, true);
        await recordAudit(client, { requestId, actionType: 'owner_decision', key, synthetic: true, details: { response } });
        return jsonResponse(response);
      }
    }
    throw new OperationError('Could not record owner decision', 500);
  }
  const response = ownerDecisionResult(insert.data, false);
  await recordAudit(client, { requestId, actionType: 'owner_decision', key, synthetic: true, details: { response } });
  return jsonResponse(response);
}

function ownerDecisionResult(decision: any, replay: boolean): JsonMap {
  return {
    success: true,
    decision: decision.decision,
    localTaskReference: decision.local_task_reference,
    localCommitSha: decision.local_commit_sha,
    verificationSummary: decision.verification_summary,
    deploymentAuthorized: false,
    deploymentPerformed: false,
    syntheticAuditRetained: true,
    idempotentReplay: replay,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  let action = '';
  let authenticated = false;
  try {
    await authenticate(req);
    authenticated = true;
    const body = await readBody(req);
    action = safeKey(body.action);
    await enforceRateLimit();
    if (action === 'poll') return await pollInbox(body);
    if (action === 'claim') return await claimRequest(body);
    if (action === 'heartbeat') return await heartbeat(body);
    if (action === 'record_review') return await recordReview(body);
    if (action === 'record_outcome') return await recordOutcome(body);
    if (action === 'cancel_synthetic_test') return await cancelSyntheticTest(body);
    if (action === 'send_synthetic_test_notification') return await sendSyntheticTestNotification(body);
    if (action === 'confirm_synthetic_test_notification') return await confirmSyntheticTestNotification(body);
    if (action === 'record_owner_decision') return await recordOwnerDecision(body);
    throw new OperationError('Unsupported coordinator action');
  } catch (error) {
    const operationError = error instanceof OperationError
      ? error
      : new OperationError('Coordinator request failed', 500, 'internal_error');
    if (authenticated) {
      try {
        await recordAudit(adminClient(), {
          actionType: 'request_rejected',
          key: `rejected:${crypto.randomUUID()}`,
          synthetic: false,
          details: {
            action: action || 'unparsed',
            code: operationError.code,
            status: operationError.status,
            response: { success: false, code: operationError.code, status: operationError.status },
          },
        });
      } catch {
        // If the database is unavailable or the migration is not active, the
        // receiver still fails closed and retains only the sanitized log below.
      }
    }
    console.error('AI Operations coordinator request failed', {
      action: action || 'unparsed',
      code: operationError.code,
      status: operationError.status,
    });
    return jsonResponse({ error: operationError.message, code: operationError.code }, operationError.status);
  }
});
