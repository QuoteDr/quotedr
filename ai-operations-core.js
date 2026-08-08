(function(global, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.QuoteDrAiOperationsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var TOPICS = Object.freeze({
    ai_voice_to_quote: 'AI Voice to Quote',
    choice_groups: 'Choice Groups',
    invoices_payments: 'Invoices & Payments',
    quotes_approvals: 'Quotes, Sending & Approvals',
    quote_builder: 'Quote Builder',
    saved_items_pricing: 'Saved Items & Pricing',
    client_portal: 'Client Portal',
    clients_contacts: 'Clients & Contacts',
    dashboard_sync: 'Dashboard & Sync',
    templates: 'Templates',
    ai_quote_copilot: 'AI Quote Copilot',
    smart_import: 'Smart Import',
    floor_plan_scanner: 'Floor Plan Scanner',
    quickbooks: 'QuickBooks',
    job_tracking_expenses: 'Job Tracking & Expenses',
    change_orders: 'Change Orders',
    photos_media: 'Photos & Files',
    notifications_followups: 'Notifications & Follow-ups',
    account_plan: 'Account & Plan',
    assistant_help: 'AI Assistant & Help',
    support_feedback: 'Feedback & Missing Features',
    other: 'Other'
  });

  var IMPROVEMENTS = Object.freeze({
    documentation: { label: 'Documentation improvement', shortLabel: 'Docs', tone: 'blue' },
    ux: { label: 'UX improvement', shortLabel: 'UX', tone: 'purple' },
    bug: { label: 'Bug fix', shortLabel: 'Bug', tone: 'red' },
    feature: { label: 'Feature', shortLabel: 'Feature', tone: 'green' }
  });

  var SENSITIVE_FLAGS = Object.freeze({
    billing: 'Billing',
    payments: 'Payments',
    data_loss: 'Data loss',
    privacy: 'Privacy',
    access: 'Access',
    legal_signature: 'Legal / signature',
    cross_device: 'Cross-device conflict',
    broad_incident: 'Broad incident'
  });

  function valueOf(record, camelKey, snakeKey) {
    if (!record) return undefined;
    if (Object.prototype.hasOwnProperty.call(record, camelKey)) return record[camelKey];
    return record[snakeKey || camelKey];
  }

  function safeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function firstName(value) {
    var name = safeText(value);
    return name ? name.split(/\s+/)[0] : 'there';
  }

  function containsLiveFixClaim(value) {
    var text = safeText(value).toLowerCase();
    if (!text) return false;
    return [
      /\b(?:the|this|that|your)\s+(?:fix|issue|bug|problem)\s+(?:is|has been)\s+(?:now\s+)?(?:live|fixed|resolved|deployed|released)\b/,
      /\b(?:we(?:'ve| have)|i(?:'ve| have))\s+(?:now\s+)?(?:fixed|resolved|deployed|released)\b/,
      /\b(?:we|i)\s+(?:fixed|resolved|deployed|released)\b/,
      /\b(?:the|this|that|your)\s+(?:fix|update|patch)\s+(?:is|has been)\s+(?:available|released|deployed|live)\b/,
      /\b(?:it|everything)\s+(?:is|has been)\s+(?:now\s+)?(?:fixed|resolved|live)\b/,
      /\bfix\s+is\s+live\b/,
      /\bnow\s+(?:fixed|resolved|live|deployed)\b/
    ].some(function(pattern) { return pattern.test(text); });
  }

  function containsReleaseDatePromise(value) {
    var text = safeText(value).toLowerCase();
    if (!text || /\b(?:no|don't|do not|cannot|can't)\s+(?:have|give|promise)\b.{0,35}\b(?:eta|release date)\b/.test(text)) {
      return false;
    }
    return [
      /\b(?:will|should|going to)\s+(?:be\s+)?(?:fixed|released|live|deployed)\s+(?:by|on|within)\b/,
      /\b(?:eta|release date)\s*(?:is|:)\s*\S+/,
      /\b(?:coming|shipping|launching)\s+(?:today|tomorrow|this week|next week|on\s+\w+)\b/
    ].some(function(pattern) { return pattern.test(text); });
  }

  function buildImmediateResponseDraft(input) {
    input = input || {};
    var name = firstName(input.customerName);
    var workaround = safeText(input.safeWorkaround);
    if (workaround) {
      return 'Hi ' + name + ', I’m sorry you ran into this. For now, the safest workaround is: ' +
        workaround + ' I’ve also routed this for a smoother product solution. I don’t have a release date to promise, and I’ll follow up only after verification and release are complete.';
    }
    return 'Hi ' + name + ', I’m sorry you hit this. Please pause any retries or edits to the affected record and keep the current data in place while I review it. I’m routing this for owner review now. I don’t have a release date to promise, and I’ll follow up with the safest verified next step.';
  }

  function toDate(value) {
    if (!value) return null;
    var date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function differenceMinutes(start, end) {
    var startDate = toDate(start);
    var endDate = toDate(end);
    if (!startDate || !endDate || endDate < startDate) return null;
    return (endDate.getTime() - startDate.getTime()) / 60000;
  }

  function average(values) {
    var finite = values.filter(function(value) { return Number.isFinite(value); });
    if (!finite.length) return null;
    return finite.reduce(function(total, value) { return total + value; }, 0) / finite.length;
  }

  function deriveQueues(overview) {
    overview = overview || {};
    var cases = Array.isArray(overview.cases) ? overview.cases : [];
    var workItems = Array.isArray(overview.workItems) ? overview.workItems : [];
    var approvals = Array.isArray(overview.deployApprovals) ? overview.deployApprovals : [];
    var followups = Array.isArray(overview.followups) ? overview.followups : [];
    return {
      incoming: cases.filter(function(item) {
        return !valueOf(item, 'firstResponseAt', 'first_response_at') && valueOf(item, 'workflowStage', 'workflow_stage') !== 'closed';
      }),
      engineering: workItems.filter(function(item) {
        return ['queued', 'in_progress', 'verification_pending', 'blocked'].indexOf(valueOf(item, 'status')) !== -1;
      }),
      deployApproval: approvals.filter(function(item) {
        return valueOf(item, 'status') === 'pending' || (valueOf(item, 'status') === 'approved' && !valueOf(item, 'deployedAt', 'deployed_at'));
      }),
      followup: followups.filter(function(item) {
        return ['waiting_on_release', 'draft', 'owner_review', 'approved'].indexOf(valueOf(item, 'status')) !== -1;
      })
    };
  }

  function calculateMetrics(overview) {
    overview = overview || {};
    var cases = Array.isArray(overview.cases) ? overview.cases : [];
    var workItems = Array.isArray(overview.workItems) ? overview.workItems : [];
    var approvals = Array.isArray(overview.deployApprovals) ? overview.deployApprovals : [];
    var workById = new Map();
    var caseById = new Map();
    cases.forEach(function(item) { caseById.set(valueOf(item, 'id'), item); });
    workItems.forEach(function(item) { workById.set(valueOf(item, 'id'), item); });

    var firstResponseMinutes = cases.map(function(item) {
      return differenceMinutes(valueOf(item, 'createdAt', 'created_at'), valueOf(item, 'firstResponseAt', 'first_response_at'));
    }).filter(function(value) { return value !== null; });

    var bugToDeployHours = approvals.map(function(approval) {
      var deployedAt = valueOf(approval, 'deployedAt', 'deployed_at');
      var workItem = workById.get(valueOf(approval, 'workItemId', 'work_item_id'));
      var supportCase = workItem && caseById.get(valueOf(workItem, 'caseId', 'case_id'));
      if (!deployedAt || !supportCase || !valueOf(supportCase, 'isLikelyBug', 'is_likely_bug')) return null;
      var minutes = differenceMinutes(valueOf(supportCase, 'createdAt', 'created_at'), deployedAt);
      return minutes === null ? null : minutes / 60;
    }).filter(function(value) { return value !== null; });

    var topicCounts = {};
    cases.forEach(function(item) {
      var topic = valueOf(item, 'topicKey', 'topic_key') || 'other';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
    var commonTopics = Object.keys(topicCounts).map(function(topicKey) {
      return { topicKey: topicKey, label: TOPICS[topicKey] || topicKey, count: topicCounts[topicKey] };
    }).sort(function(a, b) { return b.count - a.count || a.label.localeCompare(b.label); });

    var queues = deriveQueues(overview);
    return {
      openCases: cases.filter(function(item) { return valueOf(item, 'workflowStage', 'workflow_stage') !== 'closed'; }).length,
      averageFirstResponseMinutes: average(firstResponseMinutes),
      averageBugToDeployHours: average(bugToDeployHours),
      commonTopics: commonTopics,
      queueCounts: {
        incoming: queues.incoming.length,
        engineering: queues.engineering.length,
        deployApproval: queues.deployApproval.length,
        followup: queues.followup.length
      }
    };
  }

  function caseReference(item) {
    var number = Number(valueOf(item, 'caseNumber', 'case_number'));
    if (!Number.isFinite(number) || number <= 0) return 'QD-AI';
    return 'QD-AI-' + String(number).padStart(4, '0');
  }

  function formatDurationMinutes(value) {
    if (!Number.isFinite(value)) return '—';
    if (value < 60) return Math.round(value) + 'm';
    var hours = value / 60;
    if (hours < 24) return (hours < 10 ? hours.toFixed(1) : Math.round(hours)) + 'h';
    return (hours / 24).toFixed(1) + 'd';
  }

  function createDemoOverview(nowValue) {
    var now = toDate(nowValue) || new Date();
    function ago(hours) { return new Date(now.getTime() - hours * 3600000).toISOString(); }
    var cases = [
      { id: 'case-1', caseNumber: 1042, customerName: 'Maya', customerEmail: 'maya@example.test', subject: 'Cross-device save conflict', summary: 'Two devices show different quote edits.', topicKey: 'dashboard_sync', improvementType: 'bug', riskLevel: 'critical', sensitiveFlags: ['data_loss', 'cross_device'], workflowStage: 'intake', isLikelyBug: true, possibleSolution: 'Add a guided dual-backup reconcile flow.', safeWorkaround: '', immediateResponseStatus: 'ready_for_human_review', immediateResponseDraft: buildImmediateResponseDraft({ customerName: 'Maya' }), ownerReviewRequired: true, createdAt: ago(0.8), updatedAt: ago(0.8) },
      { id: 'case-2', caseNumber: 1041, customerName: 'Amanda', customerEmail: 'amanda@example.test', subject: 'QuickBooks import duplicated saved items', summary: 'Imported items appear twice after reconnecting.', topicKey: 'quickbooks', improvementType: 'bug', riskLevel: 'sensitive', sensitiveFlags: ['data_loss'], workflowStage: 'engineering', isLikelyBug: true, possibleSolution: 'Add import run IDs and an idempotency guard.', safeWorkaround: 'Export a full item backup and pause cleanup until the import IDs are compared.', immediateResponseStatus: 'sent', immediateResponseDraft: buildImmediateResponseDraft({ customerName: 'Amanda', safeWorkaround: 'Export a full item backup and pause cleanup until the import IDs are compared.' }), firstResponseAt: ago(3.6), createdAt: ago(4), updatedAt: ago(2) },
      { id: 'case-3', caseNumber: 1039, customerName: 'Leo', customerEmail: 'leo@example.test', subject: 'Voice review dropped an exterior-door qualifier', summary: 'Transcript retained five-foot but the parsed line item lost it.', topicKey: 'ai_voice_to_quote', improvementType: 'bug', riskLevel: 'low', sensitiveFlags: [], workflowStage: 'verification', isLikelyBug: true, possibleSolution: 'Carry distinguishing transcript tokens through matching.', safeWorkaround: 'Review What QuoteDr Heard before accepting the draft.', immediateResponseStatus: 'sent', firstResponseAt: ago(26.8), createdAt: ago(27), updatedAt: ago(4) },
      { id: 'case-4', caseNumber: 1037, customerName: 'Nina', customerEmail: 'nina@example.test', subject: 'Secure quote link instructions were unclear', summary: 'Customer copied the signed-in preview URL instead of the secure link.', topicKey: 'quotes_approvals', improvementType: 'documentation', riskLevel: 'low', sensitiveFlags: [], workflowStage: 'closed', isLikelyBug: false, possibleSolution: '', safeWorkaround: 'Generate and copy the secure quote link, then test it in a private window.', immediateResponseStatus: 'sent', firstResponseAt: ago(71.75), closedAt: ago(48), createdAt: ago(72), updatedAt: ago(48) },
      { id: 'case-5', caseNumber: 1034, customerName: 'Chris', customerEmail: 'chris@example.test', subject: 'Deposit button failed after payment setup', summary: 'Verified checkout error on an eligible invoice.', topicKey: 'invoices_payments', improvementType: 'bug', riskLevel: 'sensitive', sensitiveFlags: ['payments'], workflowStage: 'deploy_approval', isLikelyBug: true, possibleSolution: 'Handle a missing connected-account capability before creating checkout.', safeWorkaround: 'Use the existing offline payment instructions while the checkout path is reviewed.', immediateResponseStatus: 'sent', firstResponseAt: ago(119.5), createdAt: ago(120), updatedAt: ago(2) },
      { id: 'case-6', caseNumber: 1029, customerName: 'Sam', customerEmail: 'sam@example.test', subject: 'Dashboard status chip did not refresh', summary: 'Status was correct after a reload but not after returning from the viewer.', topicKey: 'dashboard_sync', improvementType: 'ux', riskLevel: 'low', sensitiveFlags: [], workflowStage: 'follow_up', isLikelyBug: true, possibleSolution: 'Refresh the summary cache after viewer navigation.', safeWorkaround: 'Reload the dashboard once after returning from the client view.', immediateResponseStatus: 'sent', firstResponseAt: ago(191.7), createdAt: ago(192), updatedAt: ago(1) }
    ];
    var workItems = [
      { id: 'work-1', caseId: 'case-1', title: 'Investigate: Cross-device save conflict', status: 'queued', automaticallyCreated: true, proposedSolution: cases[0].possibleSolution, createdAt: ago(0.8), updatedAt: ago(0.8) },
      { id: 'work-2', caseId: 'case-2', title: 'Investigate: QuickBooks import duplicated saved items', status: 'in_progress', automaticallyCreated: true, proposedSolution: cases[1].possibleSolution, startedAt: ago(2), createdAt: ago(4), updatedAt: ago(2) },
      { id: 'work-3', caseId: 'case-3', title: 'Preserve spoken qualifiers through matching', status: 'verification_pending', automaticallyCreated: true, implementationReference: 'codex/voice-qualifier-retention', createdAt: ago(27), updatedAt: ago(4) },
      { id: 'work-5', caseId: 'case-5', title: 'Guard unsupported connected-account checkout', status: 'verified', automaticallyCreated: true, verificationSummary: 'Focused checkout tests and local invoice flow passed.', verifiedAt: ago(3), createdAt: ago(120), updatedAt: ago(3) },
      { id: 'work-6', caseId: 'case-6', title: 'Refresh dashboard status after viewer navigation', status: 'verified', automaticallyCreated: true, verificationSummary: 'Navigation fixture and dashboard refresh checks passed.', verifiedAt: ago(28), createdAt: ago(192), updatedAt: ago(28) }
    ];
    var deployApprovals = [
      { id: 'deploy-5', workItemId: 'work-5', status: 'pending', requestedAt: ago(3), createdAt: ago(3), updatedAt: ago(3) },
      { id: 'deploy-6', workItemId: 'work-6', status: 'approved', requestedAt: ago(28), decisionAt: ago(24), deployedAt: ago(20), releaseReference: 'release-2026.08.07', createdAt: ago(28), updatedAt: ago(20) }
    ];
    var followups = [
      { id: 'follow-1', caseId: 'case-1', workItemId: 'work-1', status: 'waiting_on_release', claimsFixLive: false, draftBody: '', createdAt: ago(0.8), updatedAt: ago(0.8) },
      { id: 'follow-2', caseId: 'case-2', workItemId: 'work-2', status: 'waiting_on_release', claimsFixLive: false, draftBody: '', createdAt: ago(4), updatedAt: ago(2) },
      { id: 'follow-3', caseId: 'case-3', workItemId: 'work-3', status: 'waiting_on_release', claimsFixLive: false, draftBody: '', createdAt: ago(27), updatedAt: ago(4) },
      { id: 'follow-5', caseId: 'case-5', workItemId: 'work-5', status: 'waiting_on_release', claimsFixLive: false, draftBody: '', createdAt: ago(120), updatedAt: ago(3) },
      { id: 'follow-6', caseId: 'case-6', workItemId: 'work-6', status: 'owner_review', claimsFixLive: true, draftBody: 'Hi Sam, the dashboard refresh fix has been verified and released. Thank you for helping us catch it.', preparedAt: ago(19.5), createdAt: ago(192), updatedAt: ago(19.5) }
    ];
    var overview = {
      demo: true,
      generatedAt: now.toISOString(),
      cases: cases,
      workItems: workItems,
      deployApprovals: deployApprovals,
      followups: followups,
      goodwillRecommendations: [
        { id: 'credit-5', caseId: 'case-5', creditType: 'free_pro_month', status: 'recommended', recommendationReason: 'Payment interruption after setup effort.', createdAt: ago(2) }
      ],
      events: []
    };
    overview.metrics = calculateMetrics(overview);
    return overview;
  }

  return Object.freeze({
    TOPICS: TOPICS,
    IMPROVEMENTS: IMPROVEMENTS,
    SENSITIVE_FLAGS: SENSITIVE_FLAGS,
    containsLiveFixClaim: containsLiveFixClaim,
    containsReleaseDatePromise: containsReleaseDatePromise,
    buildImmediateResponseDraft: buildImmediateResponseDraft,
    deriveQueues: deriveQueues,
    calculateMetrics: calculateMetrics,
    caseReference: caseReference,
    formatDurationMinutes: formatDurationMinutes,
    createDemoOverview: createDemoOverview,
    _test: Object.freeze({ differenceMinutes: differenceMinutes, valueOf: valueOf })
  });
});
