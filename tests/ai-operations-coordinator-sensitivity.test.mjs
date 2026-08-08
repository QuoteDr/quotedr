import assert from 'node:assert/strict';
import {
  coordinatorRequestNeedsOwnerReview,
  isSyntheticCoordinatorTest,
} from '../supabase/functions/_shared/coordinator-review-sensitivity.mjs';

function request(overrides = {}) {
  const base = {
    task_brief: 'Safety boilerplate: preserve privacy, security, financial, legal, and medical review boundaries.',
    task_payload: {
      case: {
        subject: '[SYNTHETIC COORDINATOR TEST] No-email receiver lifecycle',
        summary: 'Synthetic privacy-minimized receiver lifecycle test with no customer or user content.',
      },
      classification: {
        risk_level: 'low',
        topic_key: 'support_feedback',
        escalation_flags: [],
      },
      product_impact: 'No product impact.',
      proposed_solution: 'Verify the receiver lifecycle with synthetic data only.',
      evidence_links_or_notes: 'Synthetic evidence only.',
      requested_engineering_outcome: 'Record and safely close the dry run.',
      current_customer_response: {
        safe_workaround: 'No workaround is needed.',
        response_text: 'No customer response exists.',
      },
    },
  };
  return {
    ...base,
    ...overrides,
    task_payload: {
      ...base.task_payload,
      ...(overrides.task_payload || {}),
      case: { ...base.task_payload.case, ...(overrides.task_payload?.case || {}) },
      classification: {
        ...base.task_payload.classification,
        ...(overrides.task_payload?.classification || {}),
      },
    },
  };
}

const benignSynthetic = request();
assert.equal(isSyntheticCoordinatorTest(benignSynthetic), true);
assert.equal(
  coordinatorRequestNeedsOwnerReview(benignSynthetic),
  false,
  'synthetic privacy-minimized wording and safety boilerplate must not create a false positive',
);

for (const issue of [
  'A real privacy breach exposed records.',
  'A privacy-minimized export still exposed records.',
  'A security issue allows unauthorized access.',
  'A financial refund error changed a balance.',
  'A legal signature problem affects the agreement.',
  'Medical and protected health information may be visible.',
  'A cross-device conflict caused data loss.',
]) {
  assert.equal(
    coordinatorRequestNeedsOwnerReview(request({ task_payload: { case: { summary: issue } } })),
    true,
    `true sensitive issue must remain owner-reviewed: ${issue}`,
  );
}

assert.equal(coordinatorRequestNeedsOwnerReview(request({
  task_payload: { classification: { risk_level: 'sensitive' } },
})), true, 'explicit sensitive risk must remain protected');

assert.equal(coordinatorRequestNeedsOwnerReview(request({
  task_payload: { classification: { escalation_flags: ['privacy'] } },
})), true, 'explicit escalation flags must remain protected');

assert.equal(coordinatorRequestNeedsOwnerReview(request({
  task_payload: { classification: { topic_key: 'invoices_payments' } },
})), true, 'sensitive topics must remain protected');

assert.equal(coordinatorRequestNeedsOwnerReview(request({
  task_payload: { case: { subject: '', summary: '' } },
})), true, 'incomplete briefs must fail closed');

assert.equal(coordinatorRequestNeedsOwnerReview(request({
  task_payload: { product_impact: 'A real security breach is under investigation.' },
})), true, 'sensitive product impact must remain protected');

const realCase = request({
  task_payload: { case: { subject: 'Privacy-minimized export issue' } },
});
realCase.task_payload.case.subject = 'Privacy-minimized export issue';
assert.equal(isSyntheticCoordinatorTest(realCase), false);
assert.equal(
  coordinatorRequestNeedsOwnerReview(realCase),
  true,
  'privacy wording in a real case must remain owner-reviewed',
);

console.log('AI Operations coordinator sensitivity boundary tests passed.');
