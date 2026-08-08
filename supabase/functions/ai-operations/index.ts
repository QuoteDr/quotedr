import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// This endpoint records and gates human decisions. It intentionally has no
// email, deployment, billing, Stripe, or account-credit integration.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BASE_COORDINATOR_EMAILS = [
  'admin@quotedr.io',
  'info@alddirect.ca',
  'ald.direct.contracting@gmail.com',
];
const BASE_OWNER_EMAILS = [
  'admin@quotedr.io',
  'info@alddirect.ca',
];
const COORDINATOR_EMAILS = new Set([
  ...BASE_COORDINATOR_EMAILS,
  ...(Deno.env.get('QUOTEDR_OPERATIONS_COORDINATOR_EMAILS') ?? '').split(','),
].map(normalizeEmail).filter(Boolean));
const OWNER_EMAILS = new Set([
  ...BASE_OWNER_EMAILS,
  ...(Deno.env.get('QUOTEDR_OWNER_EMAILS') ?? '').split(','),
].map(normalizeEmail).filter(Boolean));

const TOPIC_KEYS = new Set([
  'ai_voice_to_quote', 'choice_groups', 'invoices_payments', 'quotes_approvals',
  'quote_builder', 'saved_items_pricing', 'client_portal', 'clients_contacts',
  'dashboard_sync', 'templates', 'ai_quote_copilot', 'smart_import',
  'floor_plan_scanner', 'quickbooks', 'job_tracking_expenses', 'change_orders',
  'photos_media', 'notifications_followups', 'account_plan', 'assistant_help',
  'support_feedback', 'other',
]);
const IMPROVEMENT_TYPES = new Set(['documentation', 'ux', 'bug', 'feature']);
const SOURCES = new Set(['email', 'in_app', 'chatbot', 'phone', 'other']);
const SENSITIVE_FLAGS = new Set([
  'billing', 'payments', 'data_loss', 'privacy', 'access',
  'legal_signature', 'cross_device', 'broad_incident',
]);
const CREDIT_TYPES = new Set(['free_pro_month', 'account_credit', 'other']);
const MAX_BODY_BYTES = 64 * 1024;

type JsonMap = Record<string, unknown>;
type UserIdentity = { id: string; email: string };
type AdminClient = SupabaseClient<any, 'public', any>;

class OperationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: JsonMap, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function safeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function safeText(value: unknown, max: number, label = 'Value') {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new OperationError(`${label} is too long`);
  return result;
}

function requiredText(value: unknown, max: number, label: string) {
  const result = safeText(value, max, label);
  if (!result) throw new OperationError(`${label} is required`);
  return result;
}

function enumValue(value: unknown, allowed: Set<string>, label: string, fallback = '') {
  const result = safeKey(value || fallback);
  if (!allowed.has(result)) throw new OperationError(`Invalid ${label}`);
  return result;
}

function uuid(value: unknown, label: string) {
  const result = safeText(value, 80, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new OperationError(`Invalid ${label}`);
  }
  return result;
}

function requireConfiguration() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new OperationError('AI Operations is not configured', 503);
  }
}

function adminClient() {
  requireConfiguration();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUser(req: Request): Promise<UserIdentity> {
  requireConfiguration();
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) throw new OperationError('Missing authorization', 401);
  const token = authHeader.slice(7).trim();
  const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) throw new OperationError('Invalid authorization', 401);
  return { id: data.user.id, email: normalizeEmail(data.user.email) };
}

async function verifyCoordinator(req: Request) {
  const user = await authenticatedUser(req);
  if (!COORDINATOR_EMAILS.has(user.email)) throw new OperationError('AI Operations administrator access required', 403);
  return user;
}

async function verifyOwner(req: Request) {
  const user = await verifyCoordinator(req);
  if (!OWNER_EMAILS.has(user.email)) throw new OperationError('Owner approval required', 403);
  return user;
}

async function readBody(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new OperationError('Request is too large', 413);
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as JsonMap;
  } catch {
    throw new OperationError('Invalid JSON request');
  }
}

function containsLiveFixClaim(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return [
    /\b(?:the|this|that|your)\s+(?:fix|issue|bug|problem)\s+(?:is|has been)\s+(?:now\s+)?(?:live|fixed|resolved|deployed|released)\b/,
    /\b(?:we(?:'ve| have)|i(?:'ve| have))\s+(?:now\s+)?(?:fixed|resolved|deployed|released)\b/,
    /\b(?:we|i)\s+(?:fixed|resolved|deployed|released)\b/,
    /\b(?:the|this|that|your)\s+(?:fix|update|patch)\s+(?:is|has been)\s+(?:available|released|deployed|live)\b/,
    /\b(?:it|everything)\s+(?:is|has been)\s+(?:now\s+)?(?:fixed|resolved|live)\b/,
    /\bfix\s+is\s+live\b/,
    /\bnow\s+(?:fixed|resolved|live|deployed)\b/,
  ].some((pattern) => pattern.test(text));
}

function containsReleaseDatePromise(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/\b(?:no|don't|do not|cannot|can't)\s+(?:have|give|promise)\b.{0,35}\b(?:eta|release date)\b/.test(text)) return false;
  return [
    /\b(?:will|should|going to)\s+(?:be\s+)?(?:fixed|released|live|deployed)\s+(?:by|on|within)\b/,
    /\b(?:eta|release date)\s*(?:is|:)\s*\S+/,
    /\b(?:coming|shipping|launching)\s+(?:today|tomorrow|this week|next week|on\s+\w+)\b/,
  ].some((pattern) => pattern.test(text));
}

function buildImmediateResponse(customerName: string, safeWorkaround: string) {
  const name = customerName ? customerName.split(/\s+/)[0] : 'there';
  if (safeWorkaround) {
    return `Hi ${name}, I’m sorry you ran into this. For now, the safest workaround is: ${safeWorkaround} I’ve also routed this for a smoother product solution. I don’t have a release date to promise, and I’ll follow up only after verification and release are complete.`;
  }
  return `Hi ${name}, I’m sorry you hit this. Please pause any retries or edits to the affected record and keep the current data in place while I review it. I’m routing this for owner review now. I don’t have a release date to promise, and I’ll follow up with the safest verified next step.`;
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value as JsonMap).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
    camelize(item),
  ]));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function elapsedMinutes(startValue: unknown, endValue: unknown) {
  const start = new Date(String(startValue || ''));
  const end = new Date(String(endValue || ''));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  return (end.getTime() - start.getTime()) / 60000;
}

function buildMetrics(cases: any[], workItems: any[], approvals: any[], followups: any[]) {
  const workById = new Map(workItems.map((item) => [item.id, item]));
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const responseTimes = cases.map((item) => elapsedMinutes(item.created_at, item.first_response_at))
    .filter((value): value is number => value !== null);
  const deployTimes = approvals.map((approval) => {
    if (!approval.deployed_at) return null;
    const workItem = workById.get(approval.work_item_id);
    const supportCase = workItem && caseById.get(workItem.case_id);
    if (!supportCase?.is_likely_bug) return null;
    const minutes = elapsedMinutes(supportCase.created_at, approval.deployed_at);
    return minutes === null ? null : minutes / 60;
  }).filter((value): value is number => value !== null);

  const topicCounts = new Map<string, number>();
  const improvementCounts = new Map<string, number>();
  cases.forEach((item) => {
    topicCounts.set(item.topic_key, (topicCounts.get(item.topic_key) || 0) + 1);
    improvementCounts.set(item.improvement_type, (improvementCounts.get(item.improvement_type) || 0) + 1);
  });
  const commonTopics = Array.from(topicCounts.entries())
    .map(([topicKey, count]) => ({ topicKey, count }))
    .sort((a, b) => b.count - a.count || a.topicKey.localeCompare(b.topicKey));

  return {
    openCases: cases.filter((item) => item.workflow_stage !== 'closed').length,
    sensitiveOpenCases: cases.filter((item) => item.workflow_stage !== 'closed' && item.risk_level !== 'low').length,
    averageFirstResponseMinutes: average(responseTimes),
    averageBugToDeployHours: average(deployTimes),
    commonTopics,
    improvementCounts: Object.fromEntries(improvementCounts.entries()),
    queueCounts: {
      incoming: cases.filter((item) => !item.first_response_at && item.workflow_stage !== 'closed').length,
      engineering: workItems.filter((item) => ['queued', 'in_progress', 'verification_pending', 'blocked'].includes(item.status)).length,
      deployApproval: approvals.filter((item) => item.status === 'pending' || (item.status === 'approved' && !item.deployed_at)).length,
      followup: followups.filter((item) => ['waiting_on_release', 'draft', 'owner_review', 'approved'].includes(item.status)).length,
    },
  };
}

function requireQuery<T>(result: { data: T | null; error: { message?: string } | null }, label: string): T {
  if (result.error || result.data === null) {
    console.error(label, result.error);
    throw new OperationError(`${label} failed`, 500);
  }
  return result.data;
}

async function recordEvent(
  client: AdminClient,
  actor: UserIdentity,
  caseId: string,
  eventType: string,
  details: JsonMap = {},
  workItemId: string | null = null,
) {
  const { error } = await client.from('ai_operations_events').insert({
    case_id: caseId,
    work_item_id: workItemId,
    event_type: eventType,
    actor_id: actor.id,
    actor_email: actor.email,
    details,
  });
  if (error) console.error('AI Operations audit event failed', { eventType, error });
}

async function findCase(client: AdminClient, caseId: string) {
  const result = await client.from('ai_support_cases').select('*').eq('id', caseId).maybeSingle();
  if (result.error) throw new OperationError('Could not load support case', 500);
  if (!result.data) throw new OperationError('Support case not found', 404);
  return result.data;
}

async function findWorkItem(client: AdminClient, workItemId: string) {
  const result = await client.from('ai_engineering_work_items').select('*').eq('id', workItemId).maybeSingle();
  if (result.error) throw new OperationError('Could not load engineering work item', 500);
  if (!result.data) throw new OperationError('Engineering work item not found', 404);
  return result.data;
}

async function loadOverview(req: Request) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const [caseResult, workResult, approvalResult, followupResult, creditResult, eventResult] = await Promise.all([
    client.from('ai_support_cases').select('*').order('created_at', { ascending: false }).limit(500),
    client.from('ai_engineering_work_items').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_deploy_approvals').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_customer_followups').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_goodwill_recommendations').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_operations_events').select('*').order('occurred_at', { ascending: false }).limit(1000),
  ]);
  const cases = requireQuery(caseResult, 'Loading support cases') as any[];
  const workItems = requireQuery(workResult, 'Loading engineering work items') as any[];
  const approvals = requireQuery(approvalResult, 'Loading deployment approvals') as any[];
  const followups = requireQuery(followupResult, 'Loading customer follow-ups') as any[];
  const credits = requireQuery(creditResult, 'Loading goodwill recommendations') as any[];
  const events = requireQuery(eventResult, 'Loading operations history') as any[];

  return jsonResponse(camelize({
    success: true,
    generated_at: new Date().toISOString(),
    role: { email: actor.email, owner: OWNER_EMAILS.has(actor.email) },
    policy: {
      no_autosend: true,
      deployment_execution_available: false,
      credit_grant_available: false,
      owner_approval_required_for: ['deployment', 'fix_live_statement', 'goodwill_credit'],
    },
    metrics: buildMetrics(cases, workItems, approvals, followups),
    cases,
    work_items: workItems,
    deploy_approvals: approvals,
    followups,
    goodwill_recommendations: credits,
    events,
  }) as JsonMap);
}

async function createCase(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const customerName = safeText(body.customerName, 160, 'Customer name');
  const customerEmail = normalizeEmail(safeText(body.customerEmail, 320, 'Customer email'));
  const subject = requiredText(body.subject, 240, 'Subject');
  const summary = requiredText(body.summary, 5000, 'Summary');
  const source = enumValue(body.source, SOURCES, 'source', 'email');
  const topicKey = enumValue(body.topicKey, TOPIC_KEYS, 'topic', 'support_feedback');
  const improvementType = enumValue(body.improvementType, IMPROVEMENT_TYPES, 'improvement type');
  const sensitiveFlags = Array.isArray(body.sensitiveFlags)
    ? Array.from(new Set(body.sensitiveFlags.map(safeKey).filter((item) => SENSITIVE_FLAGS.has(item))))
    : [];
  const requestedRisk = safeKey(body.riskLevel || 'low');
  const riskLevel = sensitiveFlags.includes('data_loss') || sensitiveFlags.includes('broad_incident')
    ? 'critical'
    : sensitiveFlags.length || requestedRisk === 'sensitive'
      ? 'sensitive'
      : 'low';
  const isLikelyBug = improvementType === 'bug' || body.isLikelyBug === true;
  const possibleSolution = safeText(body.possibleSolution, 5000, 'Possible solution');
  const safeWorkaround = safeText(body.safeWorkaround, 5000, 'Safe workaround');
  const ownerReviewRequired = sensitiveFlags.length > 0 || !safeWorkaround;
  const immediateResponseDraft = buildImmediateResponse(customerName, safeWorkaround);
  const result = await client.from('ai_support_cases').insert({
    source,
    customer_name: customerName,
    customer_email: customerEmail,
    subject,
    summary,
    topic_key: topicKey,
    improvement_type: improvementType,
    risk_level: riskLevel,
    sensitive_flags: sensitiveFlags,
    is_likely_bug: isLikelyBug,
    possible_solution: possibleSolution,
    safe_workaround: safeWorkaround,
    immediate_response_draft: immediateResponseDraft,
    immediate_response_status: 'ready_for_human_review',
    human_review_required: true,
    owner_review_required: ownerReviewRequired,
    created_by: actor.id,
    updated_by: actor.id,
  }).select('*').single();
  const supportCase = requireQuery(result, 'Creating support case') as any;
  await recordEvent(client, actor, supportCase.id, 'support_case_created', {
    topic_key: topicKey,
    improvement_type: improvementType,
    risk_level: riskLevel,
    has_safe_workaround: !!safeWorkaround,
  });
  return jsonResponse(camelize({
    success: true,
    case: supportCase,
    engineering_work_item_automatically_created: isLikelyBug && !!possibleSolution,
    immediate_response_sent: false,
  }) as JsonMap, 201);
}

async function recordImmediateResponse(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const caseId = uuid(body.caseId, 'case id');
  const responseText = requiredText(body.responseText, 10000, 'Immediate response');
  if (containsLiveFixClaim(responseText)) {
    throw new OperationError('An immediate response cannot claim that a fix is live', 409);
  }
  if (containsReleaseDatePromise(responseText)) {
    throw new OperationError('An unverified release date cannot be promised', 409);
  }
  const supportCase = await findCase(client, caseId);
  if (supportCase.owner_review_required && !OWNER_EMAILS.has(actor.email)) {
    throw new OperationError('Owner review is required before this sensitive response is recorded', 403);
  }
  const workResult = await client.from('ai_engineering_work_items').select('id').eq('case_id', caseId).maybeSingle();
  if (workResult.error) throw new OperationError('Could not check engineering work', 500);
  const now = new Date().toISOString();
  const update = await client.from('ai_support_cases').update({
    immediate_response_draft: responseText,
    immediate_response_status: 'sent',
    first_response_at: supportCase.first_response_at || now,
    workflow_stage: workResult.data ? 'engineering' : 'follow_up',
    updated_by: actor.id,
  }).eq('id', caseId).select('*').single();
  const updated = requireQuery(update, 'Recording first response') as any;
  await recordEvent(client, actor, caseId, 'immediate_response_recorded', {
    human_reviewed: true,
    owner_reviewed: OWNER_EMAILS.has(actor.email),
    delivery_performed_by_dashboard: false,
  }, workResult.data?.id || null);
  return jsonResponse(camelize({ success: true, case: updated, message_sent_by_dashboard: false }) as JsonMap);
}

async function startEngineering(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const workItemId = uuid(body.workItemId, 'work item id');
  const workItem = await findWorkItem(client, workItemId);
  if (!['queued', 'blocked'].includes(workItem.status)) {
    throw new OperationError('This work item cannot be started from its current state', 409);
  }
  const now = new Date().toISOString();
  const update = await client.from('ai_engineering_work_items').update({
    status: 'in_progress',
    started_at: workItem.started_at || now,
    updated_by: actor.id,
  }).eq('id', workItemId).select('*').single();
  const updated = requireQuery(update, 'Starting engineering work') as any;
  await client.from('ai_support_cases').update({ workflow_stage: 'engineering', updated_by: actor.id }).eq('id', workItem.case_id);
  await recordEvent(client, actor, workItem.case_id, 'engineering_started', {}, workItemId);
  return jsonResponse(camelize({ success: true, work_item: updated }) as JsonMap);
}

async function submitVerification(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const workItemId = uuid(body.workItemId, 'work item id');
  const implementationReference = requiredText(body.implementationReference, 500, 'Implementation reference');
  const coordinatorNotes = requiredText(body.coordinatorNotes, 10000, 'Coordinator notes');
  const workItem = await findWorkItem(client, workItemId);
  if (!['in_progress', 'blocked'].includes(workItem.status)) {
    throw new OperationError('Only active engineering work can enter verification', 409);
  }
  const update = await client.from('ai_engineering_work_items').update({
    status: 'verification_pending',
    implementation_reference: implementationReference,
    coordinator_notes: coordinatorNotes,
    submitted_for_verification_at: new Date().toISOString(),
    updated_by: actor.id,
  }).eq('id', workItemId).select('*').single();
  const updated = requireQuery(update, 'Submitting verification') as any;
  await client.from('ai_support_cases').update({ workflow_stage: 'verification', updated_by: actor.id }).eq('id', workItem.case_id);
  await recordEvent(client, actor, workItem.case_id, 'verification_requested', {
    implementation_reference: implementationReference,
  }, workItemId);
  return jsonResponse(camelize({ success: true, work_item: updated }) as JsonMap);
}

async function verifyWorkItem(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const workItemId = uuid(body.workItemId, 'work item id');
  const verificationSummary = requiredText(body.verificationSummary, 10000, 'Verification summary');
  const evidence = Array.isArray(body.verificationEvidence)
    ? body.verificationEvidence.slice(0, 20).map((item) => requiredText(item, 500, 'Verification evidence'))
    : [];
  if (!evidence.length) throw new OperationError('At least one verification evidence item is required');
  const workItem = await findWorkItem(client, workItemId);
  if (!['verification_pending', 'verified'].includes(workItem.status)) {
    throw new OperationError('The work item must be awaiting verification', 409);
  }
  const now = new Date().toISOString();
  const update = await client.from('ai_engineering_work_items').update({
    status: 'verified',
    verification_summary: verificationSummary,
    verification_evidence: evidence,
    verified_at: now,
    verified_by: actor.id,
    updated_by: actor.id,
  }).eq('id', workItemId).select('*').single();
  const updated = requireQuery(update, 'Verifying engineering work') as any;

  const existingApproval = await client.from('ai_deploy_approvals').select('*').eq('work_item_id', workItemId).maybeSingle();
  if (existingApproval.error) throw new OperationError('Could not prepare deployment approval', 500);
  if (existingApproval.data && workItem.status !== 'verified') {
    const approvalReset = await client.from('ai_deploy_approvals').update({
      status: 'pending',
      requested_at: now,
      requested_by: actor.id,
      decision_at: null,
      decision_by: null,
      decision_note: '',
      deployed_at: null,
      deployed_by: null,
      release_reference: '',
      deployment_evidence: '',
    }).eq('id', existingApproval.data.id);
    if (approvalReset.error) throw new OperationError('Could not reset deployment approval', 500);
  } else if (!existingApproval.data) {
    const approvalInsert = await client.from('ai_deploy_approvals').insert({
      work_item_id: workItemId,
      status: 'pending',
      requested_at: now,
      requested_by: actor.id,
    });
    if (approvalInsert.error) throw new OperationError('Could not create deployment approval', 500);
  }
  if (!existingApproval.data?.deployed_at) {
    await client.from('ai_customer_followups').update({
      status: 'waiting_on_release',
      claims_fix_live: false,
      owner_approved_at: null,
      owner_approved_by: null,
      owner_decision_note: '',
    }).eq('work_item_id', workItemId);
    await client.from('ai_support_cases').update({ workflow_stage: 'deploy_approval', updated_by: actor.id }).eq('id', workItem.case_id);
  }
  await recordEvent(client, actor, workItem.case_id, 'fix_verified', { evidence_count: evidence.length }, workItemId);
  return jsonResponse(camelize({
    success: true,
    work_item: updated,
    deployment_approval_created: !existingApproval.data,
    deployment_performed: false,
  }) as JsonMap);
}

async function decideDeployment(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  const client = adminClient();
  const approvalId = uuid(body.approvalId, 'approval id');
  const decision = enumValue(body.decision, new Set(['approve', 'decline']), 'deployment decision');
  const decisionNote = requiredText(body.decisionNote, 5000, 'Decision note');
  const approvalResult = await client.from('ai_deploy_approvals').select('*').eq('id', approvalId).maybeSingle();
  if (approvalResult.error) throw new OperationError('Could not load deployment approval', 500);
  if (!approvalResult.data) throw new OperationError('Deployment approval not found', 404);
  const approval = approvalResult.data;
  const workItem = await findWorkItem(client, approval.work_item_id);
  if (workItem.status !== 'verified') throw new OperationError('Only verified work can be approved for deployment', 409);
  const status = decision === 'approve' ? 'approved' : 'declined';
  const update = await client.from('ai_deploy_approvals').update({
    status,
    decision_at: new Date().toISOString(),
    decision_by: actor.id,
    decision_note: decisionNote,
  }).eq('id', approvalId).select('*').single();
  const updated = requireQuery(update, 'Recording deployment decision') as any;
  if (status === 'declined') {
    await client.from('ai_engineering_work_items').update({ status: 'blocked', updated_by: actor.id }).eq('id', workItem.id);
    await client.from('ai_support_cases').update({ workflow_stage: 'engineering', updated_by: actor.id }).eq('id', workItem.case_id);
  }
  await recordEvent(client, actor, workItem.case_id, `deployment_${status}`, { owner_decision_recorded: true }, workItem.id);
  return jsonResponse(camelize({ success: true, deploy_approval: updated, deployment_performed: false }) as JsonMap);
}

async function recordDeployment(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  const client = adminClient();
  const approvalId = uuid(body.approvalId, 'approval id');
  const releaseReference = requiredText(body.releaseReference, 500, 'Release reference');
  const deploymentEvidence = requiredText(body.deploymentEvidence, 5000, 'Deployment evidence');
  const approvalResult = await client.from('ai_deploy_approvals').select('*').eq('id', approvalId).maybeSingle();
  if (approvalResult.error) throw new OperationError('Could not load deployment approval', 500);
  if (!approvalResult.data) throw new OperationError('Deployment approval not found', 404);
  const approval = approvalResult.data;
  if (approval.status !== 'approved') throw new OperationError('Owner approval is required before recording a deployment', 409);
  const workItem = await findWorkItem(client, approval.work_item_id);
  if (workItem.status !== 'verified') throw new OperationError('The release must remain verified before deployment', 409);
  const supportCase = await findCase(client, workItem.case_id);
  const now = new Date().toISOString();
  let updated = approval;
  if (!approval.deployed_at) {
    const update = await client.from('ai_deploy_approvals').update({
      deployed_at: now,
      deployed_by: actor.id,
      release_reference: releaseReference,
      deployment_evidence: deploymentEvidence,
    }).eq('id', approvalId).select('*').single();
    updated = requireQuery(update, 'Recording deployment evidence') as any;
  } else if (approval.release_reference !== releaseReference) {
    throw new OperationError('This approval is already tied to a different release reference', 409);
  }
  const name = supportCase.customer_name ? String(supportCase.customer_name).split(/\s+/)[0] : 'there';
  const followupDraft = `Hi ${name}, the update for “${supportCase.subject}” has been verified and released. Thank you for helping us catch it. If anything still looks off, reply here and I’ll take another look.`;
  const followupUpdate = await client.from('ai_customer_followups').update({
    status: 'owner_review',
    draft_body: followupDraft,
    claims_fix_live: true,
    prepared_at: now,
    prepared_by: actor.id,
    owner_approved_at: null,
    owner_approved_by: null,
    owner_decision_note: '',
  }).eq('work_item_id', workItem.id);
  if (followupUpdate.error) throw new OperationError('Could not prepare customer follow-up', 500);
  await client.from('ai_support_cases').update({ workflow_stage: 'follow_up', updated_by: actor.id }).eq('id', workItem.case_id);
  await recordEvent(client, actor, workItem.case_id, 'deployment_recorded', {
    release_reference: releaseReference,
    customer_followup_sent: false,
  }, workItem.id);
  return jsonResponse(camelize({
    success: true,
    deploy_approval: updated,
    deployment_performed_by_dashboard: false,
    customer_followup_sent: false,
  }) as JsonMap);
}

async function prepareFollowup(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const caseId = uuid(body.caseId, 'case id');
  const draftBody = requiredText(body.draftBody, 10000, 'Follow-up draft');
  if (containsReleaseDatePromise(draftBody)) throw new OperationError('An unverified release date cannot be promised', 409);
  const followupResult = await client.from('ai_customer_followups').select('*').eq('case_id', caseId).maybeSingle();
  if (followupResult.error) throw new OperationError('Could not load customer follow-up', 500);
  if (!followupResult.data) throw new OperationError('Customer follow-up not found', 404);
  const followup = followupResult.data;
  const claimsFixLive = body.claimsFixLive === true || containsLiveFixClaim(draftBody);
  if (claimsFixLive) {
    const workItem = await findWorkItem(client, followup.work_item_id);
    const approvalResult = await client.from('ai_deploy_approvals').select('*').eq('work_item_id', workItem.id).maybeSingle();
    if (approvalResult.error) throw new OperationError('Could not verify release state', 500);
    if (workItem.status !== 'verified' || approvalResult.data?.status !== 'approved' || !approvalResult.data?.deployed_at) {
      throw new OperationError('A live-fix statement cannot be prepared until verification and deployment are recorded', 409);
    }
  }
  const update = await client.from('ai_customer_followups').update({
    status: 'owner_review',
    draft_body: draftBody,
    claims_fix_live: claimsFixLive,
    prepared_at: new Date().toISOString(),
    prepared_by: actor.id,
    owner_approved_at: null,
    owner_approved_by: null,
    owner_decision_note: '',
  }).eq('id', followup.id).select('*').single();
  const updated = requireQuery(update, 'Preparing customer follow-up') as any;
  await recordEvent(client, actor, caseId, 'customer_followup_prepared', {
    claims_fix_live: claimsFixLive,
    owner_approval_required: true,
  }, followup.work_item_id);
  return jsonResponse(camelize({ success: true, followup: updated, message_sent: false }) as JsonMap);
}

async function decideFollowup(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  const client = adminClient();
  const followupId = uuid(body.followupId, 'follow-up id');
  const decision = enumValue(body.decision, new Set(['approve', 'return']), 'follow-up decision');
  const decisionNote = requiredText(body.decisionNote, 5000, 'Decision note');
  const followupResult = await client.from('ai_customer_followups').select('*').eq('id', followupId).maybeSingle();
  if (followupResult.error) throw new OperationError('Could not load customer follow-up', 500);
  if (!followupResult.data) throw new OperationError('Customer follow-up not found', 404);
  const followup = followupResult.data;
  if (followup.status !== 'owner_review') throw new OperationError('This follow-up is not awaiting owner review', 409);
  const updatePayload = decision === 'approve'
    ? {
        status: 'approved',
        owner_approved_at: new Date().toISOString(),
        owner_approved_by: actor.id,
        owner_decision_note: decisionNote,
      }
    : {
        status: 'draft',
        owner_approved_at: null,
        owner_approved_by: null,
        owner_decision_note: decisionNote,
      };
  const update = await client.from('ai_customer_followups').update(updatePayload)
    .eq('id', followupId).select('*').single();
  const updated = requireQuery(update, 'Recording follow-up decision') as any;
  await recordEvent(client, actor, followup.case_id, decision === 'approve' ? 'customer_followup_approved' : 'customer_followup_returned', {
    customer_message_sent: false,
  }, followup.work_item_id);
  return jsonResponse(camelize({ success: true, followup: updated, message_sent: false }) as JsonMap);
}

async function markFollowupSent(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const followupId = uuid(body.followupId, 'follow-up id');
  const followupResult = await client.from('ai_customer_followups').select('*').eq('id', followupId).maybeSingle();
  if (followupResult.error) throw new OperationError('Could not load customer follow-up', 500);
  if (!followupResult.data) throw new OperationError('Customer follow-up not found', 404);
  const followup = followupResult.data;
  if (followup.status !== 'approved') throw new OperationError('Owner approval is required before recording a sent follow-up', 409);
  const now = new Date().toISOString();
  const update = await client.from('ai_customer_followups').update({
    status: 'sent',
    sent_at: now,
    sent_by: actor.id,
  }).eq('id', followupId).select('*').single();
  const updated = requireQuery(update, 'Recording customer follow-up') as any;
  await client.from('ai_support_cases').update({
    workflow_stage: 'closed',
    closed_at: now,
    updated_by: actor.id,
  }).eq('id', followup.case_id);
  await recordEvent(client, actor, followup.case_id, 'customer_followup_recorded_sent', {
    delivery_performed_by_dashboard: false,
  }, followup.work_item_id);
  return jsonResponse(camelize({ success: true, followup: updated, message_sent_by_dashboard: false }) as JsonMap);
}

async function recommendGoodwill(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const caseId = uuid(body.caseId, 'case id');
  await findCase(client, caseId);
  const creditType = enumValue(body.creditType, CREDIT_TYPES, 'credit type', 'free_pro_month');
  const reason = requiredText(body.recommendationReason, 5000, 'Recommendation reason');
  const existing = await client.from('ai_goodwill_recommendations').select('*').eq('case_id', caseId).maybeSingle();
  if (existing.error) throw new OperationError('Could not load goodwill recommendation', 500);
  let result;
  if (existing.data) {
    if (existing.data.status !== 'recommended') throw new OperationError('The owner already decided this recommendation', 409);
    result = await client.from('ai_goodwill_recommendations').update({
      credit_type: creditType,
      recommendation_reason: reason,
      recommended_at: new Date().toISOString(),
      recommended_by: actor.id,
    }).eq('id', existing.data.id).select('*').single();
  } else {
    result = await client.from('ai_goodwill_recommendations').insert({
      case_id: caseId,
      credit_type: creditType,
      recommendation_reason: reason,
      status: 'recommended',
      recommended_by: actor.id,
    }).select('*').single();
  }
  const recommendation = requireQuery(result, 'Saving goodwill recommendation') as any;
  await recordEvent(client, actor, caseId, 'goodwill_credit_recommended', {
    credit_type: creditType,
    credit_granted: false,
  });
  return jsonResponse(camelize({ success: true, goodwill_recommendation: recommendation, credit_granted: false }) as JsonMap);
}

async function decideGoodwill(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  const client = adminClient();
  const recommendationId = uuid(body.recommendationId, 'recommendation id');
  const decision = enumValue(body.decision, new Set(['approve', 'decline']), 'goodwill decision');
  const decisionNote = requiredText(body.decisionNote, 5000, 'Decision note');
  const existing = await client.from('ai_goodwill_recommendations').select('*').eq('id', recommendationId).maybeSingle();
  if (existing.error) throw new OperationError('Could not load goodwill recommendation', 500);
  if (!existing.data) throw new OperationError('Goodwill recommendation not found', 404);
  if (existing.data.status !== 'recommended') throw new OperationError('This goodwill recommendation is already decided', 409);
  const update = await client.from('ai_goodwill_recommendations').update({
    status: decision === 'approve' ? 'approved' : 'declined',
    decided_at: new Date().toISOString(),
    decided_by: actor.id,
    decision_note: decisionNote,
  }).eq('id', recommendationId).select('*').single();
  const recommendation = requireQuery(update, 'Recording goodwill decision') as any;
  await recordEvent(client, actor, existing.data.case_id, `goodwill_credit_${recommendation.status}`, {
    credit_granted: false,
  });
  return jsonResponse(camelize({ success: true, goodwill_recommendation: recommendation, credit_granted: false }) as JsonMap);
}

async function closeCase(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const caseId = uuid(body.caseId, 'case id');
  const supportCase = await findCase(client, caseId);
  if (!supportCase.first_response_at) throw new OperationError('Record a human-reviewed first response before closing the case', 409);
  const workResult = await client.from('ai_engineering_work_items').select('id').eq('case_id', caseId).maybeSingle();
  if (workResult.error) throw new OperationError('Could not check engineering work', 500);
  if (workResult.data) {
    const followupResult = await client.from('ai_customer_followups').select('status').eq('case_id', caseId).maybeSingle();
    if (followupResult.error) throw new OperationError('Could not check customer follow-up', 500);
    if (followupResult.data?.status !== 'sent') {
      throw new OperationError('A product-fix case cannot close before its approved customer follow-up is recorded', 409);
    }
  }
  const now = new Date().toISOString();
  const update = await client.from('ai_support_cases').update({
    workflow_stage: 'closed',
    closed_at: now,
    updated_by: actor.id,
  }).eq('id', caseId).select('*').single();
  const updated = requireQuery(update, 'Closing support case') as any;
  await recordEvent(client, actor, caseId, 'support_case_closed');
  return jsonResponse(camelize({ success: true, case: updated }) as JsonMap);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await readBody(req);
    const action = safeKey(body.action || 'overview');
    if (action === 'overview') return await loadOverview(req);
    if (action === 'create_case') return await createCase(req, body);
    if (action === 'record_immediate_response') return await recordImmediateResponse(req, body);
    if (action === 'start_engineering') return await startEngineering(req, body);
    if (action === 'submit_verification') return await submitVerification(req, body);
    if (action === 'verify_work_item') return await verifyWorkItem(req, body);
    if (action === 'decide_deployment') return await decideDeployment(req, body);
    if (action === 'record_deployment') return await recordDeployment(req, body);
    if (action === 'prepare_followup') return await prepareFollowup(req, body);
    if (action === 'decide_followup') return await decideFollowup(req, body);
    if (action === 'mark_followup_sent') return await markFollowupSent(req, body);
    if (action === 'recommend_goodwill') return await recommendGoodwill(req, body);
    if (action === 'decide_goodwill') return await decideGoodwill(req, body);
    if (action === 'close_case') return await closeCase(req, body);
    throw new OperationError('Unsupported AI Operations action', 400);
  } catch (error) {
    console.error('AI Operations request failed', error);
    if (error instanceof OperationError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: 'AI Operations request failed' }, 500);
  }
});
