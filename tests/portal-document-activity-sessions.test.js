const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('client-portal.html', 'utf8');
const helperStart = source.indexOf('function portalActivityEventLabel');
const helperEnd = source.indexOf('async function loadPortalDocumentActivity', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'portal activity helpers should be extractable');

const context = { console, Date, Map };
vm.createContext(context);
vm.runInContext(source.slice(helperStart, helperEnd), context);

const events = [
  { id: 'a5', session_id: 'same-tab', event_type: 'document_view_duration', duration_seconds: 22, created_at: '2026-07-16T11:41:52Z' },
  { id: 'a4', session_id: 'same-tab', event_type: 'document_view_duration', duration_seconds: 30, created_at: '2026-07-16T11:41:30Z' },
  { id: 'a3', session_id: 'same-tab', event_type: 'document_view_duration', duration_seconds: 30, created_at: '2026-07-16T11:41:00Z' },
  { id: 'a2', session_id: 'same-tab', event_type: 'document_view_duration', duration_seconds: 30, created_at: '2026-07-16T11:40:30Z' },
  { id: 'a1', session_id: 'same-tab', event_type: 'document_opened', created_at: '2026-07-16T11:40:00Z' },
  { id: 'pdf', session_id: 'same-tab', event_type: 'pdf_opened', created_at: '2026-07-16T11:32:00Z' },
  { id: 'b2', session_id: 'same-tab', event_type: 'document_view_duration', duration_seconds: 10, created_at: '2026-07-16T11:31:10Z' },
  { id: 'b1', session_id: 'same-tab', event_type: 'document_opened', created_at: '2026-07-16T11:31:00Z' }
];

const timeline = context.portalDocumentActivityTimeline(events);
const views = timeline.filter((event) => event.event_type === 'document_view_duration');
assert.strictEqual(views.length, 2, 'two opens in the same tab should remain two viewing sessions');
assert.strictEqual(views[0].duration_seconds, 112, 'four heartbeat chunks should combine into the latest visit');
assert.strictEqual(views[0].created_at, '2026-07-16T11:40:00Z', 'a visit should use its opening time');
assert.strictEqual(views[1].duration_seconds, 10, 'the earlier visit should retain its own duration');
assert.strictEqual(timeline.filter((event) => event.event_type === 'pdf_opened').length, 1, 'non-view activity should remain in the timeline');
assert.strictEqual(context.portalDocumentActivitySummary(events).totalSeconds, 122, 'the overall active total should remain unchanged');
assert.strictEqual(context.portalDocumentActivitySummary(events).opens, 2, 'the open count should remain unchanged');

const partialHistory = context.portalDocumentActivityTimeline([
  { id: 'old2', session_id: 'older-session', event_type: 'document_view_duration', duration_seconds: 30, created_at: '2026-07-16T10:01:00Z' },
  { id: 'old1', session_id: 'older-session', event_type: 'document_view_duration', duration_seconds: 30, created_at: '2026-07-16T10:00:30Z' }
]);
assert.strictEqual(partialHistory.length, 1, 'duration rows should still combine when the opening event is outside loaded history');
assert.strictEqual(partialHistory[0].duration_seconds, 60, 'partial history should show the combined known duration');

const openedOnly = context.portalDocumentActivityTimeline([
  { id: 'brief', session_id: 'brief-session', event_type: 'document_opened', created_at: '2026-07-16T09:00:00Z' }
]);
assert.strictEqual(openedOnly[0].event_type, 'document_opened', 'an opening with no measured seconds should remain an opened event');

const sameTimestamp = context.portalDocumentActivityTimeline([
  { id: 'instant-duration', session_id: 'instant-session', event_type: 'document_view_duration', duration_seconds: 3, created_at: '2026-07-16T09:00:00Z' },
  { id: 'instant-open', session_id: 'instant-session', event_type: 'document_opened', created_at: '2026-07-16T09:00:00Z' }
]);
assert.strictEqual(sameTimestamp.length, 1, 'an opening and heartbeat with the same timestamp should form one visit');
assert.strictEqual(sameTimestamp[0].duration_seconds, 3, 'the same-timestamp heartbeat should be counted');

console.log('portal document activity session tests passed');
