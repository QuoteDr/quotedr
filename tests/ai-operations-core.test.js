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
assert.strictEqual(core.caseReference({ caseNumber: 42 }), 'QD-AI-0042');
assert.strictEqual(core.formatDurationMinutes(90), '1.5h');

console.log('ai operations core tests passed');
