export const VOICE_AUDIO_NOTICE_VERSION = '2026-08-09-audio-v1';
export const VOICE_AUDIO_BUCKET = 'ai-voice-audio-evidence';
export const VOICE_AUDIO_RETENTION_DAYS = 14;
export const VOICE_AUDIO_POST_CASE_RETENTION_DAYS = 30;
export const VOICE_AUDIO_MAX_DURATION_MS = 5 * 60 * 1000;
export const VOICE_AUDIO_MAX_BYTES = 6 * 1024 * 1024;
export const VOICE_AUDIO_ACCOUNT_CAP_BYTES = 100 * 1024 * 1024;
export const VOICE_AUDIO_UPLOAD_WINDOW_MINUTES = 120;
export const VOICE_AUDIO_SIGNED_URL_SECONDS = 60;
export const VOICE_AUDIO_ALLOWED_MIME_TYPES = Object.freeze([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
]);

export function voiceAudioBaseMimeType(value) {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

export function normalizeVoiceAudioMimeType(value) {
  const raw = String(value ?? '').trim().toLowerCase().slice(0, 120);
  const base = voiceAudioBaseMimeType(raw);
  if (!VOICE_AUDIO_ALLOWED_MIME_TYPES.includes(base)) {
    throw new Error('Unsupported audio recording format');
  }
  return raw;
}

export function voiceAudioExtension(value) {
  const base = voiceAudioBaseMimeType(value);
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4') return 'm4a';
  if (base === 'audio/aac') return 'aac';
  throw new Error('Unsupported audio recording format');
}

export function normalizeVoiceAudioDurationMs(value) {
  const duration = Math.round(Number(value));
  if (!Number.isFinite(duration) || duration < 250 || duration > VOICE_AUDIO_MAX_DURATION_MS) {
    throw new Error(`Audio duration must be between 0.25 seconds and ${VOICE_AUDIO_MAX_DURATION_MS / 60000} minutes`);
  }
  return duration;
}

export function normalizeVoiceAudioByteSize(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size) || size < 1 || size > VOICE_AUDIO_MAX_BYTES) {
    throw new Error(`Audio recording must be smaller than ${Math.round(VOICE_AUDIO_MAX_BYTES / 1024 / 1024)} MB`);
  }
  return size;
}

export function normalizeVoiceAudioUuid(value, label = 'Audio recording id') {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} is required`);
  }
  return id.toLowerCase();
}

export function normalizeVoiceAudioCase(caseReference, caseReason) {
  const reference = String(caseReference ?? '').trim().slice(0, 120);
  const reason = String(caseReason ?? '').trim().slice(0, 500);
  if (reference.length < 5) throw new Error('Enter the support case id or reference');
  if (reason.length < 10) throw new Error('Explain the support investigation reason');
  return { caseReference: reference, caseReason: reason };
}

export function normalizeVoiceAudioAccountEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid account email is required');
  }
  return email;
}

export function voiceAudioObjectPath(userId, transcriptId, recordingId, mimeType) {
  const owner = normalizeVoiceAudioUuid(userId, 'Owner id');
  const transcript = normalizeVoiceAudioUuid(transcriptId, 'Transcript id');
  const recording = normalizeVoiceAudioUuid(recordingId, 'Audio recording id');
  return `${owner}/${transcript}/${recording}.${voiceAudioExtension(mimeType)}`;
}

export function voiceAudioEffectiveExpiry(record) {
  if (!record || record.deleted_at) return record?.deleted_at || null;
  if (record.support_hold_state === 'active') return null;
  if (record.support_hold_state === 'closed') return record.post_case_delete_at || record.expires_at || null;
  return record.expires_at || null;
}

export function isVoiceAudioExpired(record, nowValue = new Date()) {
  if (!record || record.deleted_at) return true;
  if (record.upload_status === 'upload_pending') {
    const deadline = new Date(record.upload_deadline || 0);
    return Number.isFinite(deadline.getTime()) && deadline <= new Date(nowValue);
  }
  if (record.support_hold_state === 'active') return false;
  const expiry = new Date(voiceAudioEffectiveExpiry(record) || 0);
  return Number.isFinite(expiry.getTime()) && expiry <= new Date(nowValue);
}

export function voiceAudioCountsTowardQuota(record, nowValue = new Date()) {
  if (!record || record.deleted_at || !['upload_pending', 'ready'].includes(record.upload_status)) return false;
  return !isVoiceAudioExpired(record, nowValue);
}

export function voiceAudioUsageBytes(records, nowValue = new Date()) {
  return (records || []).reduce((total, record) => {
    if (!voiceAudioCountsTowardQuota(record, nowValue)) return total;
    const bytes = Math.max(0, Math.round(Number(record.byte_size) || 0));
    return total + bytes;
  }, 0);
}

export function voiceAudioQuotaSummary(usedBytes) {
  const used = Math.max(0, Math.round(Number(usedBytes) || 0));
  return {
    usedBytes: used,
    capBytes: VOICE_AUDIO_ACCOUNT_CAP_BYTES,
    remainingBytes: Math.max(0, VOICE_AUDIO_ACCOUNT_CAP_BYTES - used),
    nearLimit: VOICE_AUDIO_ACCOUNT_CAP_BYTES - used < VOICE_AUDIO_MAX_BYTES,
  };
}

export function safeVoiceAudioRecording(record) {
  if (!record) return null;
  const effectiveExpiry = voiceAudioEffectiveExpiry(record);
  return {
    id: record.id,
    transcriptId: record.transcript_id,
    mimeType: record.mime_type,
    durationMs: Number(record.duration_ms) || 0,
    byteSize: Number(record.byte_size) || 0,
    uploadStatus: record.upload_status,
    createdAt: record.created_at,
    finalizedAt: record.finalized_at || null,
    expiresAt: record.expires_at,
    effectiveExpiresAt: effectiveExpiry,
    supportHoldState: record.support_hold_state || 'none',
    supportCaseReference: record.support_case_reference || '',
    supportCaseReason: record.support_case_reason || '',
    supportAuthorizedAt: record.support_authorized_at || null,
    supportCaseClosedAt: record.support_case_closed_at || null,
    postCaseDeleteAt: record.post_case_delete_at || null,
    deletedAt: record.deleted_at || null,
    deletionReason: record.deletion_reason || '',
    canDelete: !record.deleted_at && record.support_hold_state !== 'active',
    playbackAvailable: record.upload_status === 'ready' && !record.deleted_at && !isVoiceAudioExpired(record),
  };
}
