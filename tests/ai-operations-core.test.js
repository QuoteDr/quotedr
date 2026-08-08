const assert = require('assert');
const core = require('../ai-operations-core.js');

assert.strictEqual(core.containsLiveFixClaim('The fix is live now.'), true, 'positive live-fix claims should be detected');
assert.strictEqual(core.containsLiveFixClaim('We have deployed the fix.'), true, 'deployed claims should be detected');
assert.strictEqual(core.containsLiveFixClaim('We fixed it.'), true, 'plain fixed claims should be detected');
assert.strictEqual(core.containsLiveFixClaim('The update is available.'), true, 'available-update claims should be detected');
assert.strictEqual(core.containsLiveFixClaim('I will follow up only after verification and release are complete.'), false, 'safe future-gate copy should not look live');
assert.strictEqual(core.containsReleaseDatePromise('This will be fixed by Friday.'), true, 'release-date promises should be blocked');
assert.strictEqual(core.containsReleaseDatePromise("I don't have a release date to promise."), false, 'explicit no-promise copy should remain safe');

const workaroundDraft = core.buildImmediateResponseDraft({
  customerName: 'Amanda Chen',
  safeWorkaround: 'Export a full backup and pause cleanup.'
});
assert(workaroundDraft.startsWith('Hi Amanda,'), 'safe draft should use the customer first name');
assert(workaroundDraft.includes('safest workaround'), 'safe draft should surface the current workaround');
assert(workaroundDraft.includes("don’t have a release date to promise"), 'safe draft should avoid an ETA promise');
assert.strictEqual(core.containsLiveFixClaim(workaroundDraft), false, 'immediate draft must not claim a live fix');

const preservationDraft = core.buildImmediateResponseDraft({ customerName: 'Maya', safeWorkaround: '' });
assert(preservationDraft.includes('pause any retries or edits'), 'no-workaround draft should prioritize preserving data');
assert(preservationDraft.includes('owner review'), 'no-workaround draft should route for owner review');

const coordinatorBrief = core.buildCoordinatorBrief({
  supportCase: {
    caseNumber: 1042,
    customerEmail: 'private@example.test',
    subject: 'Cross-device save conflict',
    summary: 'Two devices show different quote edits.',
    topicKey: 'dashboard_sync',
    improvementType: 'bug',
    riskLevel: 'critical',
    sensitiveFlags: ['data_loss', 'cross_device'],
    safeWorkaround: '',
    immediateResponseStatus: 'ready_for_human_review',
    immediateResponseDraft: preservationDraft,
    possibleSolution: 'Add a guided dual-backup reconcile flow.'
  },
  workItem: { proposedSolution: 'Add a guided dual-backup reconcile flow.' },
  productImpact: 'A contractor can be unsure which quote version contains the latest work.',
  evidenceNotes: 'Preserve both backups and compare their timestamps before reproducing.',
  requestedEngineeringOutcome: 'Build and verify a guided reconciliation flow.'
});
['## Case summary', '## Classification', '## Current customer-safe response', '## Product impact', '## Proposed solution', '## Evidence, links, or notes', '## Requested engineering outcome', '## Safety and approval boundaries'].forEach(section => {
  assert(coordinatorBrief.includes(section), `coordinator brief should include ${section}`);
});
assert(coordinatorBrief.includes('Data loss, Cross-device conflict'), 'coordinator brief should include escalation flags');
assert(coordinatorBrief.includes('No live coordinator integration or agent launch'), 'coordinator brief should disclose the manual handoff boundary');
assert(coordinatorBrief.includes('Do not push, merge, or deploy'), 'coordinator brief should preserve owner release control');
assert(!coordinatorBrief.includes('private@example.test'), 'coordinator brief should omit customer email');
assert(coordinatorBrief.includes('## Advisory confidence and rationale'), 'coordinator brief should include advisory confidence and rationale');
assert(coordinatorBrief.includes('confidence never bypasses the sensitive-case review gate'), 'sensitive confidence should preserve human review first');

const sensitiveAssessmentOverview = {
  cases: [{ id: 'sensitive-1', subject: 'Save conflict', summary: 'Two device copies differ.', topicKey: 'dashboard_sync', improvementType: 'bug', riskLevel: 'critical', sensitiveFlags: ['data_loss', 'cross_device'], isLikelyBug: true, possibleSolution: 'Compare two protected backups.', safeWorkaround: '' }],
  workItems: [{ id: 'work-sensitive-1', caseId: 'sensitive-1', status: 'queued', proposedSolution: 'Compare two protected backups.' }],
  deployApprovals: [], followups: [], goodwillRecommendations: [], coordinatorInbox: []
};
const sensitiveAssessment = core.assessSupportCase({ supportCase: sensitiveAssessmentOverview.cases[0], overview: sensitiveAssessmentOverview });
assert.strictEqual(sensitiveAssessment.classification.confidence, 'high', 'classification confidence should be an evidence band');
assert.strictEqual(sensitiveAssessment.humanReviewFirst, true, 'sensitive cases should stay human-review-first regardless of confidence');
assert.strictEqual(sensitiveAssessment.recommendation.key, 'request_safe_evidence', 'no-workaround cases should prioritize safe evidence and data preservation');
assert(sensitiveAssessment.policyGates.some(item => item.includes('never permission')), 'confidence should never authorize an automatic action');
assert(sensitiveAssessment.recommendation.ownerApprovalsStillRequired.some(item => item.includes('Human review first')), 'sensitive recommendation should expose the remaining human gate');

const documentationCase = { id: 'docs-1', subject: 'Help text unclear', summary: 'Secure-link steps were confusing.', topicKey: 'quotes_approvals', improvementType: 'documentation', riskLevel: 'low', sensitiveFlags: [], isLikelyBug: false, safeWorkaround: 'Use the secure-link action.', firstResponseAt: '2026-08-08T12:00:00.000Z' };
const documentationAssessment = core.assessSupportCase({ supportCase: documentationCase, overview: { cases: [documentationCase], workItems: [], deployApprovals: [], followups: [], goodwillRecommendations: [], coordinatorInbox: [] } });
assert.strictEqual(documentationAssessment.recommendation.key, 'close_documentation_ux', 'answered documentation cases should close as product-learning improvements');

const privacyRecord = core.buildCoordinatorBriefData({
  supportCase: {
    id: 'privacy-1', caseNumber: 1050, customerName: 'Amanda Chen', customerEmail: 'amanda@example.test',
    subject: 'Amanda Chen shared amanda@example.test', summary: 'Open https://example.test/view?token=secret-token-value and inspect the report.',
    topicKey: 'dashboard_sync', improvementType: 'bug', riskLevel: 'low', sensitiveFlags: [], isLikelyBug: true,
    possibleSolution: 'Mask secure values.', safeWorkaround: 'Pause changes.', immediateResponseStatus: 'sent',
    immediateResponseDraft: 'Hi Amanda, use Bearer abcdefghijklmnopqrstuvwxyz only in the secure tool.', firstResponseAt: '2026-08-08T12:00:00.000Z'
  },
  workItem: { id: 'privacy-work-1', caseId: 'privacy-1', status: 'queued', proposedSolution: 'Mask secure values.' },
  overview: { cases: [], workItems: [], deployApprovals: [], followups: [], goodwillRecommendations: [], coordinatorInbox: [] },
  productImpact: 'Email amanda@example.test cannot be part of engineering storage.',
  evidenceNotes: 'Secure evidence: https://example.test/view?signature=abc123',
  requestedEngineeringOutcome: 'Add safe redaction.'
});
['amanda@example.test', 'Amanda Chen', 'secret-token-value', 'abcdefghijklmnopqrstuv'].forEach(privateValue => {
  assert(!privacyRecord.brief.includes(privateValue), `privacy-minimized brief should omit ${privateValue}`);
});
assert(privacyRecord.brief.includes('[redacted secure link]'), 'secure links should be visibly redacted');
assert.strictEqual(privacyRecord.payload.privacy.customer_email_included, false, 'structured payload should declare customer email omission');
assert.strictEqual(privacyRecord.payload.privacy.secure_links_or_tokens_included, false, 'structured payload should declare secure-value omission');
assert.strictEqual(privacyRecord.payload.coordinator_inbox.owner_confirmed, true, 'structured payload should require owner-confirmed inbox submission');

const overview = core.createDemoOverview('2026-08-08T16:00:00.000Z');
const queues = core.deriveQueues(overview);
assert.strictEqual(queues.incoming.length, 1, 'demo should have one case awaiting a first response');
assert.strictEqual(queues.engineering.length, 3, 'demo should have three active engineering items');
assert.strictEqual(queues.deployApproval.length, 1, 'deployed releases should leave the deploy queue');
assert.strictEqual(queues.followup.length, 5, 'waiting and owner-review follow-ups should remain queued');

const metrics = core.calculateMetrics(overview);
assert.strictEqual(metrics.openCases, 5, 'closed cases should not count as open');
assert(Math.abs(metrics.averageFirstResponseMinutes - 19.8) < 0.001, 'first-response metric should use recorded response timestamps');
assert.strictEqual(metrics.averageBugToDeployHours, 172, 'bug-to-deploy metric should require a recorded deployed release');
assert.strictEqual(metrics.commonTopics[0].topicKey, 'dashboard_sync', 'common topics should rank by case count');
assert.strictEqual(overview.workItems[0].coordinatorHandoffStatus, 'not_sent', 'demo should expose an engineering case ready for handoff testing');
assert.strictEqual(overview.workItems[1].coordinatorHandoffStatus, 'handed_off', 'demo should show a completed coordinator handoff state');
assert(overview.workItems[1].coordinatorBrief.includes('QuickBooks import duplicated saved items'), 'demo handoff should retain its structured brief');
assert.strictEqual(overview.coordinatorInbox.length, 1, 'demo should include a durable internal coordinator request');
assert.strictEqual(overview.coordinatorInbox[0].state, 'queued', 'demo coordinator request should be safely queued without external delivery');
assert.strictEqual(overview.coordinatorInbox[0].ownerConfirmed, true, 'demo queue should show owner confirmation');
assert.strictEqual(overview.coordinatorInbox[0].taskPayload.schema_version, 2, 'demo queue should retain the versioned privacy-minimized structured payload');
assert.strictEqual(overview.cases[1].advisoryAssessment.recommendation.key, 'wait_for_trusted_coordinator', 'queued demo cases should recommend waiting for the trusted coordinator');
assert.strictEqual(core.caseReference({ caseNumber: 42 }), 'QD-AI-0042');
assert.strictEqual(core.formatDurationMinutes(90), '1.5h');

console.log('ai operations core tests passed');
