import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// This endpoint records and gates human decisions. It intentionally has no
// email, Codex/coordinator transport, agent-launch, deployment, merge, billing,
// Stripe, or account-credit integration.

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
const TOPIC_LABELS: Record<string, string> = {
  ai_voice_to_quote: 'AI Voice to Quote',
  choice_groups: 'Choice Groups',
  invoices_payments: 'Invoices & Payments',
  quotes_approvals: 'Quotes, Sending & Approvals',
  quote_builder: 'Quote Builder',
  saved_items_pricing: 'Saved Items & Pricing',
  client_portal: 'Client Portal',
  clients_contacts: 'Clients & Contacts',
  dashboard_sync: 'Dashboard & Sync',
  templates: 'Templates',
  ai_quote_copilot: 'AI Quote Copilot',
  smart_import: 'Smart Import',
  floor_plan_scanner: 'Floor Plan Scanner',
  quickbooks: 'QuickBooks',
  job_tracking_expenses: 'Job Tracking & Expenses',
  change_orders: 'Change Orders',
  photos_media: 'Photos & Files',
  notifications_followups: 'Notifications & Follow-ups',
  account_plan: 'Account & Plan',
  assistant_help: 'AI Assistant & Help',
  support_feedback: 'Feedback & Missing Features',
  other: 'Other',
};
const IMPROVEMENT_LABELS: Record<string, string> = {
  documentation: 'Documentation improvement',
  ux: 'UX improvement',
  bug: 'Bug fix',
  feature: 'Feature',
};
const SENSITIVE_FLAG_LABELS: Record<string, string> = {
  billing: 'Billing',
  payments: 'Payments',
  data_loss: 'Data loss',
  privacy: 'Privacy',
  access: 'Access',
  legal_signature: 'Legal / signature',
  cross_device: 'Cross-device conflict',
  broad_incident: 'Broad incident',
};
const SENSITIVE_TOPIC_KEYS = new Set(['invoices_payments', 'account_plan']);
const NEXT_STEP_LABELS: Record<string, string> = {
  answer_safe_workaround: 'Answer with the current safe workaround',
  request_safe_evidence: 'Request specific safe evidence and preserve customer data',
  prepare_engineering_brief: 'Prepare an owner-reviewed engineering brief',
  wait_for_trusted_coordinator: 'Wait for the trusted local coordinator to review the queued request',
  review_coordinator_retry: 'Review the coordinator retry reason before another claim',
  request_engineering_evidence: 'Request implementation evidence for verification',
  wait_for_verification: 'Wait for independent verification evidence',
  wait_for_owner_deploy_approval: 'Wait for owner deployment approval',
  wait_for_external_release: 'Wait for a verified external release record',
  prepare_customer_followup: 'Prepare a release-backed customer follow-up',
  wait_for_owner_followup_approval: 'Wait for owner approval of customer-facing wording',
  record_manual_followup: 'Record the owner-approved follow-up after it is sent manually',
  recommend_goodwill_review: 'Recommend goodwill for owner review',
  close_documentation_ux: 'Close as a documentation or UX improvement after the safe response',
  close_feature_improvement: 'Record the feature opportunity and close the support loop',
  close_support_loop: 'Close the verified support loop',
};
const COORDINATOR_INBOX_STATES = new Set(['queued', 'claimed', 'task_created', 'retry_required', 'cancelled']);
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

function humanizeKey(value: unknown) {
  return String(value ?? '').trim().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function supportCaseReference(supportCase: any) {
  const caseNumber = Number(supportCase?.case_number);
  return Number.isFinite(caseNumber) && caseNumber > 0
    ? `QD-AI-${String(caseNumber).padStart(4, '0')}`
    : 'QD-AI';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function privacyMinimizeText(value: unknown, supportCase: any) {
  let result = String(value ?? '').trim();
  const customerName = String(supportCase?.customer_name || '').trim();
  const customerEmail = String(supportCase?.customer_email || '').trim();
  if (customerEmail) result = result.replace(new RegExp(escapeRegExp(customerEmail), 'gi'), '[redacted customer email]');
  result = result.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]');
  result = result.replace(/\bhttps?:\/\/[^\s)\]}]+/gi, (url) => (
    /[?&](?:token|access_token|signature|sig|key|secret|auth)=/i.test(url) ? '[redacted secure link]' : url
  ));
  result = result.replace(/\b(?:bearer\s+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})\b/gi, '[redacted token]');
  if (customerName) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(customerName)}\\b`, 'gi'), '[customer]');
    const firstName = customerName.split(/\s+/)[0];
    if (firstName.length >= 3) result = result.replace(new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'gi'), '[customer]');
  }
  return result;
}

function confidenceBand(points: number) {
  if (points >= 6) return 'high';
  if (points >= 4) return 'medium';
  return 'low';
}

type AdvisoryContext = {
  cases?: any[];
  workItems?: any[];
  approvals?: any[];
  followups?: any[];
  goodwill?: any[];
  inbox?: any[];
  workItem?: any;
  approval?: any;
  followup?: any;
  goodwillItem?: any;
  coordinatorRequest?: any;
};

function latestMatch(items: any[] | undefined, predicate: (item: any) => boolean, revisionKey = '') {
  const matches = (items || []).filter(predicate);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    if (revisionKey) {
      const revisionDifference = Number(b?.[revisionKey] || 0) - Number(a?.[revisionKey] || 0);
      if (revisionDifference) return revisionDifference;
    }
    return new Date(b?.updated_at || b?.queued_at || b?.created_at || 0).getTime() -
      new Date(a?.updated_at || a?.queued_at || a?.created_at || 0).getTime();
  })[0];
}

function buildAdvisoryAssessment(supportCase: any, context: AdvisoryContext = {}) {
  const cases = context.cases || [];
  const workItem = context.workItem || latestMatch(context.workItems, (item) => item.case_id === supportCase.id);
  const approval = context.approval || (workItem && latestMatch(context.approvals, (item) => item.work_item_id === workItem.id));
  const followup = context.followup || latestMatch(context.followups, (item) => item.case_id === supportCase.id);
  const goodwillItem = context.goodwillItem || latestMatch(context.goodwill, (item) => item.case_id === supportCase.id);
  const coordinatorRequest = context.coordinatorRequest || (workItem && latestMatch(context.inbox, (item) => item.work_item_id === workItem.id, 'handoff_revision'));
  const topicKey = String(supportCase.topic_key || 'other');
  const improvementType = String(supportCase.improvement_type || 'feature');
  const flags: string[] = Array.isArray(supportCase.sensitive_flags) ? supportCase.sensitive_flags : [];
  const riskLevel = String(supportCase.risk_level || 'low');
  const likelyBug = supportCase.is_likely_bug === true;
  const possibleSolution = String(supportCase.possible_solution || '').trim();
  const safeWorkaround = String(supportCase.safe_workaround || '').trim();
  const sameTopic = cases.filter((item) => item.id !== supportCase.id && item.topic_key === topicKey);
  const sameClassification = sameTopic.filter((item) => item.improvement_type === improvementType);
  const sensitiveTopic = SENSITIVE_TOPIC_KEYS.has(topicKey);
  const humanReviewFirst = flags.length > 0 || riskLevel !== 'low' || sensitiveTopic;
  const evidence: string[] = [];
  const patterns: string[] = [];
  const missingInformation: string[] = [];
  const policyGates: string[] = [];
  let points = 0;

  if (String(supportCase.subject || '').trim() && String(supportCase.summary || '').trim()) {
    points += 1;
    evidence.push('A subject and customer-impact summary are recorded.');
  } else missingInformation.push('A complete issue subject and impact summary.');
  if (TOPIC_LABELS[topicKey]) {
    points += 1;
    evidence.push(`The report maps to the controlled topic “${TOPIC_LABELS[topicKey]}.”`);
  } else missingInformation.push('A controlled support topic.');
  if (IMPROVEMENT_LABELS[improvementType]) {
    points += 1;
    evidence.push(`The recorded improvement type is “${IMPROVEMENT_LABELS[improvementType]}.”`);
  }
  if ((improvementType === 'bug' && likelyBug) || (improvementType !== 'bug' && !likelyBug)) {
    points += 1;
    evidence.push('The likely-bug flag is consistent with the recorded improvement type.');
  } else missingInformation.push('Resolve the mismatch between the likely-bug flag and improvement type.');
  if (possibleSolution) {
    points += 1;
    evidence.push('A possible solution is recorded for engineering review.');
  } else if (likelyBug) missingInformation.push('A safe reproduction theory or possible solution.');
  if (workItem) {
    points += 1;
    evidence.push(`An engineering work item exists with status “${humanizeKey(workItem.status)}.”`);
  } else if (likelyBug) missingInformation.push('An engineering work item linked to this likely bug.');
  if (sameTopic.length) {
    points += 1;
    patterns.push(`${sameTopic.length} other recorded case${sameTopic.length === 1 ? ' shares' : 's share'} the “${TOPIC_LABELS[topicKey] || humanizeKey(topicKey)}” topic.`);
  }
  if (sameClassification.length) patterns.push(`${sameClassification.length} of those also share the same improvement type.`);
  if (!patterns.length) patterns.push('No close recorded pattern match is available yet; treat this as a single-case signal.');
  if (safeWorkaround) evidence.push('A current safe workaround is recorded.');
  else missingInformation.push('A verified safe workaround; preserve affected data until one is known.');

  const riskFlags = flags.map((flag) => SENSITIVE_FLAG_LABELS[flag] || humanizeKey(flag));
  if (sensitiveTopic && !riskFlags.length) riskFlags.push(`${TOPIC_LABELS[topicKey] || humanizeKey(topicKey)} is a human-review-first topic`);
  if (humanReviewFirst) policyGates.push('Human review comes first regardless of confidence because this case is sensitive or potentially high impact.');
  policyGates.push('Confidence is advisory evidence, never permission to send, deploy, merge, launch an agent, or grant credit.');
  policyGates.push('Owner approval remains required for deployment, fix-live wording, customer follow-up, and any goodwill decision.');

  let recommendationKey = 'close_support_loop';
  let recommendationConfidence = 'medium';
  const recommendationWhy: string[] = [];
  const workStatus = String(workItem?.status || '');
  const approvalStatus = String(approval?.status || '');
  const followupStatus = String(followup?.status || '');
  const requestState = String(coordinatorRequest?.state || '');

  if (!supportCase.first_response_at) {
    if (safeWorkaround) {
      recommendationKey = 'answer_safe_workaround';
      recommendationConfidence = 'high';
      recommendationWhy.push('A safe workaround is recorded and no first response has been recorded yet.');
    } else {
      recommendationKey = 'request_safe_evidence';
      recommendationConfidence = humanReviewFirst ? 'high' : 'medium';
      recommendationWhy.push('No safe workaround is known, so data preservation and a narrow evidence request are safer than troubleshooting guesses.');
    }
  } else if (workItem) {
    if (['queued', 'claimed'].includes(requestState)) {
      recommendationKey = 'wait_for_trusted_coordinator';
      recommendationConfidence = 'high';
      recommendationWhy.push('An owner-confirmed, privacy-minimized request is already in the internal coordinator inbox.');
    } else if (requestState === 'retry_required') {
      recommendationKey = 'review_coordinator_retry';
      recommendationConfidence = 'high';
      recommendationWhy.push('The internal queue recorded a retry-required state; review its sanitized error before another claim.');
    } else if (['queued', 'blocked'].includes(workStatus)) {
      recommendationKey = 'prepare_engineering_brief';
      recommendationConfidence = possibleSolution ? 'high' : 'medium';
      recommendationWhy.push('Engineering-worthy work exists but no active internal coordinator request is recorded.');
    } else if (workStatus === 'in_progress') {
      recommendationKey = 'request_engineering_evidence';
      recommendationWhy.push('Implementation is in progress; the next safe gate is reviewable implementation and test evidence.');
    } else if (workStatus === 'verification_pending') {
      recommendationKey = 'wait_for_verification';
      recommendationConfidence = 'high';
      recommendationWhy.push('The work item is explicitly waiting for independent verification.');
      if (!String(workItem.verification_summary || '').trim()) missingInformation.push('Independent verification summary and evidence.');
    } else if (workStatus === 'verified' && (!approval || approvalStatus === 'pending')) {
      recommendationKey = 'wait_for_owner_deploy_approval';
      recommendationConfidence = 'high';
      recommendationWhy.push('Verification is recorded, but the owner-controlled deployment gate is still pending.');
    } else if (workStatus === 'verified' && approvalStatus === 'approved' && !approval?.deployed_at) {
      recommendationKey = 'wait_for_external_release';
      recommendationConfidence = 'high';
      recommendationWhy.push('Owner approval is recorded, but no externally verified deployment is recorded.');
    } else if (approval?.deployed_at && ['waiting_on_release', 'draft'].includes(followupStatus)) {
      recommendationKey = 'prepare_customer_followup';
      recommendationConfidence = 'high';
      recommendationWhy.push('A verified release record exists, so a release-backed draft can be prepared for owner review.');
    } else if (followupStatus === 'owner_review') {
      recommendationKey = 'wait_for_owner_followup_approval';
      recommendationConfidence = 'high';
      recommendationWhy.push('Customer-facing wording is prepared but still requires owner approval.');
    } else if (followupStatus === 'approved') {
      recommendationKey = 'record_manual_followup';
      recommendationConfidence = 'high';
      recommendationWhy.push('Owner wording approval is recorded; the dashboard can only record a send completed elsewhere.');
    } else if (followupStatus === 'sent' && humanReviewFirst && !goodwillItem) {
      recommendationKey = 'recommend_goodwill_review';
      recommendationWhy.push('The customer-impacting loop is complete and the sensitive impact may warrant an owner-only goodwill review.');
    } else if (workStatus === 'cancelled') {
      recommendationKey = 'request_safe_evidence';
      recommendationConfidence = 'low';
      recommendationWhy.push('Engineering was cancelled, so the report needs new safe evidence before another product recommendation.');
    } else recommendationWhy.push('Recorded workflow gates appear complete; confirm the customer has a safe resolution before closing.');
  } else if (likelyBug) {
    recommendationKey = possibleSolution ? 'prepare_engineering_brief' : 'request_safe_evidence';
    recommendationConfidence = possibleSolution ? 'medium' : 'low';
    recommendationWhy.push(possibleSolution ? 'A possible solution exists, but the expected engineering item is missing.' : 'The likely bug does not yet have enough implementation-safe evidence for engineering.');
  } else if (['documentation', 'ux'].includes(improvementType)) {
    recommendationKey = 'close_documentation_ux';
    recommendationConfidence = 'high';
    recommendationWhy.push('The case is classified as a non-code documentation or UX improvement and a first response is already recorded.');
  } else if (improvementType === 'feature') {
    recommendationKey = 'close_feature_improvement';
    recommendationWhy.push('The request can be retained as a product opportunity without implying a delivery commitment.');
  }

  const approvalsRequired: string[] = [];
  if (recommendationKey === 'prepare_engineering_brief') approvalsRequired.push('Owner confirmation before the privacy-minimized brief enters the coordinator inbox.');
  if (workItem) {
    if (!approval || approvalStatus === 'pending') approvalsRequired.push('Owner approval before any deployment.');
    if (!approval?.deployed_at) approvalsRequired.push('Verified external deployment evidence before any “fix is live” statement.');
    if (followupStatus !== 'sent') approvalsRequired.push('Owner approval of exact customer follow-up wording before a manual send.');
  }
  approvalsRequired.push('Owner decision before any goodwill recommendation is acted on; the dashboard cannot grant credit.');
  if (humanReviewFirst) approvalsRequired.unshift('Human review first for the recorded sensitive category, regardless of confidence.');
  const classificationConfidence = confidenceBand(points);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    confidence_not_authorization: true,
    human_review_first: humanReviewFirst,
    classification: {
      confidence: classificationConfidence,
      label: `${humanizeKey(classificationConfidence)} evidence confidence`,
      summary: `Recorded evidence ${classificationConfidence === 'high' ? 'strongly' : classificationConfidence === 'medium' ? 'partly' : 'weakly'} supports “${IMPROVEMENT_LABELS[improvementType] || humanizeKey(improvementType)}” in “${TOPIC_LABELS[topicKey] || humanizeKey(topicKey)}.” This is not a probability or permission to act.`,
    },
    recommendation: {
      key: recommendationKey,
      label: NEXT_STEP_LABELS[recommendationKey] || humanizeKey(recommendationKey),
      confidence: recommendationConfidence,
      why: recommendationWhy,
      owner_approvals_still_required: approvalsRequired,
    },
    evidence,
    patterns,
    risk_flags: riskFlags.length ? riskFlags : ['No sensitive flag is recorded.'],
    policy_gates: policyGates,
    missing_information: missingInformation.length ? missingInformation : ['No material information gap is recorded for the recommended next gate.'],
    goodwill: { recommendation_only: true, review_suggested: humanReviewFirst && !goodwillItem, credit_action_available: false },
  };
}

function briefList(items: unknown, fallback: string) {
  const values = Array.isArray(items) && items.length ? items : [fallback];
  return values.map((item) => `- ${String(item)}`);
}

function buildCoordinatorBriefRecord(
  supportCase: any,
  workItem: any,
  productImpactInput: string,
  evidenceNotesInput: string,
  requestedEngineeringOutcomeInput: string,
  advisoryAssessment: JsonMap,
) {
  const sensitiveFlags: string[] = Array.isArray(supportCase.sensitive_flags) ? supportCase.sensitive_flags : [];
  const flagLabels = sensitiveFlags.map((flag) => SENSITIVE_FLAG_LABELS[flag] || humanizeKey(flag));
  const rawValues = {
    subject: String(supportCase.subject || 'Untitled support case').trim(),
    summary: String(supportCase.summary || 'No case summary recorded.').trim(),
    workaround: String(supportCase.safe_workaround || '').trim() || 'No safe workaround is recorded. Preserve the affected data and route decisions for owner review.',
    responseDraft: String(supportCase.immediate_response_draft || '').trim() || 'No customer response is recorded.',
    productImpact: productImpactInput || String(supportCase.summary || '').trim(),
    proposedSolution: String(workItem.proposed_solution || supportCase.possible_solution || '').trim() || 'No proposed solution recorded.',
    evidence: evidenceNotesInput || 'No additional evidence, links, or notes provided.',
    requestedOutcome: requestedEngineeringOutcomeInput,
  };
  const values = {
    subject: privacyMinimizeText(rawValues.subject, supportCase),
    summary: privacyMinimizeText(rawValues.summary, supportCase),
    workaround: privacyMinimizeText(rawValues.workaround, supportCase),
    responseDraft: privacyMinimizeText(rawValues.responseDraft, supportCase),
    productImpact: privacyMinimizeText(rawValues.productImpact, supportCase),
    proposedSolution: privacyMinimizeText(rawValues.proposedSolution, supportCase),
    evidence: privacyMinimizeText(rawValues.evidence, supportCase),
    requestedOutcome: privacyMinimizeText(rawValues.requestedOutcome, supportCase),
  };
  const redactionApplied = Object.keys(rawValues).some((key) => (
    rawValues[key as keyof typeof rawValues] !== values[key as keyof typeof values]
  ));
  const classification = advisoryAssessment.classification as JsonMap;
  const recommendation = advisoryAssessment.recommendation as JsonMap;
  const payload: JsonMap = {
    schema_version: 2,
    handoff_mode: 'owner_confirmed_internal_coordinator_inbox',
    case: {
      reference: supportCaseReference(supportCase),
      subject: values.subject,
      summary: values.summary,
      customer_name_included: false,
      customer_email_included: false,
    },
    classification: {
      topic_key: supportCase.topic_key,
      topic_label: TOPIC_LABELS[supportCase.topic_key] || humanizeKey(supportCase.topic_key),
      improvement_type: supportCase.improvement_type,
      improvement_label: IMPROVEMENT_LABELS[supportCase.improvement_type] || humanizeKey(supportCase.improvement_type),
      risk_level: supportCase.risk_level,
      escalation_flags: sensitiveFlags,
      escalation_flag_labels: flagLabels,
    },
    advisory_assessment: advisoryAssessment,
    current_customer_response: {
      status: supportCase.immediate_response_status,
      safe_workaround: values.workaround,
      response_text: values.responseDraft,
      sent_by_dashboard: false,
    },
    product_impact: values.productImpact,
    proposed_solution: values.proposedSolution,
    evidence_links_or_notes: values.evidence,
    requested_engineering_outcome: values.requestedOutcome,
    privacy: {
      privacy_minimized: true,
      customer_name_included: false,
      customer_email_included: false,
      secure_links_or_tokens_included: false,
      redaction_applied: redactionApplied,
    },
    coordinator_inbox: {
      owner_confirmed: true,
      state_on_submission: 'queued',
      external_delivery_performed: false,
      trusted_local_coordinator_connected: false,
    },
    safety_boundaries: {
      live_codex_desktop_connection: false,
      agent_launch_available: false,
      deployment_available: false,
      merge_available: false,
      customer_messaging_available: false,
      credit_grant_available: false,
      owner_approval_still_required_for: ['deployment', 'fix_live_statement', 'customer_followup', 'goodwill_credit'],
    },
  };

  const brief = [
    '# QuoteDr engineering coordinator brief',
    '',
    'Handoff mode: Owner-confirmed internal coordinator inbox. No live coordinator integration or agent launch is performed.',
    'Future boundary: A separate trusted local coordinator process may later poll this queue, repeat approval and risk checks, and create a Codex task outside QuoteDr.',
    `Case: ${supportCaseReference(supportCase)} - ${values.subject}`,
    '',
    '## Case summary',
    values.summary,
    '',
    '## Classification',
    `- Topic: ${TOPIC_LABELS[supportCase.topic_key] || humanizeKey(supportCase.topic_key)}`,
    `- Improvement type: ${IMPROVEMENT_LABELS[supportCase.improvement_type] || humanizeKey(supportCase.improvement_type)}`,
    `- Risk level: ${humanizeKey(supportCase.risk_level || 'low')}`,
    `- Escalation flags: ${flagLabels.length ? flagLabels.join(', ') : 'None recorded'}`,
    '',
    '## Advisory confidence and rationale',
    `- Classification confidence: ${humanizeKey(classification.confidence)} (evidence band, not a probability or authorization)`,
    `- Recommended next step: ${String(recommendation.label || 'Human review required')}`,
    `- Next-step confidence: ${humanizeKey(recommendation.confidence)} (advisory only)`,
    `- Human-review-first: ${advisoryAssessment.human_review_first === true ? 'Yes - confidence never bypasses the sensitive-case review gate.' : 'No sensitive gate is recorded, but human review is still required before action.'}`,
    '',
    '### Issue evidence',
    ...briefList(advisoryAssessment.evidence, 'No issue evidence recorded.'),
    '',
    '### Similar cases and patterns',
    ...briefList(advisoryAssessment.patterns, 'No similar-case pattern recorded.'),
    '',
    '### Recommendation rationale',
    ...briefList(recommendation.why, 'No recommendation rationale recorded.'),
    '',
    '### Risk flags and policy gates',
    ...briefList([...(advisoryAssessment.risk_flags as unknown[] || []), ...(advisoryAssessment.policy_gates as unknown[] || [])], 'No risk or policy gate recorded.'),
    '',
    '### Missing information',
    ...briefList(advisoryAssessment.missing_information, 'No material information gap recorded.'),
    '',
    '### Owner approvals still required',
    ...briefList(recommendation.owner_approvals_still_required, 'Human review is still required.'),
    '',
    '## Current customer-safe response',
    `- Response status: ${humanizeKey(supportCase.immediate_response_status || 'not recorded')}`,
    `- Safe workaround: ${values.workaround}`,
    `- Current reviewed/draft response: ${values.responseDraft}`,
    '',
    '## Product impact',
    values.productImpact,
    '',
    '## Proposed solution',
    values.proposedSolution,
    '',
    '## Evidence, links, or notes',
    values.evidence,
    '',
    '## Requested engineering outcome',
    values.requestedOutcome,
    '',
    '## Privacy minimization',
    '- Customer name and email are omitted from this engineering request.',
    '- Email addresses, secure links, and token-like values are redacted before storage.',
    `- Redaction applied to this brief: ${redactionApplied ? 'Yes' : 'No sensitive value detected'}`,
    '',
    '## Safety and approval boundaries',
    '- This action stores an internal, reviewable queue request; it does not contact Codex Desktop or launch an agent.',
    '- Do not push, merge, or deploy without explicit owner authorization and the existing deployment approval workflow.',
    '- Do not state that a fix is live until verification and a deployed release are recorded and owner-approved wording is used.',
    '- Do not send customer messages or grant goodwill credits from this handoff.',
    '- Preserve customer data and keep sensitive billing, payment, data, privacy, access, signature, conflict, and incident matters under human review.',
  ].join('\n');

  return { brief, payload };
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

async function findCoordinatorRequest(client: AdminClient, requestId: string) {
  const result = await client.from('ai_engineering_coordinator_inbox').select('*').eq('id', requestId).maybeSingle();
  if (result.error) throw new OperationError('Could not load coordinator inbox request', 500);
  if (!result.data) throw new OperationError('Coordinator inbox request not found', 404);
  return result.data;
}

async function loadOverview(req: Request) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const [caseResult, workResult, approvalResult, followupResult, creditResult, eventResult, inboxResult, inboxEventResult] = await Promise.all([
    client.from('ai_support_cases').select('*').order('created_at', { ascending: false }).limit(500),
    client.from('ai_engineering_work_items').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_deploy_approvals').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_customer_followups').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_goodwill_recommendations').select('*').order('updated_at', { ascending: false }).limit(500),
    client.from('ai_operations_events').select('*').order('occurred_at', { ascending: false }).limit(1000),
    client.from('ai_engineering_coordinator_inbox').select('*').order('queued_at', { ascending: false }).limit(500),
    client.from('ai_engineering_coordinator_inbox_events').select('*').order('occurred_at', { ascending: false }).limit(1000),
  ]);
  const cases = requireQuery(caseResult, 'Loading support cases') as any[];
  const workItems = requireQuery(workResult, 'Loading engineering work items') as any[];
  const approvals = requireQuery(approvalResult, 'Loading deployment approvals') as any[];
  const followups = requireQuery(followupResult, 'Loading customer follow-ups') as any[];
  const credits = requireQuery(creditResult, 'Loading goodwill recommendations') as any[];
  const events = requireQuery(eventResult, 'Loading operations history') as any[];
  const coordinatorInbox = requireQuery(inboxResult, 'Loading coordinator inbox') as any[];
  const coordinatorInboxEvents = requireQuery(inboxEventResult, 'Loading coordinator inbox history') as any[];
  const assessedCases = cases.map((supportCase) => ({
    ...supportCase,
    advisory_assessment: buildAdvisoryAssessment(supportCase, {
      cases,
      workItems,
      approvals,
      followups,
      goodwill: credits,
      inbox: coordinatorInbox,
    }),
  }));

  return jsonResponse(camelize({
    success: true,
    generated_at: new Date().toISOString(),
    role: { email: actor.email, owner: OWNER_EMAILS.has(actor.email) },
    policy: {
      no_autosend: true,
      internal_coordinator_inbox_only: true,
      trusted_local_coordinator_connected: false,
      live_codex_desktop_connection_available: false,
      live_coordinator_integration_available: false,
      agent_launch_available: false,
      deployment_execution_available: false,
      merge_execution_available: false,
      credit_grant_available: false,
      owner_approval_required_for: ['coordinator_inbox_submission', 'deployment', 'fix_live_statement', 'customer_followup', 'goodwill_credit'],
    },
    metrics: buildMetrics(cases, workItems, approvals, followups),
    cases: assessedCases,
    work_items: workItems,
    deploy_approvals: approvals,
    followups,
    goodwill_recommendations: credits,
    coordinator_inbox: coordinatorInbox,
    coordinator_inbox_events: coordinatorInboxEvents,
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

async function handoffEngineering(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  if (body.humanReviewed !== true || body.ownerConfirmed !== true || body.privacyReviewed !== true) {
    throw new OperationError('Owner confirmation and privacy review are required before queueing a coordinator request');
  }
  const client = adminClient();
  const workItemId = uuid(body.workItemId, 'work item id');
  const productImpact = requiredText(body.productImpact, 10000, 'Product impact');
  const evidenceNotes = safeText(body.evidenceNotes, 10000, 'Evidence, links, or notes');
  const requestedEngineeringOutcome = requiredText(
    body.requestedEngineeringOutcome,
    10000,
    'Requested engineering outcome',
  );
  const workItem = await findWorkItem(client, workItemId);
  if (workItem.status === 'cancelled') {
    throw new OperationError('A cancelled engineering item cannot be handed off', 409);
  }
  const supportCase = await findCase(client, workItem.case_id);
  const [casePatternResult, approvalResult, followupResult, goodwillResult, inboxResult] = await Promise.all([
    client.from('ai_support_cases').select('id, topic_key, improvement_type').order('created_at', { ascending: false }).limit(500),
    client.from('ai_deploy_approvals').select('*').eq('work_item_id', workItem.id).maybeSingle(),
    client.from('ai_customer_followups').select('*').eq('case_id', supportCase.id).maybeSingle(),
    client.from('ai_goodwill_recommendations').select('*').eq('case_id', supportCase.id).maybeSingle(),
    client.from('ai_engineering_coordinator_inbox').select('*').eq('work_item_id', workItem.id).order('handoff_revision', { ascending: false }).limit(1),
  ]);
  if (casePatternResult.error || approvalResult.error || followupResult.error || goodwillResult.error || inboxResult.error) {
    console.error('Loading coordinator handoff context', { casePatternResult, approvalResult, followupResult, goodwillResult, inboxResult });
    throw new OperationError('Could not load the current advisory context', 500);
  }
  const advisoryAssessment = buildAdvisoryAssessment(supportCase, {
    cases: [supportCase, ...(casePatternResult.data || []).filter((item) => item.id !== supportCase.id)],
    workItem,
    approval: approvalResult.data,
    followup: followupResult.data,
    goodwillItem: goodwillResult.data,
    coordinatorRequest: inboxResult.data?.[0] || null,
  });
  const handoff = buildCoordinatorBriefRecord(
    supportCase,
    workItem,
    productImpact,
    evidenceNotes,
    requestedEngineeringOutcome,
    advisoryAssessment,
  );
  const previousCount = Number(workItem.coordinator_handoff_count || 0);
  const now = new Date().toISOString();
  const update = await client.from('ai_engineering_work_items').update({
    coordinator_handoff_status: 'handed_off',
    coordinator_handoff_at: now,
    coordinator_handoff_by: actor.id,
    coordinator_handoff_by_email: actor.email,
    coordinator_handoff_count: previousCount + 1,
    coordinator_brief: handoff.brief,
    coordinator_brief_payload: handoff.payload,
    updated_by: actor.id,
  }).eq('id', workItemId)
    .eq('coordinator_handoff_count', previousCount)
    .select('*')
    .maybeSingle();
  if (update.error) {
    console.error('Recording coordinator handoff', update.error);
    throw new OperationError('Recording coordinator handoff failed', 500);
  }
  if (!update.data) throw new OperationError('The engineering item changed; review the latest state and try again', 409);
  const queueResult = await client.from('ai_engineering_coordinator_inbox').select('*')
    .eq('work_item_id', workItemId)
    .eq('handoff_revision', previousCount + 1)
    .maybeSingle();
  if (queueResult.error || !queueResult.data) {
    console.error('Loading recorded coordinator inbox request', queueResult.error);
    throw new OperationError('The handoff was recorded but the internal queue request could not be confirmed', 500);
  }

  return jsonResponse(camelize({
    success: true,
    work_item: update.data,
    coordinator_brief: handoff.brief,
    coordinator_request: queueResult.data,
    coordinator_handoff_recorded: true,
    internal_queue_recorded: true,
    external_delivery_performed: false,
    agent_launched: false,
    deployment_performed: false,
    merge_performed: false,
    customer_message_sent: false,
    credit_granted: false,
  }) as JsonMap);
}

async function claimCoordinatorRequest(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  if (body.localCoordinatorApproved !== true || body.riskChecksCompleted !== true) {
    throw new OperationError('Local coordinator approval and risk checks are required before claiming a request');
  }
  const client = adminClient();
  const requestId = uuid(body.requestId, 'coordinator request id');
  const claimLabel = requiredText(body.claimLabel, 160, 'Claim label');
  const request = await findCoordinatorRequest(client, requestId);
  if (!COORDINATOR_INBOX_STATES.has(request.state)) throw new OperationError('Invalid coordinator inbox state', 409);
  const now = new Date();
  const availableAt = new Date(String(request.available_at || request.queued_at));
  const leaseExpiresAt = new Date(String(request.lease_expires_at || ''));
  const retryAvailable = request.state !== 'retry_required' || (Number.isFinite(availableAt.getTime()) && availableAt <= now);
  const expiredClaim = request.state === 'claimed' && Number.isFinite(leaseExpiresAt.getTime()) && leaseExpiresAt <= now;
  if (!['queued', 'retry_required'].includes(request.state) && !expiredClaim) {
    throw new OperationError('Only an available queued, retry-required, or expired claimed request can be claimed', 409);
  }
  if (!retryAvailable) throw new OperationError('This retry is not available yet', 409);
  const claimedAt = now.toISOString();
  const leaseEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const update = await client.from('ai_engineering_coordinator_inbox').update({
    state: 'claimed',
    claimed_at: claimedAt,
    claimed_by: actor.id,
    claimed_by_email: actor.email,
    claim_label: claimLabel,
    lease_expires_at: leaseEnd,
    attempt_count: Number(request.attempt_count || 0) + 1,
  }).eq('id', requestId)
    .eq('state', request.state)
    .eq('updated_at', request.updated_at)
    .select('*')
    .maybeSingle();
  if (update.error) {
    console.error('Claiming coordinator inbox request', update.error);
    throw new OperationError('Claiming coordinator inbox request failed', 500);
  }
  if (!update.data) throw new OperationError('The coordinator request changed; refresh before claiming it', 409);
  return jsonResponse(camelize({
    success: true,
    coordinator_request: update.data,
    claim_records_ownership_only: true,
    codex_task_created: false,
    agent_launched: false,
    external_delivery_performed: false,
  }) as JsonMap);
}

async function recordCoordinatorRequestOutcome(req: Request, body: JsonMap) {
  const actor = await verifyCoordinator(req);
  const client = adminClient();
  const requestId = uuid(body.requestId, 'coordinator request id');
  const outcome = enumValue(body.outcome, new Set(['task_created', 'retry_required']), 'coordinator outcome');
  const request = await findCoordinatorRequest(client, requestId);
  if (request.state !== 'claimed' || request.claimed_by !== actor.id) {
    throw new OperationError('Only the administrator holding the active claim can record its outcome', 409);
  }
  const now = new Date();
  const leaseExpiresAt = new Date(String(request.lease_expires_at || ''));
  if (!Number.isFinite(leaseExpiresAt.getTime()) || leaseExpiresAt <= now) {
    throw new OperationError('The claim lease expired; reclaim the request after reviewing the current state', 409);
  }
  let patch: JsonMap;
  if (outcome === 'task_created') {
    if (body.taskCreatedOutsideDashboard !== true) {
      throw new OperationError('Confirm that the task was created outside QuoteDr before recording it');
    }
    const rawReference = requiredText(body.taskReference, 500, 'Task reference');
    patch = {
      state: 'task_created',
      task_created_at: now.toISOString(),
      task_reference: privacyMinimizeText(rawReference, {}),
    };
  } else {
    if (body.noCustomerDataIncluded !== true) {
      throw new OperationError('Confirm that the retry record contains no customer data or secrets');
    }
    const errorCode = safeKey(requiredText(body.errorCode, 80, 'Retry error code'));
    if (!/^[a-z0-9_.-]+$/.test(errorCode)) throw new OperationError('Retry error code must use letters, numbers, dots, dashes, or underscores');
    const rawErrorMessage = requiredText(body.errorMessage, 1000, 'Retry error message');
    const retryAfterMinutes = Number(body.retryAfterMinutes);
    if (!Number.isInteger(retryAfterMinutes) || retryAfterMinutes < 1 || retryAfterMinutes > 10080) {
      throw new OperationError('Retry delay must be between 1 minute and 7 days');
    }
    patch = {
      state: 'retry_required',
      last_error_code: errorCode,
      last_error_message: privacyMinimizeText(rawErrorMessage, {}),
      last_error_at: now.toISOString(),
      retry_count: Number(request.retry_count || 0) + 1,
      available_at: new Date(now.getTime() + retryAfterMinutes * 60000).toISOString(),
    };
  }
  const update = await client.from('ai_engineering_coordinator_inbox').update(patch)
    .eq('id', requestId)
    .eq('state', 'claimed')
    .eq('claimed_by', actor.id)
    .eq('updated_at', request.updated_at)
    .select('*')
    .maybeSingle();
  if (update.error) {
    console.error('Recording coordinator request outcome', update.error);
    throw new OperationError('Recording coordinator request outcome failed', 500);
  }
  if (!update.data) throw new OperationError('The coordinator request changed; refresh before recording an outcome', 409);
  return jsonResponse(camelize({
    success: true,
    coordinator_request: update.data,
    outcome_recorded_only: true,
    task_created_by_dashboard: false,
    agent_launched: false,
    external_delivery_performed: false,
  }) as JsonMap);
}

async function cancelCoordinatorRequest(req: Request, body: JsonMap) {
  const actor = await verifyOwner(req);
  const client = adminClient();
  const requestId = uuid(body.requestId, 'coordinator request id');
  const reason = privacyMinimizeText(requiredText(body.reason, 1000, 'Cancellation reason'), {});
  const request = await findCoordinatorRequest(client, requestId);
  if (['task_created', 'cancelled'].includes(request.state)) {
    throw new OperationError('A completed or already-cancelled coordinator request cannot be cancelled', 409);
  }
  const update = await client.from('ai_engineering_coordinator_inbox').update({
    state: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by: actor.id,
    cancellation_reason: reason,
  }).eq('id', requestId)
    .eq('state', request.state)
    .eq('updated_at', request.updated_at)
    .select('*')
    .maybeSingle();
  if (update.error) {
    console.error('Cancelling coordinator inbox request', update.error);
    throw new OperationError('Cancelling coordinator inbox request failed', 500);
  }
  if (!update.data) throw new OperationError('The coordinator request changed; refresh before cancelling it', 409);
  return jsonResponse(camelize({
    success: true,
    coordinator_request: update.data,
    cancellation_recorded_only: true,
    codex_task_cancelled_by_dashboard: false,
    agent_action_performed: false,
  }) as JsonMap);
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
    if (action === 'handoff_engineering') return await handoffEngineering(req, body);
    if (action === 'claim_coordinator_request') return await claimCoordinatorRequest(req, body);
    if (action === 'record_coordinator_request_outcome') return await recordCoordinatorRequestOutcome(req, body);
    if (action === 'cancel_coordinator_request') return await cancelCoordinatorRequest(req, body);
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
