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

  var SENSITIVE_TOPIC_KEYS = Object.freeze(['invoices_payments', 'account_plan']);

  var NEXT_STEPS = Object.freeze({
    answer_safe_workaround: 'Answer with the current safe workaround',
    request_safe_evidence: 'Request specific safe evidence and preserve customer data',
    prepare_engineering_brief: 'Prepare an owner-reviewed engineering brief',
    wait_for_trusted_coordinator: 'Wait for the trusted local coordinator to review the queued request',
    review_coordinator_retry: 'Review the coordinator retry reason before another claim',
    request_engineering_evidence: 'Request implementation evidence for verification',
    wait_for_verification: 'Wait for independent verification evidence',
    wait_for_owner_deploy_approval: 'Wait for owner deployment approval',
    wait_for_external_release: 'Wait for a verified external release record',
    prepare_customer_followup: 'Prepare a release-backed customer follow-up',
    wait_for_owner_followup_approval: 'Wait for owner approval of customer-facing wording',
    record_manual_followup: 'Record the owner-approved follow-up after it is sent manually',
    recommend_goodwill_review: 'Recommend goodwill for owner review',
    close_documentation_ux: 'Close as a documentation or UX improvement after the safe response',
    close_feature_improvement: 'Record the feature opportunity and close the support loop',
    close_support_loop: 'Close the verified support loop'
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

  function humanizeKey(value) {
    return safeText(value).replace(/_/g, ' ').replace(/\b\w/g, function(letter) { return letter.toUpperCase(); });
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function privacyMinimizeText(value, supportCase) {
    var result = safeText(value);
    var customerName = safeText(valueOf(supportCase || {}, 'customerName', 'customer_name'));
    var customerEmail = safeText(valueOf(supportCase || {}, 'customerEmail', 'customer_email'));
    if (customerEmail) result = result.replace(new RegExp(escapeRegExp(customerEmail), 'gi'), '[redacted customer email]');
    result = result.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]');
    result = result.replace(/\bhttps?:\/\/[^\s)\]}]+/gi, function(url) {
      return /[?&](?:token|access_token|signature|sig|key|secret|auth)=/i.test(url)
        ? '[redacted secure link]'
        : url;
    });
    result = result.replace(/\b(?:bearer\s+[a-z0-9._~-]{16,}|eyj[a-z0-9_-]{20,}|sk-[a-z0-9_-]{16,})\b/gi, '[redacted token]');
    if (customerName) {
      result = result.replace(new RegExp('\\b' + escapeRegExp(customerName) + '\\b', 'gi'), '[customer]');
      var givenName = customerName.split(/\s+/)[0];
      if (givenName.length >= 3) result = result.replace(new RegExp('\\b' + escapeRegExp(givenName) + '\\b', 'gi'), '[customer]');
    }
    return result;
  }

  function latestFor(items, predicate, revisionKey) {
    var matches = (Array.isArray(items) ? items : []).filter(predicate);
    if (!matches.length) return null;
    return matches.sort(function(a, b) {
      var revisionDifference = Number(valueOf(b, revisionKey || 'handoffRevision', 'handoff_revision') || 0) - Number(valueOf(a, revisionKey || 'handoffRevision', 'handoff_revision') || 0);
      if (revisionDifference) return revisionDifference;
      return new Date(valueOf(b, 'updatedAt', 'updated_at') || valueOf(b, 'queuedAt', 'queued_at') || 0) - new Date(valueOf(a, 'updatedAt', 'updated_at') || valueOf(a, 'queuedAt', 'queued_at') || 0);
    })[0];
  }

  function confidenceBand(points) {
    if (points >= 6) return 'high';
    if (points >= 4) return 'medium';
    return 'low';
  }

  function assessSupportCase(input) {
    input = input || {};
    var supportCase = input.supportCase || input.case || {};
    var overview = input.overview || {};
    var cases = Array.isArray(overview.cases) ? overview.cases : [];
    var workItems = Array.isArray(overview.workItems) ? overview.workItems : [];
    var approvals = Array.isArray(overview.deployApprovals) ? overview.deployApprovals : [];
    var followups = Array.isArray(overview.followups) ? overview.followups : [];
    var goodwillItems = Array.isArray(overview.goodwillRecommendations) ? overview.goodwillRecommendations : [];
    var inbox = Array.isArray(overview.coordinatorInbox) ? overview.coordinatorInbox : [];
    var caseId = valueOf(supportCase, 'id');
    var topicKey = safeText(valueOf(supportCase, 'topicKey', 'topic_key')) || 'other';
    var improvementType = safeText(valueOf(supportCase, 'improvementType', 'improvement_type')) || 'feature';
    var flags = valueOf(supportCase, 'sensitiveFlags', 'sensitive_flags');
    if (!Array.isArray(flags)) flags = [];
    var riskLevel = safeText(valueOf(supportCase, 'riskLevel', 'risk_level')) || 'low';
    var isLikelyBug = !!valueOf(supportCase, 'isLikelyBug', 'is_likely_bug');
    var possibleSolution = safeText(valueOf(supportCase, 'possibleSolution', 'possible_solution'));
    var safeWorkaround = safeText(valueOf(supportCase, 'safeWorkaround', 'safe_workaround'));
    var workItem = input.workItem || latestFor(workItems, function(item) { return valueOf(item, 'caseId', 'case_id') === caseId; });
    var approval = input.approval || (workItem && latestFor(approvals, function(item) { return valueOf(item, 'workItemId', 'work_item_id') === valueOf(workItem, 'id'); }));
    var followup = input.followup || latestFor(followups, function(item) { return valueOf(item, 'caseId', 'case_id') === caseId; });
    var goodwill = input.goodwill || latestFor(goodwillItems, function(item) { return valueOf(item, 'caseId', 'case_id') === caseId; });
    var coordinatorRequest = input.coordinatorRequest || (workItem && latestFor(inbox, function(item) { return valueOf(item, 'workItemId', 'work_item_id') === valueOf(workItem, 'id'); }));
    var sameTopic = cases.filter(function(item) { return valueOf(item, 'id') !== caseId && valueOf(item, 'topicKey', 'topic_key') === topicKey; });
    var sameClassification = sameTopic.filter(function(item) { return valueOf(item, 'improvementType', 'improvement_type') === improvementType; });
    var sensitiveTopic = SENSITIVE_TOPIC_KEYS.indexOf(topicKey) !== -1;
    var humanReviewFirst = flags.length > 0 || riskLevel !== 'low' || sensitiveTopic;
    var evidence = [];
    var patterns = [];
    var missingInformation = [];
    var policyGates = [];
    var points = 0;

    if (safeText(valueOf(supportCase, 'subject')) && safeText(valueOf(supportCase, 'summary'))) {
      points += 1;
      evidence.push('A subject and customer-impact summary are recorded.');
    } else {
      missingInformation.push('A complete issue subject and impact summary.');
    }
    if (TOPICS[topicKey]) {
      points += 1;
      evidence.push('The report maps to the controlled topic “' + TOPICS[topicKey] + '.”');
    } else {
      missingInformation.push('A controlled support topic.');
    }
    if (IMPROVEMENTS[improvementType]) {
      points += 1;
      evidence.push('The recorded improvement type is “' + IMPROVEMENTS[improvementType].label + '.”');
    }
    if ((improvementType === 'bug' && isLikelyBug) || (improvementType !== 'bug' && !isLikelyBug)) {
      points += 1;
      evidence.push('The likely-bug flag is consistent with the recorded improvement type.');
    } else {
      missingInformation.push('Resolve the mismatch between the likely-bug flag and improvement type.');
    }
    if (possibleSolution) {
      points += 1;
      evidence.push('A possible solution is recorded for engineering review.');
    } else if (isLikelyBug) {
      missingInformation.push('A safe reproduction theory or possible solution.');
    }
    if (workItem) {
      points += 1;
      evidence.push('An engineering work item exists with status “' + humanizeKey(valueOf(workItem, 'status')) + '.”');
    } else if (isLikelyBug) {
      missingInformation.push('An engineering work item linked to this likely bug.');
    }
    if (sameTopic.length) {
      points += 1;
      patterns.push(sameTopic.length + ' other recorded case' + (sameTopic.length === 1 ? ' shares' : 's share') + ' the “' + (TOPICS[topicKey] || humanizeKey(topicKey)) + '” topic.');
    }
    if (sameClassification.length) patterns.push(sameClassification.length + ' of those also share the same improvement type.');
    if (!patterns.length) patterns.push('No close recorded pattern match is available yet; treat this as a single-case signal.');
    if (safeWorkaround) evidence.push('A current safe workaround is recorded.');
    else missingInformation.push('A verified safe workaround; preserve affected data until one is known.');

    var riskLabels = flags.map(function(flag) { return SENSITIVE_FLAGS[flag] || humanizeKey(flag); });
    if (sensitiveTopic && !riskLabels.length) riskLabels.push((TOPICS[topicKey] || humanizeKey(topicKey)) + ' is a human-review-first topic');
    if (humanReviewFirst) policyGates.push('Human review comes first regardless of confidence because this case is sensitive or potentially high impact.');
    policyGates.push('Confidence is advisory evidence, never permission to send, deploy, merge, launch an agent, or grant credit.');
    policyGates.push('Owner approval remains required for deployment, fix-live wording, customer follow-up, and any goodwill decision.');

    var recommendationKey = 'close_support_loop';
    var recommendationWhy = [];
    var recommendationConfidence = 'medium';
    var firstResponseAt = valueOf(supportCase, 'firstResponseAt', 'first_response_at');
    var workStatus = safeText(valueOf(workItem, 'status'));
    var approvalStatus = safeText(valueOf(approval, 'status'));
    var deployedAt = valueOf(approval, 'deployedAt', 'deployed_at');
    var followupStatus = safeText(valueOf(followup, 'status'));
    var requestState = safeText(valueOf(coordinatorRequest, 'state'));

    if (!firstResponseAt) {
      if (safeWorkaround) {
        recommendationKey = 'answer_safe_workaround';
        recommendationConfidence = 'high';
        recommendationWhy.push('A safe workaround is recorded and no first response has been recorded yet.');
      } else {
        recommendationKey = 'request_safe_evidence';
        recommendationConfidence = humanReviewFirst ? 'high' : 'medium';
        recommendationWhy.push('No safe workaround is known, so data preservation and a narrow evidence request are safer than troubleshooting guesses.');
      }
    } else if (workItem) {
      if (['queued', 'claimed'].indexOf(requestState) !== -1) {
        recommendationKey = 'wait_for_trusted_coordinator';
        recommendationConfidence = 'high';
        recommendationWhy.push('An owner-confirmed, privacy-minimized request is already in the internal coordinator inbox.');
      } else if (requestState === 'retry_required') {
        recommendationKey = 'review_coordinator_retry';
        recommendationConfidence = 'high';
        recommendationWhy.push('The internal queue recorded a retry-required state; review its sanitized error before another claim.');
      } else if (['queued', 'blocked'].indexOf(workStatus) !== -1) {
        recommendationKey = 'prepare_engineering_brief';
        recommendationConfidence = possibleSolution ? 'high' : 'medium';
        recommendationWhy.push('Engineering-worthy work exists but no active internal coordinator request is recorded.');
      } else if (workStatus === 'in_progress') {
        recommendationKey = 'request_engineering_evidence';
        recommendationConfidence = 'medium';
        recommendationWhy.push('Implementation is in progress; the next safe gate is reviewable implementation and test evidence.');
      } else if (workStatus === 'verification_pending') {
        recommendationKey = 'wait_for_verification';
        recommendationConfidence = 'high';
        recommendationWhy.push('The work item is explicitly waiting for independent verification.');
        if (!safeText(valueOf(workItem, 'verificationSummary', 'verification_summary'))) missingInformation.push('Independent verification summary and evidence.');
      } else if (workStatus === 'verified' && (!approval || approvalStatus === 'pending')) {
        recommendationKey = 'wait_for_owner_deploy_approval';
        recommendationConfidence = 'high';
        recommendationWhy.push('Verification is recorded, but the owner-controlled deployment gate is still pending.');
      } else if (workStatus === 'verified' && approvalStatus === 'approved' && !deployedAt) {
        recommendationKey = 'wait_for_external_release';
        recommendationConfidence = 'high';
        recommendationWhy.push('Owner approval is recorded, but no externally verified deployment is recorded.');
      } else if (deployedAt && ['waiting_on_release', 'draft'].indexOf(followupStatus) !== -1) {
        recommendationKey = 'prepare_customer_followup';
        recommendationConfidence = 'high';
        recommendationWhy.push('A verified release record exists, so a release-backed draft can be prepared for owner review.');
      } else if (followupStatus === 'owner_review') {
        recommendationKey = 'wait_for_owner_followup_approval';
        recommendationConfidence = 'high';
        recommendationWhy.push('Customer-facing wording is prepared but still requires owner approval.');
      } else if (followupStatus === 'approved') {
        recommendationKey = 'record_manual_followup';
        recommendationConfidence = 'high';
        recommendationWhy.push('Owner wording approval is recorded; the dashboard can only record a send completed elsewhere.');
      } else if (followupStatus === 'sent' && humanReviewFirst && !goodwill) {
        recommendationKey = 'recommend_goodwill_review';
        recommendationConfidence = 'medium';
        recommendationWhy.push('The customer-impacting loop is complete and the sensitive impact may warrant an owner-only goodwill review.');
      } else if (workStatus === 'cancelled') {
        recommendationKey = 'request_safe_evidence';
        recommendationConfidence = 'low';
        recommendationWhy.push('Engineering was cancelled, so the report needs new safe evidence before another product recommendation.');
      } else {
        recommendationWhy.push('Recorded workflow gates appear complete; confirm the customer has a safe resolution before closing.');
      }
    } else if (isLikelyBug) {
      recommendationKey = possibleSolution ? 'prepare_engineering_brief' : 'request_safe_evidence';
      recommendationConfidence = possibleSolution ? 'medium' : 'low';
      recommendationWhy.push(possibleSolution ? 'A possible solution exists, but the expected engineering item is missing.' : 'The likely bug does not yet have enough implementation-safe evidence for engineering.');
    } else if (['documentation', 'ux'].indexOf(improvementType) !== -1) {
      recommendationKey = 'close_documentation_ux';
      recommendationConfidence = 'high';
      recommendationWhy.push('The case is classified as a non-code documentation or UX improvement and a first response is already recorded.');
    } else if (improvementType === 'feature') {
      recommendationKey = 'close_feature_improvement';
      recommendationConfidence = 'medium';
      recommendationWhy.push('The request can be retained as a product opportunity without implying a delivery commitment.');
    }

    var approvalsRequired = [];
    if (recommendationKey === 'prepare_engineering_brief') approvalsRequired.push('Owner confirmation before the privacy-minimized brief enters the coordinator inbox.');
    if (workItem) {
      if (!approval || approvalStatus === 'pending') approvalsRequired.push('Owner approval before any deployment.');
      if (!deployedAt) approvalsRequired.push('Verified external deployment evidence before any “fix is live” statement.');
      if (followupStatus !== 'sent') approvalsRequired.push('Owner approval of exact customer follow-up wording before a manual send.');
    }
    approvalsRequired.push('Owner decision before any goodwill recommendation is acted on; the dashboard cannot grant credit.');
    if (humanReviewFirst) approvalsRequired.unshift('Human review first for the recorded sensitive category, regardless of confidence.');

    var classificationConfidence = confidenceBand(points);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      advisoryOnly: true,
      confidenceNotAuthorization: true,
      humanReviewFirst: humanReviewFirst,
      classification: {
        confidence: classificationConfidence,
        label: humanizeKey(classificationConfidence) + ' evidence confidence',
        summary: 'Recorded evidence ' + (classificationConfidence === 'high' ? 'strongly' : classificationConfidence === 'medium' ? 'partly' : 'weakly') + ' supports “' + ((IMPROVEMENTS[improvementType] && IMPROVEMENTS[improvementType].label) || humanizeKey(improvementType)) + '” in “' + (TOPICS[topicKey] || humanizeKey(topicKey)) + '.” This is not a probability or permission to act.'
      },
      recommendation: {
        key: recommendationKey,
        label: NEXT_STEPS[recommendationKey] || humanizeKey(recommendationKey),
        confidence: recommendationConfidence,
        why: recommendationWhy,
        ownerApprovalsStillRequired: approvalsRequired
      },
      evidence: evidence,
      patterns: patterns,
      riskFlags: riskLabels.length ? riskLabels : ['No sensitive flag is recorded.'],
      policyGates: policyGates,
      missingInformation: missingInformation.length ? missingInformation : ['No material information gap is recorded for the recommended next gate.'],
      goodwill: {
        recommendationOnly: true,
        reviewSuggested: humanReviewFirst && !goodwill,
        creditActionAvailable: false
      }
    };
  }

  function snakeCaseObject(value) {
    if (Array.isArray(value)) return value.map(snakeCaseObject);
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    return Object.keys(value).reduce(function(result, key) {
      result[key.replace(/[A-Z]/g, function(letter) { return '_' + letter.toLowerCase(); })] = snakeCaseObject(value[key]);
      return result;
    }, {});
  }

  function briefList(items, fallback) {
    return (Array.isArray(items) && items.length ? items : [fallback]).map(function(item) { return '- ' + item; });
  }

  function buildCoordinatorBriefData(input) {
    input = input || {};
    var supportCase = input.supportCase || input.case || {};
    var workItem = input.workItem || {};
    var assessment = input.advisoryAssessment || assessSupportCase({
      supportCase: supportCase,
      workItem: workItem,
      overview: input.overview || {}
    });
    var rawSubject = safeText(valueOf(supportCase, 'subject')) || 'Untitled support case';
    var rawSummary = safeText(valueOf(supportCase, 'summary')) || 'No case summary recorded.';
    var topicKey = safeText(valueOf(supportCase, 'topicKey', 'topic_key')) || 'other';
    var improvementType = safeText(valueOf(supportCase, 'improvementType', 'improvement_type')) || 'feature';
    var riskLevel = safeText(valueOf(supportCase, 'riskLevel', 'risk_level')) || 'low';
    var sensitiveFlags = valueOf(supportCase, 'sensitiveFlags', 'sensitive_flags');
    if (!Array.isArray(sensitiveFlags)) sensitiveFlags = [];
    var rawWorkaround = safeText(valueOf(supportCase, 'safeWorkaround', 'safe_workaround')) ||
      'No safe workaround is recorded. Preserve the affected data and route decisions for owner review.';
    var responseStatus = safeText(valueOf(supportCase, 'immediateResponseStatus', 'immediate_response_status')) || 'not recorded';
    var rawResponseDraft = safeText(valueOf(supportCase, 'immediateResponseDraft', 'immediate_response_draft')) || 'No customer response is recorded.';
    var rawProductImpact = safeText(input.productImpact || valueOf(supportCase, 'productImpact', 'product_impact')) || rawSummary;
    var rawProposedSolution = safeText(valueOf(workItem, 'proposedSolution', 'proposed_solution')) ||
      safeText(valueOf(supportCase, 'possibleSolution', 'possible_solution')) || 'No proposed solution recorded.';
    var rawEvidenceNotes = safeText(input.evidenceNotes) || 'No additional evidence, links, or notes provided.';
    var rawRequestedOutcome = safeText(input.requestedEngineeringOutcome || input.requestedOutcome) ||
      'Investigate the report, implement the smallest compatible improvement, and return focused test and local UI verification evidence.';
    var subject = privacyMinimizeText(rawSubject, supportCase);
    var summary = privacyMinimizeText(rawSummary, supportCase);
    var workaround = privacyMinimizeText(rawWorkaround, supportCase);
    var responseDraft = privacyMinimizeText(rawResponseDraft, supportCase);
    var productImpact = privacyMinimizeText(rawProductImpact, supportCase);
    var proposedSolution = privacyMinimizeText(rawProposedSolution, supportCase);
    var evidenceNotes = privacyMinimizeText(rawEvidenceNotes, supportCase);
    var requestedOutcome = privacyMinimizeText(rawRequestedOutcome, supportCase);
    var flags = sensitiveFlags.map(function(flag) { return SENSITIVE_FLAGS[flag] || humanizeKey(flag); });
    var redactionApplied = [
      [rawSubject, subject], [rawSummary, summary], [rawWorkaround, workaround], [rawResponseDraft, responseDraft],
      [rawProductImpact, productImpact], [rawProposedSolution, proposedSolution], [rawEvidenceNotes, evidenceNotes],
      [rawRequestedOutcome, requestedOutcome]
    ].some(function(pair) { return pair[0] !== pair[1]; });
    var assessmentPayload = snakeCaseObject(assessment);
    var payload = {
      schema_version: 2,
      handoff_mode: 'owner_confirmed_internal_coordinator_inbox',
      case: {
        reference: caseReference(supportCase),
        subject: subject,
        summary: summary,
        customer_name_included: false,
        customer_email_included: false
      },
      classification: {
        topic_key: topicKey,
        topic_label: TOPICS[topicKey] || humanizeKey(topicKey),
        improvement_type: improvementType,
        improvement_label: (IMPROVEMENTS[improvementType] && IMPROVEMENTS[improvementType].label) || humanizeKey(improvementType),
        risk_level: riskLevel,
        escalation_flags: sensitiveFlags,
        escalation_flag_labels: flags
      },
      advisory_assessment: assessmentPayload,
      current_customer_response: {
        status: responseStatus,
        safe_workaround: workaround,
        response_text: responseDraft,
        sent_by_dashboard: false
      },
      product_impact: productImpact,
      proposed_solution: proposedSolution,
      evidence_links_or_notes: evidenceNotes,
      requested_engineering_outcome: requestedOutcome,
      privacy: {
        privacy_minimized: true,
        customer_name_included: false,
        customer_email_included: false,
        secure_links_or_tokens_included: false,
        redaction_applied: redactionApplied
      },
      coordinator_inbox: {
        owner_confirmed: true,
        state_on_submission: 'queued',
        external_delivery_performed: false,
        trusted_local_coordinator_connected: false
      },
      safety_boundaries: {
        live_codex_desktop_connection: false,
        agent_launch_available: false,
        deployment_available: false,
        merge_available: false,
        customer_messaging_available: false,
        credit_grant_available: false,
        owner_approval_still_required_for: ['deployment', 'fix_live_statement', 'customer_followup', 'goodwill_credit']
      }
    };

    var brief = [
      '# QuoteDr engineering coordinator brief',
      '',
      'Handoff mode: Owner-confirmed internal coordinator inbox. No live coordinator integration or agent launch is performed.',
      'Future boundary: A separate trusted local coordinator process may later poll this queue, repeat approval and risk checks, and create a Codex task outside QuoteDr.',
      'Case: ' + caseReference(supportCase) + ' - ' + subject,
      '',
      '## Case summary',
      summary,
      '',
      '## Classification',
      '- Topic: ' + (TOPICS[topicKey] || humanizeKey(topicKey)),
      '- Improvement type: ' + ((IMPROVEMENTS[improvementType] && IMPROVEMENTS[improvementType].label) || humanizeKey(improvementType)),
      '- Risk level: ' + humanizeKey(riskLevel),
      '- Escalation flags: ' + (flags.length ? flags.join(', ') : 'None recorded'),
      '',
      '## Advisory confidence and rationale',
      '- Classification confidence: ' + humanizeKey(assessment.classification.confidence) + ' (evidence band, not a probability or authorization)',
      '- Recommended next step: ' + assessment.recommendation.label,
      '- Next-step confidence: ' + humanizeKey(assessment.recommendation.confidence) + ' (advisory only)',
      '- Human-review-first: ' + (assessment.humanReviewFirst ? 'Yes - confidence never bypasses the sensitive-case review gate.' : 'No sensitive gate is recorded, but human review is still required before action.'),
      '',
      '### Issue evidence',
    ].concat(
      briefList(assessment.evidence, 'No issue evidence recorded.'),
      ['', '### Similar cases and patterns'],
      briefList(assessment.patterns, 'No similar-case pattern recorded.'),
      ['', '### Recommendation rationale'],
      briefList(assessment.recommendation.why, 'No recommendation rationale recorded.'),
      ['', '### Risk flags and policy gates'],
      briefList((assessment.riskFlags || []).concat(assessment.policyGates || []), 'No risk or policy gate recorded.'),
      ['', '### Missing information'],
      briefList(assessment.missingInformation, 'No material information gap recorded.'),
      ['', '### Owner approvals still required'],
      briefList(assessment.recommendation.ownerApprovalsStillRequired, 'Human review is still required.'),
      [
        '',
        '## Current customer-safe response',
        '- Response status: ' + humanizeKey(responseStatus),
        '- Safe workaround: ' + workaround,
        '- Current reviewed/draft response: ' + responseDraft,
        '',
        '## Product impact',
        productImpact,
        '',
        '## Proposed solution',
        proposedSolution,
        '',
        '## Evidence, links, or notes',
        evidenceNotes,
        '',
        '## Requested engineering outcome',
        requestedOutcome,
        '',
        '## Privacy minimization',
        '- Customer name and email are omitted from this engineering request.',
        '- Email addresses, secure links, and token-like values are redacted before storage.',
        '- Redaction applied to this brief: ' + (redactionApplied ? 'Yes' : 'No sensitive value detected'),
        '',
        '## Safety and approval boundaries',
        '- This action stores an internal, reviewable queue request; it does not contact Codex Desktop or launch an agent.',
        '- Do not push, merge, or deploy without explicit owner authorization and the existing deployment approval workflow.',
        '- Do not state that a fix is live until verification and a deployed release are recorded and owner-approved wording is used.',
        '- Do not send customer messages or grant goodwill credits from this handoff.',
        '- Preserve customer data and keep sensitive billing, payment, data, privacy, access, signature, conflict, and incident matters under human review.'
      ]
    ).join('\n');

    return { brief: brief, payload: payload, advisoryAssessment: assessment };
  }

  function buildCoordinatorBrief(input) {
    return buildCoordinatorBriefData(input).brief;
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
    workItems.forEach(function(item) {
      item.coordinatorHandoffStatus = 'not_sent';
      item.coordinatorHandoffCount = 0;
      item.coordinatorBrief = '';
    });
    workItems[1].coordinatorHandoffStatus = 'handed_off';
    workItems[1].coordinatorHandoffAt = ago(1.5);
    workItems[1].coordinatorHandoffByEmail = 'local-demo@quotedr.test';
    workItems[1].coordinatorHandoffCount = 1;
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
      coordinatorInbox: [],
      coordinatorInboxEvents: [],
      events: [],
      role: { email: 'local-demo@quotedr.test', owner: true },
      policy: {
        noAutosend: true,
        internalCoordinatorInboxOnly: true,
        liveCodexDesktopConnectionAvailable: false,
        trustedLocalCoordinatorConnected: false,
        agentLaunchAvailable: false,
        deploymentExecutionAvailable: false,
        creditGrantAvailable: false,
        ownerApprovalRequiredFor: ['coordinator_inbox_submission', 'deployment', 'fix_live_statement', 'customer_followup', 'goodwill_credit']
      }
    };
    var handoffAssessment = assessSupportCase({ supportCase: cases[1], workItem: workItems[1], overview: overview });
    var handoffRecord = buildCoordinatorBriefData({
      supportCase: cases[1],
      workItem: workItems[1],
      overview: overview,
      advisoryAssessment: handoffAssessment,
      productImpact: 'Duplicate imports can corrupt a contractor\'s saved-item catalog and make later quote pricing unreliable.',
      evidenceNotes: 'Customer report notes a reconnect immediately before the duplicate import. Compare QuickBooks IDs and import-run behavior.',
      requestedEngineeringOutcome: 'Reproduce the reconnect path, add an idempotency guard, and return focused import tests plus a safe cleanup recommendation.'
    });
    workItems[1].coordinatorBrief = handoffRecord.brief;
    workItems[1].coordinatorBriefPayload = handoffRecord.payload;
    overview.coordinatorInbox.push({
      id: 'inbox-2-r1',
      caseId: 'case-2',
      workItemId: 'work-2',
      handoffRevision: 1,
      idempotencyKey: 'engineering-handoff:work-2:r1',
      state: 'queued',
      taskBrief: handoffRecord.brief,
      taskPayload: handoffRecord.payload,
      advisoryAssessment: handoffAssessment,
      ownerConfirmed: true,
      privacyMinimized: true,
      submittedByEmail: 'local-demo@quotedr.test',
      queuedAt: ago(1.5),
      availableAt: ago(1.5),
      attemptCount: 0,
      retryCount: 0,
      createdAt: ago(1.5),
      updatedAt: ago(1.5)
    });
    overview.coordinatorInboxEvents.push({
      id: 'inbox-event-2-r1',
      inboxId: 'inbox-2-r1',
      caseId: 'case-2',
      workItemId: 'work-2',
      eventType: 'coordinator_inbox_queued',
      fromState: '',
      toState: 'queued',
      actorEmail: 'local-demo@quotedr.test',
      details: { handoffRevision: 1, ownerConfirmed: true, privacyMinimized: true, externalDeliveryPerformed: false, agentLaunched: false },
      occurredAt: ago(1.5)
    });
    overview.events.push({
      id: 'demo-handoff-event-2-r1',
      caseId: 'case-2',
      workItemId: 'work-2',
      eventType: 'engineering_coordinator_handoff_recorded',
      actorEmail: 'local-demo@quotedr.test',
      details: { handoffCount: 1, coordinatorInboxId: 'inbox-2-r1', externalDeliveryPerformed: false, agentLaunched: false },
      occurredAt: ago(1.5)
    });
    cases.forEach(function(item) {
      item.advisoryAssessment = assessSupportCase({ supportCase: item, overview: overview });
    });
    overview.metrics = calculateMetrics(overview);
    return overview;
  }

  return Object.freeze({
    TOPICS: TOPICS,
    IMPROVEMENTS: IMPROVEMENTS,
    SENSITIVE_FLAGS: SENSITIVE_FLAGS,
    NEXT_STEPS: NEXT_STEPS,
    containsLiveFixClaim: containsLiveFixClaim,
    containsReleaseDatePromise: containsReleaseDatePromise,
    buildImmediateResponseDraft: buildImmediateResponseDraft,
    assessSupportCase: assessSupportCase,
    privacyMinimizeText: privacyMinimizeText,
    buildCoordinatorBriefData: buildCoordinatorBriefData,
    buildCoordinatorBrief: buildCoordinatorBrief,
    deriveQueues: deriveQueues,
    calculateMetrics: calculateMetrics,
    caseReference: caseReference,
    formatDurationMinutes: formatDurationMinutes,
    createDemoOverview: createDemoOverview,
    _test: Object.freeze({ differenceMinutes: differenceMinutes, valueOf: valueOf })
  });
});
