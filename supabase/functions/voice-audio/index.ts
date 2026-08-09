import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  VOICE_AUDIO_ACCOUNT_CAP_BYTES,
  VOICE_AUDIO_BUCKET,
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_NOTICE_VERSION,
  VOICE_AUDIO_POST_CASE_RETENTION_DAYS,
  VOICE_AUDIO_SIGNED_URL_SECONDS,
  isVoiceAudioExpired,
  normalizeVoiceAudioAccountEmail,
  normalizeVoiceAudioByteSize,
  normalizeVoiceAudioCase,
  normalizeVoiceAudioDurationMs,
  normalizeVoiceAudioMimeType,
  normalizeVoiceAudioUuid,
  safeVoiceAudioRecording,
  voiceAudioQuotaSummary,
  voiceAudioUsageBytes,
} from '../_shared/voice-audio-policy.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CLEANUP_TOKEN = Deno.env.get('VOICE_AUDIO_CLEANUP_TOKEN') ?? '';
const MAX_BODY_BYTES = 64 * 1024;
const ADMIN_EMAILS = new Set([
  'admin@quotedr.io',
  'info@alddirect.ca',
  'ald.direct.contracting@gmail.com',
  ...(Deno.env.get('QUOTEDR_ADMIN_EMAILS') ?? '').split(','),
].map((email) => email.trim().toLowerCase()).filter(Boolean));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-quotedr-cleanup-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class OperationError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, code = 'invalid_request', details?: Record<string, unknown>) {
    super(message);
    this.name = 'OperationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Voice audio service is not configured');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(header.slice(7).trim());
  if (error || !data?.user) return null;
  return data.user;
}

function isAdminEmail(value: unknown) {
  return ADMIN_EMAILS.has(String(value ?? '').trim().toLowerCase());
}

function constantTimeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function validated<T>(callback: () => T, status: number, code: string): T {
  try {
    return callback();
  } catch (error) {
    throw new OperationError(String((error as Error)?.message || 'Invalid request.'), status, code);
  }
}

function requiredUuid(value: unknown, label = 'Audio recording id') {
  return validated(() => normalizeVoiceAudioUuid(value, label), 400, 'invalid_identifier');
}

function requiredCase(caseReference: unknown, caseReason: unknown) {
  return validated(() => normalizeVoiceAudioCase(caseReference, caseReason), 400, 'invalid_support_case');
}

function requiredAccountEmail(value: unknown) {
  return validated(() => normalizeVoiceAudioAccountEmail(value), 400, 'invalid_account_email');
}

function normalizeTranscriptIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = value.slice(0, 50).map((id) => requiredUuid(id, 'Transcript id'));
  return [...new Set(ids)];
}

function mapDatabaseError(error: any): never {
  const message = String(error?.message || '');
  if (message.includes('voice_audio_quota_exceeded')) {
    throw new OperationError('Your 100 MB AI Voice audio allowance is full. Delete an older recording or wait for expiry.', 409, 'quota_exceeded');
  }
  if (message.includes('voice_audio_consent_required')) {
    throw new OperationError('Choose Save private audio for 14 days and accept the current notice first.', 409, 'consent_required');
  }
  if (message.includes('voice_audio_duration_limit')) throw new OperationError('The recording exceeds the five-minute limit.', 413, 'duration_limit');
  if (message.includes('voice_audio_size_limit')) throw new OperationError('The recording exceeds the 6 MB file limit.', 413, 'size_limit');
  if (message.includes('voice_audio_mime')) throw new OperationError('The browser recording format is not supported.', 415, 'unsupported_mime');
  if (message.includes('voice_audio_upload_expired')) throw new OperationError('This upload session expired. Start the audio upload again.', 409, 'upload_expired');
  if (message.includes('voice_audio_transcript_not_found')) throw new OperationError('The saved transcript could not be found.', 404, 'transcript_not_found');
  if (message.includes('voice_audio_recording_not_found')) throw new OperationError('The audio recording could not be found.', 404, 'recording_not_found');
  throw error;
}

async function startAudit(service: any, values: Record<string, unknown>) {
  const { data, error } = await service
    .from('ai_voice_audio_access_audit')
    .insert({ ...values, outcome: 'started' })
    .select('id')
    .single();
  if (error || !data?.id) throw error || new Error('Audio access audit could not be started');
  return data.id;
}

async function completeAudit(service: any, auditId: number, patch: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('ai_voice_audio_access_audit')
    .update({ outcome: 'completed', completed_at: new Date().toISOString(), ...patch })
    .eq('id', auditId)
    .select('id')
    .maybeSingle();
  if (error || !data) throw error || new Error('Audio access audit could not be completed');
}

async function failAudit(service: any, auditId: number | null, outcome: 'denied' | 'failed', code: string) {
  if (!auditId) return;
  await service
    .from('ai_voice_audio_access_audit')
    .update({ outcome, error_code: String(code || 'failed').slice(0, 100), completed_at: new Date().toISOString() })
    .eq('id', auditId);
}

async function ownedRecording(service: any, userId: string, recordingId: unknown) {
  const id = requiredUuid(recordingId);
  const { data, error } = await service
    .from('ai_voice_audio_recordings')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OperationError('Audio recording not found.', 404, 'recording_not_found');
  return data;
}

function requirePlaybackReady(record: any) {
  if (record.deleted_at || record.upload_status !== 'ready' || isVoiceAudioExpired(record)) {
    throw new OperationError('This audio recording is no longer available.', 410, 'recording_expired');
  }
}

async function removeStorageObject(service: any, path: string) {
  if (!path) return;
  const { error } = await service.storage.from(VOICE_AUDIO_BUCKET).remove([path]);
  if (error) throw error;
}

async function markInvalidUpload(service: any, record: any, reason: string) {
  const timestamp = new Date().toISOString();
  let removed = false;
  try {
    await removeStorageObject(service, record.object_path);
    removed = true;
  } catch (_) {}
  await service
    .from('ai_voice_audio_recordings')
    .update({
      upload_status: removed ? 'failed' : 'deletion_pending',
      failure_reason: String(reason || 'invalid_upload').slice(0, 300),
      deletion_reason: 'invalid_upload',
      deleted_at: removed ? timestamp : null,
      updated_at: timestamp,
    })
    .eq('id', record.id)
    .eq('upload_status', 'upload_pending')
    .is('deleted_at', null);
}

async function cleanupExpiredAudio(service: any, limit = 100) {
  const now = new Date();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const nowIso = now.toISOString();
  const [pendingResult, ordinaryResult, closedResult, deletionResult] = await Promise.all([
    service
      .from('ai_voice_audio_recordings')
      .select('*')
      .is('deleted_at', null)
      .eq('upload_status', 'upload_pending')
      .lte('upload_deadline', nowIso)
      .order('upload_deadline', { ascending: true })
      .limit(safeLimit),
    service
      .from('ai_voice_audio_recordings')
      .select('*')
      .is('deleted_at', null)
      .eq('upload_status', 'ready')
      .eq('support_hold_state', 'none')
      .lte('expires_at', nowIso)
      .order('expires_at', { ascending: true })
      .limit(safeLimit),
    service
      .from('ai_voice_audio_recordings')
      .select('*')
      .is('deleted_at', null)
      .eq('upload_status', 'ready')
      .eq('support_hold_state', 'closed')
      .lte('post_case_delete_at', nowIso)
      .order('post_case_delete_at', { ascending: true })
      .limit(safeLimit),
    service
      .from('ai_voice_audio_recordings')
      .select('*')
      .is('deleted_at', null)
      .eq('upload_status', 'deletion_pending')
      .order('updated_at', { ascending: true })
      .limit(safeLimit),
  ]);
  for (const result of [pendingResult, ordinaryResult, closedResult, deletionResult]) {
    if (result.error) throw result.error;
  }
  const candidates = [
    ...(pendingResult.data || []),
    ...(ordinaryResult.data || []),
    ...(closedResult.data || []),
    ...(deletionResult.data || []),
  ];
  const uniqueDue = new Map<string, any>();
  for (const record of candidates) {
    if (record.upload_status === 'deletion_pending' || isVoiceAudioExpired(record, now)) uniqueDue.set(record.id, record);
  }
  const due = [...uniqueDue.values()].slice(0, safeLimit);
  let deleted = 0;
  let failed = 0;
  for (let record of due) {
    const originalReason = String(record.deletion_reason || '');
    const orphan = record.upload_status === 'upload_pending'
      || originalReason === 'upload_window_expired'
      || originalReason === 'invalid_upload';
    const requestedDeletion = originalReason === 'owner_deleted' || originalReason === 'transcript_deleted';
    const action = orphan ? 'orphan_delete' : 'expiry_delete';
    const reason = originalReason || (orphan
      ? 'upload_window_expired'
      : record.support_hold_state === 'closed' ? 'post_case_retention_expired' : 'retention_expired');
    let auditId: number | null = null;
    try {
      if (record.upload_status !== 'deletion_pending') {
        let claim = service
          .from('ai_voice_audio_recordings')
          .update({
            upload_status: 'deletion_pending',
            deletion_reason: reason,
            updated_at: nowIso,
          })
          .eq('id', record.id)
          .eq('upload_status', record.upload_status)
          .is('deleted_at', null);
        if (orphan) {
          claim = claim.lte('upload_deadline', nowIso);
        } else if (record.support_hold_state === 'closed') {
          claim = claim.eq('support_hold_state', 'closed').lte('post_case_delete_at', nowIso);
        } else {
          claim = claim.eq('support_hold_state', 'none').lte('expires_at', nowIso);
        }
        const { data: claimed, error: claimError } = await claim.select('*').maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) continue;
        record = claimed;
      }
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: record.user_id,
        actor_role: 'system',
        actor_email: '',
        action,
        case_reference: record.support_case_reference,
        reason,
      });
      await removeStorageObject(service, record.object_path);
      const timestamp = new Date().toISOString();
      const { error: updateError } = await service
        .from('ai_voice_audio_recordings')
        .update({
          upload_status: orphan ? 'failed' : requestedDeletion ? 'deleted' : 'expired',
          deleted_at: timestamp,
          deletion_reason: reason,
          failure_reason: orphan
            ? record.failure_reason || (reason === 'invalid_upload'
              ? 'Invalid upload was removed during orphan cleanup.'
              : 'Upload was not finalized before its two-hour deadline.')
            : null,
          updated_at: timestamp,
        })
        .eq('id', record.id)
        .eq('upload_status', 'deletion_pending');
      if (updateError) throw updateError;
      await completeAudit(service, auditId);
      deleted += 1;
    } catch (_) {
      await failAudit(service, auditId, 'failed', 'cleanup_failed');
      failed += 1;
    }
  }
  await service.from('ai_voice_audio_access_audit').delete().lte('expires_at', now.toISOString());
  return { checked: candidates.length, due: due.length, deleted, failed };
}

async function quotaForOwner(service: any, userId: string) {
  const { data, error } = await service
    .from('ai_voice_audio_recordings')
    .select('byte_size,upload_status,upload_deadline,expires_at,support_hold_state,post_case_delete_at,deleted_at')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return voiceAudioQuotaSummary(voiceAudioUsageBytes(data || []));
}

async function currentAudioPreference(service: any, userId: string) {
  const { data, error } = await service
    .from('ai_voice_transcript_preferences')
    .select('notice_version,acknowledged_at,save_audio_for_support,audio_consent_version,audio_consent_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function parseBody(req: Request) {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw new OperationError('Request is too large.', 413, 'request_too_large');
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new OperationError('Request is too large.', 413, 'request_too_large');
  }
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (_) {
    throw new OperationError('Request body must be valid JSON.', 400, 'invalid_json');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let auditId: number | null = null;
  let service: any = null;
  try {
    const body = await parseBody(req);
    const action = String(body.action || '').trim().toLowerCase();
    service = serviceClient();

    if (action === 'cleanup_expired') {
      const token = req.headers.get('x-quotedr-cleanup-token') || '';
      if (!constantTimeEqual(token, CLEANUP_TOKEN)) {
        throw new OperationError('Cleanup authorization required.', 403, 'cleanup_forbidden');
      }
      return json({ success: true, cleanup: await cleanupExpiredAudio(service, 500) });
    }

    const user = await authenticatedUser(req);
    if (!user) throw new OperationError('Authentication required.', 401, 'authentication_required');
    const actorEmail = String(user.email || '').trim().toLowerCase();

    if (action === 'quota') {
      await cleanupExpiredAudio(service, 25);
      return json({
        success: true,
        preference: await currentAudioPreference(service, user.id),
        quota: await quotaForOwner(service, user.id),
      });
    }

    if (action === 'prepare_upload') {
      const transcriptId = requiredUuid(body.transcriptId, 'Transcript id');
      const mimeType = validated(() => normalizeVoiceAudioMimeType(body.mimeType), 415, 'unsupported_mime');
      const durationMs = validated(() => normalizeVoiceAudioDurationMs(body.durationMs), 413, 'duration_limit');
      const byteSize = validated(() => normalizeVoiceAudioByteSize(body.byteSize), 413, 'size_limit');
      const idempotencyKey = requiredUuid(body.idempotencyKey, 'Upload idempotency key');
      auditId = await startAudit(service, {
        transcript_id: transcriptId,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'upload_prepare',
        reason: 'Optional Voice To Quote support audio upload',
      });
      const { data, error } = await service.rpc('quotedr_reserve_ai_voice_audio_recording', {
        p_user_id: user.id,
        p_transcript_id: transcriptId,
        p_mime_type: mimeType,
        p_duration_ms: durationMs,
        p_byte_size: byteSize,
        p_idempotency_key: idempotencyKey,
        p_notice_version: VOICE_AUDIO_NOTICE_VERSION,
      });
      if (error) mapDatabaseError(error);
      const record = Array.isArray(data) ? data[0] : data;
      if (!record) throw new Error('Audio upload reservation was not created');
      await service.from('ai_voice_audio_access_audit').update({ recording_id: record.id }).eq('id', auditId);
      if (record.upload_status === 'ready') {
        await completeAudit(service, auditId);
        return json({ success: true, alreadyFinalized: true, recording: safeVoiceAudioRecording(record) });
      }
      if (record.deleted_at || record.upload_status !== 'upload_pending' || new Date(record.upload_deadline) <= new Date()) {
        throw new OperationError('This upload session expired. Retry with a new recording.', 409, 'upload_expired');
      }
      const { data: upload, error: uploadError } = await service.storage
        .from(VOICE_AUDIO_BUCKET)
        .createSignedUploadUrl(record.object_path, { upsert: true });
      if (uploadError || !upload?.token) throw uploadError || new Error('Signed upload token was not created');
      await completeAudit(service, auditId);
      return json({
        success: true,
        alreadyFinalized: false,
        recording: safeVoiceAudioRecording(record),
        upload: {
          bucket: VOICE_AUDIO_BUCKET,
          path: record.object_path,
          token: upload.token,
          expiresAt: record.upload_deadline,
        },
      });
    }

    if (action === 'finalize_upload') {
      const record = await ownedRecording(service, user.id, body.recordingId);
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'upload_finalize',
        reason: 'Verify uploaded audio object before retention begins',
      });
      if (record.upload_status === 'ready') {
        await completeAudit(service, auditId);
        return json({ success: true, recording: safeVoiceAudioRecording(record), alreadyFinalized: true });
      }
      const pathParts = String(record.object_path || '').split('/');
      const fileName = pathParts.pop() || '';
      const folder = pathParts.join('/');
      const { data: objects, error: listError } = await service.storage
        .from(VOICE_AUDIO_BUCKET)
        .list(folder, { limit: 20, search: fileName });
      if (listError) throw listError;
      const object = (objects || []).find((candidate: any) => candidate.name === fileName);
      if (!object) throw new OperationError('The audio upload has not completed yet. Retry when you are online.', 409, 'upload_incomplete');
      const actualSize = Number(object.metadata?.size ?? object.metadata?.contentLength);
      const actualMime = String(object.metadata?.mimetype ?? object.metadata?.contentType ?? '').trim().toLowerCase();
      if (!Number.isFinite(actualSize) || actualSize < 1 || !actualMime) {
        await markInvalidUpload(service, record, 'Storage metadata was incomplete');
        throw new OperationError('The uploaded audio could not be verified and was removed.', 422, 'upload_unverified');
      }
      try {
        normalizeVoiceAudioByteSize(actualSize);
        normalizeVoiceAudioMimeType(actualMime);
      } catch (_) {
        await markInvalidUpload(service, record, 'Storage object exceeded the approved size or MIME policy');
        throw new OperationError('The uploaded audio did not meet the approved format or size policy and was removed.', 422, 'upload_mismatch');
      }
      if (actualSize > VOICE_AUDIO_MAX_BYTES || actualMime.split(';')[0] !== String(record.mime_type).split(';')[0]) {
        await markInvalidUpload(service, record, 'Storage object did not match the reserved format or size');
        throw new OperationError('The uploaded audio did not match the approved format and was removed.', 422, 'upload_mismatch');
      }
      const { data, error } = await service.rpc('quotedr_finalize_ai_voice_audio_recording', {
        p_user_id: user.id,
        p_recording_id: record.id,
        p_actual_mime_type: actualMime,
        p_actual_byte_size: actualSize,
      });
      if (error) {
        await markInvalidUpload(service, record, String(error.message || 'Finalization failed'));
        mapDatabaseError(error);
      }
      const finalized = Array.isArray(data) ? data[0] : data;
      if (!finalized) throw new Error('Audio upload could not be finalized');
      await completeAudit(service, auditId);
      return json({ success: true, recording: safeVoiceAudioRecording(finalized), alreadyFinalized: false });
    }

    if (action === 'list_owner') {
      await cleanupExpiredAudio(service, 25);
      const transcriptIds = normalizeTranscriptIds(body.transcriptIds);
      if (!transcriptIds.length) return json({ success: true, recordings: [] });
      const { data, error } = await service
        .from('ai_voice_audio_recordings')
        .select('*')
        .eq('user_id', user.id)
        .in('transcript_id', transcriptIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({ success: true, recordings: (data || []).map(safeVoiceAudioRecording) });
    }

    if (action === 'owner_playback') {
      await cleanupExpiredAudio(service, 25);
      const record = await ownedRecording(service, user.id, body.recordingId);
      requirePlaybackReady(record);
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'owner_playback',
        case_reference: record.support_case_reference,
        reason: 'Account owner requested private playback',
      });
      const { data: signed, error } = await service.storage
        .from(VOICE_AUDIO_BUCKET)
        .createSignedUrl(record.object_path, VOICE_AUDIO_SIGNED_URL_SECONDS);
      if (error || !signed?.signedUrl) throw error || new Error('Playback URL was not created');
      const now = new Date();
      const signedExpiry = new Date(now.getTime() + VOICE_AUDIO_SIGNED_URL_SECONDS * 1000).toISOString();
      await service.from('ai_voice_audio_recordings').update({ last_accessed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', record.id);
      await completeAudit(service, auditId, { signed_url_expires_at: signedExpiry });
      return json({ success: true, signedUrl: signed.signedUrl, expiresAt: signedExpiry });
    }

    if (action === 'delete_recording') {
      const record = await ownedRecording(service, user.id, body.recordingId);
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'owner_delete',
        case_reference: record.support_case_reference,
        reason: 'Account owner requested immediate audio deletion',
      });
      if (record.support_hold_state === 'active') {
        await failAudit(service, auditId, 'denied', 'active_support_hold');
        throw new OperationError('This recording is temporarily held for an active authorized support case. End or close the support hold before deleting it.', 409, 'active_support_hold');
      }
      if (!record.deleted_at) {
        const timestamp = new Date().toISOString();
        const { data: claimed, error: claimError } = await service.from('ai_voice_audio_recordings').update({
          upload_status: 'deletion_pending',
          deletion_reason: 'owner_deleted',
          updated_at: timestamp,
        }).eq('id', record.id)
          .eq('user_id', user.id)
          .neq('support_hold_state', 'active')
          .in('upload_status', ['upload_pending', 'ready'])
          .is('deleted_at', null)
          .select('*')
          .maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) throw new OperationError('This recording changed before deletion. Refresh its status and try again.', 409, 'recording_changed');
        await removeStorageObject(service, claimed.object_path);
        const { error } = await service.from('ai_voice_audio_recordings').update({
          upload_status: 'deleted',
          deleted_at: timestamp,
          deletion_reason: 'owner_deleted',
          updated_at: timestamp,
        }).eq('id', record.id).eq('upload_status', 'deletion_pending');
        if (error) throw error;
      }
      await completeAudit(service, auditId);
      return json({ success: true });
    }

    if (action === 'delete_transcript') {
      const transcriptId = requiredUuid(body.transcriptId, 'Transcript id');
      const { data: transcript, error: transcriptError } = await service
        .from('ai_voice_transcripts')
        .select('id')
        .eq('id', transcriptId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (transcriptError) throw transcriptError;
      if (!transcript) return json({ success: true, alreadyDeleted: true });
      const { data: recordings, error: recordingError } = await service
        .from('ai_voice_audio_recordings')
        .select('*')
        .eq('transcript_id', transcriptId)
        .eq('user_id', user.id)
        .is('deleted_at', null);
      if (recordingError) throw recordingError;
      const activeHold = (recordings || []).find((record: any) => record.support_hold_state === 'active');
      if (activeHold) {
        const deniedAudit = await startAudit(service, {
          recording_id: activeHold.id,
          transcript_id: transcriptId,
          owner_user_id: user.id,
          actor_user_id: user.id,
          actor_email: actorEmail,
          actor_role: 'owner',
          action: 'transcript_delete',
          case_reference: activeHold.support_case_reference,
          reason: 'Owner attempted transcript deletion during active audio support hold',
        });
        await failAudit(service, deniedAudit, 'denied', 'active_support_hold');
        throw new OperationError('This transcript has audio temporarily held for an active authorized support case. Close the support hold before deleting it.', 409, 'active_support_hold');
      }
      for (const record of recordings || []) {
        const deleteAudit = await startAudit(service, {
          recording_id: record.id,
          transcript_id: transcriptId,
          owner_user_id: user.id,
          actor_user_id: user.id,
          actor_email: actorEmail,
          actor_role: 'owner',
          action: 'transcript_delete',
          case_reference: record.support_case_reference,
          reason: 'Owner deleted transcript and attached audio evidence',
        });
        const timestamp = new Date().toISOString();
        const { data: claimed, error: claimError } = await service.from('ai_voice_audio_recordings').update({
          upload_status: 'deletion_pending',
          deletion_reason: 'transcript_deleted',
          updated_at: timestamp,
        }).eq('id', record.id)
          .eq('user_id', user.id)
          .neq('support_hold_state', 'active')
          .in('upload_status', ['upload_pending', 'ready'])
          .is('deleted_at', null)
          .select('*')
          .maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) {
          await failAudit(service, deleteAudit, 'denied', 'recording_changed');
          throw new OperationError('Attached audio changed before deletion. Refresh the history and try again.', 409, 'recording_changed');
        }
        await removeStorageObject(service, claimed.object_path);
        const { error: audioDeleteError } = await service.from('ai_voice_audio_recordings').update({
          upload_status: 'deleted',
          deleted_at: timestamp,
          deletion_reason: 'transcript_deleted',
          updated_at: timestamp,
        }).eq('id', record.id).eq('upload_status', 'deletion_pending');
        if (audioDeleteError) throw audioDeleteError;
        await completeAudit(service, deleteAudit);
      }
      const { error: deleteError } = await service
        .from('ai_voice_transcripts')
        .delete()
        .eq('id', transcriptId)
        .eq('user_id', user.id);
      if (deleteError) throw deleteError;
      return json({ success: true });
    }

    if (action === 'preserve_for_support') {
      if (body.authorizationConfirmed !== true) {
        throw new OperationError('Explicit recording access authorization is required.', 400, 'authorization_required');
      }
      const caseDetails = requiredCase(body.caseReference, body.caseReason);
      const record = await ownedRecording(service, user.id, body.recordingId);
      requirePlaybackReady(record);
      if (record.support_hold_state === 'active' && record.support_case_reference !== caseDetails.caseReference) {
        throw new OperationError('This recording is already held for a different support case.', 409, 'different_active_case');
      }
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'preserve_authorized',
        case_reference: caseDetails.caseReference,
        reason: caseDetails.caseReason,
      });
      const timestamp = new Date().toISOString();
      const { data, error } = await service.from('ai_voice_audio_recordings').update({
        support_hold_state: 'active',
        support_case_reference: caseDetails.caseReference,
        support_case_reason: caseDetails.caseReason,
        support_authorized_at: timestamp,
        support_authorized_by: user.id,
        support_case_closed_at: null,
        post_case_delete_at: null,
        updated_at: timestamp,
      }).eq('id', record.id)
        .eq('user_id', user.id)
        .eq('upload_status', 'ready')
        .is('deleted_at', null)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new OperationError('This recording changed or expired before the support hold was saved.', 409, 'recording_changed');
      await completeAudit(service, auditId);
      return json({ success: true, recording: safeVoiceAudioRecording(data) });
    }

    if (action === 'owner_close_hold') {
      const record = await ownedRecording(service, user.id, body.recordingId);
      if (record.support_hold_state !== 'active') {
        return json({ success: true, recording: safeVoiceAudioRecording(record), alreadyClosed: true });
      }
      auditId = await startAudit(service, {
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: user.id,
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'owner',
        action: 'hold_closed_owner',
        case_reference: record.support_case_reference,
        reason: 'Account owner ended the authorized support hold',
      });
      const closedAt = new Date();
      const deleteAt = new Date(closedAt.getTime() + VOICE_AUDIO_POST_CASE_RETENTION_DAYS * 86400000);
      const { data, error } = await service.from('ai_voice_audio_recordings').update({
        support_hold_state: 'closed',
        support_case_closed_at: closedAt.toISOString(),
        post_case_delete_at: deleteAt.toISOString(),
        updated_at: closedAt.toISOString(),
      }).eq('id', record.id)
        .eq('user_id', user.id)
        .eq('upload_status', 'ready')
        .eq('support_hold_state', 'active')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new OperationError('The support hold changed before it could be closed.', 409, 'recording_changed');
      await completeAudit(service, auditId);
      return json({ success: true, recording: safeVoiceAudioRecording(data) });
    }

    if (action === 'support_list') {
      if (!isAdminEmail(user.email)) throw new OperationError('Administrator access required.', 403, 'admin_required');
      const accountEmail = requiredAccountEmail(body.accountEmail);
      const caseDetails = requiredCase(body.caseReference, body.caseReason);
      const transcriptIds = normalizeTranscriptIds(body.transcriptIds);
      auditId = await startAudit(service, {
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'support',
        action: 'support_list',
        case_reference: caseDetails.caseReference,
        reason: caseDetails.caseReason,
      });
      if (!transcriptIds.length) {
        await completeAudit(service, auditId);
        return json({ success: true, recordings: [] });
      }
      const { data: transcripts, error: transcriptError } = await service
        .from('ai_voice_transcripts')
        .select('id,user_id')
        .eq('account_email', accountEmail)
        .in('id', transcriptIds);
      if (transcriptError) throw transcriptError;
      const verifiedIds = (transcripts || []).map((row: any) => row.id);
      const ownerIds = [...new Set((transcripts || []).map((row: any) => row.user_id).filter(Boolean))];
      if (!verifiedIds.length) {
        await completeAudit(service, auditId);
        return json({ success: true, recordings: [] });
      }
      const { data, error } = await service
        .from('ai_voice_audio_recordings')
        .select('*')
        .in('transcript_id', verifiedIds)
        .eq('upload_status', 'ready')
        .eq('support_hold_state', 'active')
        .eq('support_case_reference', caseDetails.caseReference)
        .is('deleted_at', null);
      if (error) throw error;
      const authorized = (data || []).filter((record: any) => !isVoiceAudioExpired(record));
      await service.from('ai_voice_audio_access_audit').update({ owner_user_id: ownerIds.length === 1 ? ownerIds[0] : null }).eq('id', auditId);
      await completeAudit(service, auditId);
      return json({ success: true, recordings: authorized.map(safeVoiceAudioRecording) });
    }

    if (action === 'support_playback' || action === 'support_close_case') {
      if (!isAdminEmail(user.email)) throw new OperationError('Administrator access required.', 403, 'admin_required');
      const accountEmail = requiredAccountEmail(body.accountEmail);
      const caseDetails = requiredCase(body.caseReference, body.caseReason);
      const recordingId = requiredUuid(body.recordingId);
      const auditAction = action === 'support_playback' ? 'support_playback' : 'hold_closed_support';
      auditId = await startAudit(service, {
        actor_user_id: user.id,
        actor_email: actorEmail,
        actor_role: 'support',
        action: auditAction,
        case_reference: caseDetails.caseReference,
        reason: caseDetails.caseReason,
      });
      const { data: record, error } = await service
        .from('ai_voice_audio_recordings')
        .select('*')
        .eq('id', recordingId)
        .maybeSingle();
      if (error) throw error;
      if (!record || !record.transcript_id) throw new OperationError('Authorized recording not found.', 404, 'recording_not_found');
      const { data: transcript, error: transcriptError } = await service
        .from('ai_voice_transcripts')
        .select('id,user_id')
        .eq('id', record.transcript_id)
        .eq('user_id', record.user_id)
        .eq('account_email', accountEmail)
        .maybeSingle();
      if (transcriptError) throw transcriptError;
      if (!transcript) throw new OperationError('Authorized recording not found.', 404, 'recording_not_found');
      await service.from('ai_voice_audio_access_audit').update({
        recording_id: record.id,
        transcript_id: record.transcript_id,
        owner_user_id: record.user_id,
      }).eq('id', auditId);
      if (record.support_hold_state !== 'active' || record.support_case_reference !== caseDetails.caseReference) {
        await failAudit(service, auditId, 'denied', 'support_authorization_mismatch');
        throw new OperationError('The customer has not authorized this recording for that active support case.', 403, 'support_authorization_mismatch');
      }
      requirePlaybackReady(record);

      if (action === 'support_close_case') {
        const closedAt = new Date();
        const deleteAt = new Date(closedAt.getTime() + VOICE_AUDIO_POST_CASE_RETENTION_DAYS * 86400000);
        const { data, error: closeError } = await service.from('ai_voice_audio_recordings').update({
          support_hold_state: 'closed',
          support_case_closed_at: closedAt.toISOString(),
          post_case_delete_at: deleteAt.toISOString(),
          updated_at: closedAt.toISOString(),
        }).eq('id', record.id)
          .eq('upload_status', 'ready')
          .eq('support_hold_state', 'active')
          .eq('support_case_reference', caseDetails.caseReference)
          .is('deleted_at', null)
          .select('*')
          .maybeSingle();
        if (closeError) throw closeError;
        if (!data) throw new OperationError('The support hold changed before it could be closed.', 409, 'recording_changed');
        await completeAudit(service, auditId);
        return json({ success: true, recording: safeVoiceAudioRecording(data) });
      }

      const { data: signed, error: signedError } = await service.storage
        .from(VOICE_AUDIO_BUCKET)
        .createSignedUrl(record.object_path, VOICE_AUDIO_SIGNED_URL_SECONDS);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('Playback URL was not created');
      const now = new Date();
      const signedExpiry = new Date(now.getTime() + VOICE_AUDIO_SIGNED_URL_SECONDS * 1000).toISOString();
      await service.from('ai_voice_audio_recordings').update({ last_accessed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', record.id);
      await completeAudit(service, auditId, { signed_url_expires_at: signedExpiry });
      return json({ success: true, signedUrl: signed.signedUrl, expiresAt: signedExpiry });
    }

    throw new OperationError('Unknown action.', 400, 'unknown_action');
  } catch (error) {
    const operation = error instanceof OperationError ? error : null;
    const code = operation?.code || 'voice_audio_request_failed';
    if (service && auditId) await failAudit(service, auditId, operation?.status === 403 || operation?.status === 409 ? 'denied' : 'failed', code);
    return json({
      error: operation?.message || 'Voice audio request failed.',
      code,
      ...(operation?.details || {}),
    }, operation?.status || 500);
  }
});
