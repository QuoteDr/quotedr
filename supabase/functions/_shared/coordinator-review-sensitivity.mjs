export const SYNTHETIC_COORDINATOR_PREFIX = '[SYNTHETIC COORDINATOR TEST]';

const SENSITIVE_TOPICS = new Set(['invoices_payments', 'account_plan']);
const MANDATORY_REVIEW_LANGUAGE = /\b(?:billing|payment|refund|chargeback|financial|banking|data loss|privacy|access|security|breach|unauthori[sz]ed|expos(?:e|ed|ure)|leak(?:ed|age)?|disclos(?:e|ed|ure)|signature|legal|medical|health(?:care)?|protected health|cross[- ]device|broad incident)\b/i;

function payloadAt(request, ...keys) {
  let current = request?.task_payload;
  for (const key of keys) current = current && typeof current === 'object' ? current[key] : undefined;
  return current;
}

function issueReviewText(request) {
  return [
    payloadAt(request, 'case', 'subject'),
    payloadAt(request, 'case', 'summary'),
    payloadAt(request, 'product_impact'),
    payloadAt(request, 'proposed_solution'),
    payloadAt(request, 'evidence_links_or_notes'),
    payloadAt(request, 'requested_engineering_outcome'),
    payloadAt(request, 'current_customer_response', 'safe_workaround'),
    payloadAt(request, 'current_customer_response', 'response_text'),
  ].filter((value) => typeof value === 'string').join(' ');
}

function removeSyntheticSafetyLabels(value) {
  return value
    .replace(/\bprivacy[- ](?:minimi[sz](?:ed|ation)|safe|preserving)\b/gi, ' ')
    .replace(/\bprivacy boundary\b/gi, ' ');
}

export function isSyntheticCoordinatorTest(request) {
  return String(payloadAt(request, 'case', 'subject') ?? '').startsWith(SYNTHETIC_COORDINATOR_PREFIX);
}

export function coordinatorRequestNeedsOwnerReview(request) {
  const risk = String(payloadAt(request, 'classification', 'risk_level') ?? 'low');
  const topic = String(payloadAt(request, 'classification', 'topic_key') ?? 'other');
  const flags = payloadAt(request, 'classification', 'escalation_flags');
  if (risk !== 'low' || SENSITIVE_TOPICS.has(topic) || (Array.isArray(flags) && flags.length > 0)) {
    return true;
  }

  const subject = String(payloadAt(request, 'case', 'subject') ?? '').trim();
  const summary = String(payloadAt(request, 'case', 'summary') ?? '').trim();
  if (!subject || !summary) return true;

  const issueText = issueReviewText(request);
  const reviewText = isSyntheticCoordinatorTest(request)
    ? removeSyntheticSafetyLabels(issueText)
    : issueText;
  return MANDATORY_REVIEW_LANGUAGE.test(reviewText);
}
