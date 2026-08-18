export const PAYMENT_EVIDENCE_BUCKET = 'document-payment-evidence';
export const PAYMENT_EVIDENCE_NOTICE_VERSION = '2026-08-18-payment-evidence-v1';
export const PAYMENT_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
export const PAYMENT_EVIDENCE_SIGNED_URL_SECONDS = 60;
export const PAYMENT_EVIDENCE_ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

export function paymentEvidenceMimeType(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  if (!PAYMENT_EVIDENCE_ALLOWED_MIME_TYPES.includes(mime)) {
    throw new Error('Choose a JPG, PNG, or PDF file.');
  }
  return mime;
}

export function paymentEvidenceByteSize(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size) || size < 1 || size > PAYMENT_EVIDENCE_MAX_BYTES) {
    throw new Error('Payment proof must be 8 MB or smaller.');
  }
  return size;
}

export function paymentEvidenceExtension(value) {
  const mime = paymentEvidenceMimeType(value);
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'pdf';
}

export function paymentEvidenceContentMatches(value, mimeType) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  const mime = paymentEvidenceMimeType(mimeType);
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function paymentEvidenceFilename(value) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'payment-proof';
}

export function safePaymentEvidence(record) {
  if (!record) return null;
  return {
    id: record.id,
    paymentRecordId: record.payment_record_id,
    documentId: record.invoice_id || record.quote_id,
    fileName: record.original_filename,
    mimeType: record.mime_type,
    byteSize: Number(record.byte_size) || 0,
    uploadedBy: record.uploaded_by_role,
    portalVisible: record.portal_visible === true,
    createdAt: record.finalized_at || record.created_at,
  };
}
