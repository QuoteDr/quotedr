import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPPORT_AGENT_ADAPTER_VERSION, invokeSupportAgent, type SupportAgentRequest } from '../_shared/support-agent-adapter.ts';

// Webhook surface for a trusted Gmail bridge plus authenticated in-app
// feedback. It only creates records; it never sends email, starts engineering,
// deploys, grants credit, or changes a customer account.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTAKE_HMAC_SECRET = Deno.env.get('QUOTEDR_SUPPORT_INTAKE_HMAC_SECRET') ?? '';
const OWNER_EMAILS = new Set(['admin@quotedr.io', 'info@alddirect.ca', ...(Deno.env.get('QUOTEDR_OWNER_EMAILS') ?? '').split(',')].map(normalizeEmail).filter(Boolean));
const ADMIN_EMAILS = new Set(['admin@quotedr.io', 'info@alddirect.ca', 'ald.direct.contracting@gmail.com', ...(Deno.env.get('QUOTEDR_OPERATIONS_COORDINATOR_EMAILS') ?? '').split(',')].map(normalizeEmail).filter(Boolean));
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_MESSAGE_CHARS = 120000;
const ALLOWED_RECIPIENTS = new Set(['support@quotedr.io', 'feedback@quotedr.io']);
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

type JsonMap = Record<string, unknown>;
class IntakeError extends Error { constructor(message: string, public status = 400, public code = 'INTAKE_INVALID') { super(message); } }
const json = (body: JsonMap, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
function normalizeEmail(value: unknown) { return String(value ?? '').trim().toLowerCase(); }
function text(value: unknown, max: number, label: string, required = false) { const output = String(value ?? '').trim(); if (output.length > max) throw new IntakeError(`${label} is too long`, 413); if (required && !output) throw new IntakeError(`${label} is required`); return output; }
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320; }
function adminClient() { if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new IntakeError('Support intake is not configured', 503, 'INTAKE_UNAVAILABLE'); return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
async function actor(req: Request) { const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!token) throw new IntakeError('Missing authorization', 401, 'AUTH_REQUIRED'); const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const result = await verifier.auth.getUser(token); if (result.error || !result.data.user) throw new IntakeError('Invalid authorization', 401, 'AUTH_INVALID'); return { id: result.data.user.id, email: normalizeEmail(result.data.user.email) }; }
function sanitizeHtml(value: string) { return value.replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '').replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '').replace(/javascript\s*:/gi, '').trim(); }
function stripHtml(value: string) { return sanitizeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function privacyMinimize(value: string, senderEmail: string, senderName: string) { let output = value; if (senderEmail) output = output.replace(new RegExp(senderEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[redacted customer email]'); output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]').replace(/\bhttps?:\/\/[^\s)\]}]+/gi, (url) => /[?&](?:token|access_token|signature|sig|key|secret|auth)=/i.test(url) ? '[redacted secure link]' : url).replace(/\b(?:bearer\s+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})\b/gi, '[redacted token]'); if (senderName && senderName.length >= 3) output = output.replace(new RegExp(senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[customer]'); return output.trim(); }
function trimQuotedText(value: string) { const markers = [/^\s*On .+wrote:\s*$/im, /^\s*From:\s.+$/im, /^\s*>{1,}/m, /^\s*---+\s*Original Message\s*---+\s*$/im]; let cut = value.length; for (const marker of markers) { const match = marker.exec(value); if (match && match.index < cut) cut = match.index; } return { visible: value.slice(0, cut).trim(), quoted: value.slice(cut).trim() }; }
async function sha256(value: string) { const bytes = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function hmacMatches(raw: string, supplied: string) { if (!INTAKE_HMAC_SECRET || !supplied) return false; const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(INTAKE_HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)); const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); if (expected.length !== supplied.length) return false; let different = 0; for (let i = 0; i < expected.length; i += 1) different |= expected.charCodeAt(i) ^ supplied.charCodeAt(i); return different === 0; }
function normalizedAttachments(value: unknown) { if (!Array.isArray(value) || value.length > 20) throw new IntakeError('Invalid attachment metadata'); return value.map((item) => { const row = item && typeof item === 'object' ? item as JsonMap : {}; return { name: text(row.name, 260, 'Attachment name'), mime_type: text(row.mimeType, 160, 'Attachment mime type'), size_bytes: Number.isInteger(row.sizeBytes) && Number(row.sizeBytes) >= 0 && Number(row.sizeBytes) <= 25_000_000 ? Number(row.sizeBytes) : 0, quarantined: true, content_stored: false }; }); }

async function ingest(record: JsonMap, source: 'email' | 'in_app_feedback', createdBy: string) {
  const client = adminClient();
  const provider = text(record.provider, 80, 'Provider', true).toLowerCase();
  const messageId = text(record.providerMessageId, 500, 'Provider message ID', true);
  const threadId = text(record.providerThreadId, 500, 'Provider thread ID');
  const recipient = normalizeEmail(record.recipientAddress);
  if (source === 'email' && !ALLOWED_RECIPIENTS.has(recipient)) throw new IntakeError('Recipient is not an allowed support alias', 403, 'RECIPIENT_DENIED');
  const senderEmail = normalizeEmail(record.senderEmail);
  if (source === 'email' && !validEmail(senderEmail)) throw new IntakeError('Sender email is invalid', 400, 'SENDER_INVALID');
  const subject = text(record.subject || 'Support request', 500, 'Subject', true);
  const plainSource = text(record.plaintext ?? record.html ?? '', MAX_MESSAGE_CHARS, 'Message body', true);
  const sanitizedHtml = sanitizeHtml(text(record.html || '', 160000, 'HTML body'));
  const cleanText = stripHtml(plainSource);
  const trimmed = trimQuotedText(cleanText);
  const visibleText = trimmed.visible || cleanText;
  if (!visibleText) throw new IntakeError('Message body has no readable content', 400, 'BODY_EMPTY');
  const attachments = normalizedAttachments(record.attachments || []);
  const intakeKey = `${provider}:${messageId}`;
  const contentHash = await sha256(`${subject}\n${visibleText}\n${senderEmail}`);
  const caseSubject = privacyMinimize(subject, senderEmail, text(record.senderName, 160, 'Sender name')).slice(0, 240) || 'Support request';
  const caseSummary = privacyMinimize(visibleText, senderEmail, text(record.senderName, 160, 'Sender name')).slice(0, 5000) || 'Restricted original message is available to an administrator.';
  const delivery = await client.from('ai_support_intake_deliveries').select('*').eq('delivery_key', intakeKey).maybeSingle();
  if (delivery.error) throw new IntakeError('Could not check delivery replay state', 500, 'DELIVERY_LOOKUP_FAILED');
  if (delivery.data?.case_id) {
    await client.from('ai_support_intake_deliveries').update({ state: 'duplicate', attempt_count: Math.min(20, Number(delivery.data.attempt_count || 1) + 1), last_error_code: '' }).eq('id', delivery.data.id);
    return { duplicate: true, caseId: delivery.data.case_id, rawMessageId: delivery.data.raw_message_id, agentStatus: 'not_requested' };
  }
  if (!delivery.data) {
    const created = await client.from('ai_support_intake_deliveries').insert({ delivery_key: intakeKey, source, provider, provider_message_id: messageId, provider_thread_id: threadId, state: 'received' }).select('*').single();
    if (created.error) throw new IntakeError('Could not create intake delivery', 500, 'DELIVERY_CREATE_FAILED');
  } else {
    const attemptCount = Math.min(20, Number(delivery.data.attempt_count || 1) + 1);
    const state = attemptCount >= 5 ? 'dead_letter' : 'retry_required';
    await client.from('ai_support_intake_deliveries').update({ state, attempt_count: attemptCount }).eq('id', delivery.data.id);
    if (state === 'dead_letter') throw new IntakeError('Delivery exceeded retry limit and is in dead-letter state', 409, 'DELIVERY_DEAD_LETTER');
  }
  const existingCase = await client.from('ai_support_cases').select('*').eq('intake_key', intakeKey).maybeSingle();
  if (existingCase.error) throw new IntakeError('Could not check intake idempotency', 500, 'CASE_LOOKUP_FAILED');
  if (existingCase.data) return { duplicate: true, caseId: existingCase.data.id, rawMessageId: null, agentStatus: existingCase.data.agent_status };
  const assessment = { adapterVersion: SUPPORT_AGENT_ADAPTER_VERSION, status: 'unavailable', classification: null, confidence: null, safeWorkaround: '', missingInformation: [], sensitiveFlags: [], recommendedAction: 'owner_review_required', approvalRequirements: ['human_review', 'owner_review_for_sensitive_actions'] };
  const caseResult = await client.from('ai_support_cases').insert({ source: source === 'email' ? 'email' : 'in_app', customer_name: '', customer_email: '', subject: caseSubject, summary: caseSummary, topic_key: 'support_feedback', improvement_type: source === 'in_app_feedback' && record.feedbackType === 'bug' ? 'bug' : 'feature', risk_level: 'sensitive', sensitive_flags: ['privacy'], workflow_stage: 'intake', is_likely_bug: source === 'in_app_feedback' && record.feedbackType === 'bug', possible_solution: '', safe_workaround: '', immediate_response_draft: '', immediate_response_status: 'draft', human_review_required: true, owner_review_required: true, created_by: createdBy, updated_by: createdBy, intake_key: intakeKey, agent_status: 'unavailable', agent_assessment: assessment }).select('*').single();
  if (caseResult.error) throw new IntakeError('Could not create support case', 500, 'CASE_CREATE_FAILED');
  const supportCase = caseResult.data;
  const rawResult = await client.from('ai_support_raw_messages').insert({ case_id: supportCase.id, source, provider, provider_message_id: messageId, provider_thread_id: threadId, in_reply_to: text(record.inReplyTo, 500, 'In-Reply-To'), reference_ids: Array.isArray(record.referenceIds) ? record.referenceIds.slice(0, 40).map((value) => text(value, 500, 'Reference ID')) : [], recipient_address: recipient, sender_email: senderEmail, sender_display_name: text(record.senderName, 160, 'Sender name'), subject, received_at: record.receivedAt ? new Date(String(record.receivedAt)).toISOString() : null, body_plaintext: visibleText, body_sanitized_html: sanitizedHtml, quoted_text: trimmed.quoted, attachment_metadata: attachments, content_sha256: contentHash }).select('*').single();
  if (rawResult.error) { await client.from('ai_support_cases').delete().eq('id', supportCase.id); throw new IntakeError('Could not store restricted raw message', 500, 'RAW_STORE_FAILED'); }
  const agentRequest: SupportAgentRequest = { version: SUPPORT_AGENT_ADAPTER_VERSION, caseId: supportCase.id, source, subject, originalMessage: visibleText, sender: { email: senderEmail, name: text(record.senderName, 160, 'Sender name') }, thread: { provider, messageId, threadId, inReplyTo: text(record.inReplyTo, 500, 'In-Reply-To') }, attachmentMetadata: attachments.map((item) => ({ name: item.name, mimeType: item.mime_type, sizeBytes: item.size_bytes })) };
  const agent = await invokeSupportAgent(agentRequest);
  await client.from('ai_support_agent_runs').insert({ case_id: supportCase.id, raw_message_id: rawResult.data.id, adapter_version: SUPPORT_AGENT_ADAPTER_VERSION, mode: agent.status === 'unavailable' ? 'unavailable' : agent.status === 'mock' ? 'mock' : 'live', status: agent.status === 'unavailable' ? 'unavailable' : 'completed', result: agent.status === 'unavailable' ? { message: agent.message } : agent.result, failure_code: agent.status === 'unavailable' ? agent.code : '' });
  await client.from('ai_operations_events').insert({ case_id: supportCase.id, actor_id: createdBy, actor_email: 'support-intake@system.invalid', event_type: 'support_intake_created', details: { source, provider, provider_message_id: messageId, provider_thread_id_present: Boolean(threadId), attachment_count: attachments.length, raw_content_in_event: false, agent_status: agent.status, customer_message_sent: false, engineering_started: false } });
  await client.from('ai_support_intake_deliveries').update({ state: 'processed', case_id: supportCase.id, raw_message_id: rawResult.data.id, last_error_code: '' }).eq('delivery_key', intakeKey);
  return { duplicate: false, caseId: supportCase.id, rawMessageId: rawResult.data.id, agentStatus: agent.status };
}

async function ingestEmail(req: Request, raw: string, record: JsonMap) { if (!(await hmacMatches(raw, req.headers.get('x-quotedr-intake-signature') || ''))) throw new IntakeError('Invalid bridge signature', 401, 'SIGNATURE_INVALID'); const systemActor = text(Deno.env.get('QUOTEDR_SUPPORT_INTAKE_ACTOR_ID'), 80, 'Intake actor ID', true); return ingest(record, 'email', systemActor); }
async function ingestFeedback(req: Request, record: JsonMap) { const user = await actor(req); const requestedUserId = text(record.userId, 80, 'Feedback user ID'); if (requestedUserId && requestedUserId !== user.id) throw new IntakeError('Cross-account feedback intake denied', 403, 'CROSS_ACCOUNT_DENIED'); return ingest({ provider: 'quotedr-feedback', providerMessageId: text(record.feedbackKey, 500, 'Feedback key', true), providerThreadId: '', recipientAddress: 'feedback@quotedr.io', senderEmail: user.email, senderName: '', subject: record.feedbackType === 'bug' ? 'In-app bug report' : 'In-app feature request', plaintext: text(record.description, 12000, 'Feedback description', true), html: '', attachments: [], feedbackType: record.feedbackType, receivedAt: record.createdAt }, 'in_app_feedback', user.id); }
async function rawDetail(req: Request, record: JsonMap) { const user = await actor(req); if (!ADMIN_EMAILS.has(user.email)) throw new IntakeError('Administrator access required', 403, 'ADMIN_REQUIRED'); const caseId = text(record.caseId, 80, 'Case ID', true); const result = await adminClient().from('ai_support_raw_messages').select('id, source, provider, provider_message_id, provider_thread_id, in_reply_to, reference_ids, recipient_address, sender_email, sender_display_name, subject, received_at, body_plaintext, body_sanitized_html, quoted_text, attachment_metadata, purge_after, deleted_at, created_at').eq('case_id', caseId).order('created_at', { ascending: true }); if (result.error) throw new IntakeError('Could not load original message', 500, 'RAW_LOAD_FAILED'); return { rawMessages: result.data || [] }; }
async function purgeRetention(req: Request) { const user = await actor(req); if (!OWNER_EMAILS.has(user.email)) throw new IntakeError('Owner approval required', 403, 'OWNER_REQUIRED'); const client = adminClient(); const expired = await client.from('ai_support_raw_messages').select('id, case_id').lt('purge_after', new Date().toISOString()).is('deleted_at', null).limit(500); if (expired.error) throw new IntakeError('Could not load expired messages', 500, 'PURGE_LOOKUP_FAILED'); if (!expired.data?.length) return { deleted: 0 }; const ids = expired.data.map((row) => row.id); const removed = await client.from('ai_support_raw_messages').delete().in('id', ids); if (removed.error) throw new IntakeError('Could not purge expired messages', 500, 'PURGE_FAILED'); await Promise.all(expired.data.map((row) => client.from('ai_operations_events').insert({ case_id: row.case_id, actor_id: user.id, actor_email: user.email, event_type: 'support_raw_message_purged', details: { raw_content_in_event: false, retention_policy: '90_days' } })));
  return { deleted: ids.length };
}

Deno.serve(async (req) => { if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders }); if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405); try { const raw = await req.text(); if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) throw new IntakeError('Request is too large', 413, 'REQUEST_TOO_LARGE'); const body = raw ? JSON.parse(raw) : {}; if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntakeError('Invalid JSON body'); const record = body as JsonMap; const action = text(record.action, 80, 'Action', true); if (action === 'ingest_email') return json(await ingestEmail(req, raw, record)); if (action === 'ingest_feedback') return json(await ingestFeedback(req, record)); if (action === 'raw_detail') return json(await rawDetail(req, record)); if (action === 'purge_retention') return json(await purgeRetention(req)); throw new IntakeError('Unsupported intake action'); } catch (error) { const typed = error instanceof IntakeError ? error : new IntakeError('Support intake failed', 500, 'INTAKE_FAILED'); console.error('Support intake failed', { code: typed.code, message: typed.message }); return json({ error: typed.message, code: typed.code }, typed.status); } });
