export const VOICE_TRANSCRIPT_NOTICE_VERSION = '2026-08-07';
export const MAX_VOICE_TRANSCRIPT_CHARS = 12000;
export const VOICE_TRANSCRIPT_SUPPORT_PAGE_SIZE = 50;

const STATUS_VALUES = new Set([
  'parsing',
  'review_ready',
  'added_to_quote',
  'parse_failed',
]);

const AUDIT_STATUS_VALUES = new Set([
  'pending',
  'verified',
  'corrected',
  'blocked',
  'failed',
]);

export function normalizeVoiceTranscript(value) {
  const transcript = String(value ?? '').trim();
  if (!transcript) throw new Error('Voice transcript is required');
  if (transcript.length > MAX_VOICE_TRANSCRIPT_CHARS) {
    throw new Error(`Voice transcript exceeds ${MAX_VOICE_TRANSCRIPT_CHARS} characters`);
  }
  return transcript;
}

export function normalizeVoiceTranscriptEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid account email is required');
  }
  return email;
}

export function normalizeVoiceQuoteId(value) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export function normalizeVoiceQuoteNumber(value) {
  return String(value ?? '').trim().slice(0, 100);
}

export function normalizeVoiceTranscriptStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  if (!STATUS_VALUES.has(status)) throw new Error('Unsupported transcript status');
  return status;
}

export function normalizeVoiceTranscriptAuditStatus(value) {
  const status = String(value ?? 'pending').trim().toLowerCase();
  if (!AUDIT_STATUS_VALUES.has(status)) throw new Error('Unsupported transcript audit status');
  return status;
}

export function normalizeVoiceTranscriptAuditPasses(value) {
  const passes = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(3, passes));
}

export function normalizeVoiceTranscriptSupportRequest(accountEmail, caseReference) {
  const email = normalizeVoiceTranscriptEmail(accountEmail);
  const reference = String(caseReference ?? '').trim().slice(0, 300);
  if (reference.length < 5) {
    throw new Error('Enter a support case number or investigation reason');
  }
  return { accountEmail: email, caseReference: reference };
}

export function normalizeVoiceTranscriptSupportOffset(value) {
  const offset = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(2147483000, offset));
}
