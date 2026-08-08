(function() {
  'use strict';

  var core = window.QuoteDrAiOperationsCore;
  var state = {
    overview: null,
    demo: false,
    user: null,
    selectedCaseId: null,
    pendingAction: null,
    detail: null,
    newCaseModal: null,
    actionModal: null
  };

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function copyText(value) {
    var text = String(value || '');
    if (!text) throw new Error('There is no coordinator brief to copy.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    var copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy was blocked by this browser. Select the brief and copy it manually.');
  }

  function safeUrlHost() {
    return ['localhost', '127.0.0.1'].indexOf(window.location.hostname) !== -1;
  }

  function wantsLocalDemo() {
    return safeUrlHost() && new URLSearchParams(window.location.search || '').get('demo') === '1';
  }

  function formatDate(value) {
    if (!value) return 'Not yet';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function relativeTime(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    var minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.round(minutes / 60);
    if (hours < 48) return hours + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }

  function humanize(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, function(letter) { return letter.toUpperCase(); });
  }

  function topicLabel(topicKey) {
    return core.TOPICS[topicKey] || humanize(topicKey);
  }

  function improvementMeta(type) {
    return core.IMPROVEMENTS[type] || { label: humanize(type), shortLabel: humanize(type), tone: 'blue' };
  }

  function improvementTag(type) {
    var meta = improvementMeta(type);
    var className = type === 'documentation' ? 'tag-docs' : type === 'ux' ? 'tag-ux' : type === 'bug' ? 'tag-bug' : 'tag-feature';
    return '<span class="tag ' + className + '">' + escapeHtml(meta.label) + '</span>';
  }

  function caseMaps() {
    var overview = state.overview || {};
    var cases = new Map((overview.cases || []).map(function(item) { return [item.id, item]; }));
    var workItems = new Map((overview.workItems || []).map(function(item) { return [item.id, item]; }));
    var workByCase = new Map((overview.workItems || []).map(function(item) { return [item.caseId, item]; }));
    var approvalByWork = new Map((overview.deployApprovals || []).map(function(item) { return [item.workItemId, item]; }));
    var followupByCase = new Map((overview.followups || []).map(function(item) { return [item.caseId, item]; }));
    var goodwillByCase = new Map((overview.goodwillRecommendations || []).map(function(item) { return [item.caseId, item]; }));
    return { cases: cases, workItems: workItems, workByCase: workByCase, approvalByWork: approvalByWork, followupByCase: followupByCase, goodwillByCase: goodwillByCase };
  }

  async function callOperations(action, payload) {
    var response = await fetch(SUPABASE_URL + '/functions/v1/ai-operations', {
      method: 'POST',
      headers: await getSupabaseFunctionAuthHeaders(),
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var data = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(data.error || 'AI Operations request failed.');
    return data;
  }

  function showApp() {
    byId('accessGate').classList.add('d-none');
    byId('operationsApp').classList.remove('d-none');
  }

  function showAccessError(message) {
    var gate = byId('accessGate');
    gate.innerHTML = '<div class="ops-card p-5 text-center"><i class="fas fa-lock fa-2x text-danger mb-3"></i><h1 class="h5 fw-bold">AI Operations is administrator-only</h1><p class="text-muted small">' + escapeHtml(message) + '</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
  }

  async function loadOverview(options) {
    options = options || {};
    var button = byId('refreshButton');
    if (button && !options.silent) button.disabled = true;
    try {
      if (state.demo) {
        if (!state.overview) state.overview = core.createDemoOverview();
      } else {
        state.overview = await callOperations('overview');
      }
      renderAll();
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderMetrics(metrics) {
    metrics = metrics || core.calculateMetrics(state.overview || {});
    byId('metricOpenCases').textContent = metrics.openCases == null ? '—' : metrics.openCases;
    byId('metricIncoming').textContent = metrics.queueCounts && metrics.queueCounts.incoming != null ? metrics.queueCounts.incoming : '—';
    byId('metricFirstResponse').textContent = core.formatDurationMinutes(metrics.averageFirstResponseMinutes);
    byId('metricBugDeploy').textContent = Number.isFinite(metrics.averageBugToDeployHours)
      ? core.formatDurationMinutes(metrics.averageBugToDeployHours * 60)
      : '—';
    var ownerGates = (state.overview.deployApprovals || []).filter(function(item) { return item.status === 'pending'; }).length +
      (state.overview.followups || []).filter(function(item) { return item.status === 'owner_review'; }).length +
      (state.overview.goodwillRecommendations || []).filter(function(item) { return item.status === 'recommended'; }).length;
    byId('metricOwnerGates').textContent = ownerGates;
    var sensitive = metrics.sensitiveOpenCases;
    if (sensitive == null) {
      sensitive = (state.overview.cases || []).filter(function(item) { return item.workflowStage !== 'closed' && item.riskLevel !== 'low'; }).length;
    }
    byId('metricOpenNote').textContent = sensitive + ' sensitive or critical';
  }

  function queueItemHtml(supportCase, meta, icon, tone) {
    if (!supportCase) return '';
    var risk = supportCase.riskLevel !== 'low' ? '<span class="tag tag-risk">' + escapeHtml(humanize(supportCase.riskLevel)) + '</span>' : '';
    return '<button type="button" class="queue-item" data-open-case="' + escapeHtml(supportCase.id) + '">' +
      '<div class="d-flex justify-content-between gap-2 mb-2"><span class="queue-item-meta fw-bold">' + escapeHtml(core.caseReference(supportCase)) + '</span><i class="fas ' + icon + '" style="color:' + tone + '"></i></div>' +
      '<div class="queue-item-title mb-2">' + escapeHtml(supportCase.subject) + '</div>' +
      '<div class="d-flex flex-wrap gap-1 mb-2">' + improvementTag(supportCase.improvementType) + risk + '</div>' +
      '<div class="queue-item-meta">' + escapeHtml(meta) + ' · ' + escapeHtml(relativeTime(supportCase.updatedAt || supportCase.createdAt)) + '</div>' +
    '</button>';
  }

  function renderQueue(elementId, countId, items, renderItem, emptyCopy) {
    byId(countId).textContent = items.length;
    byId(elementId).innerHTML = items.length
      ? items.map(renderItem).join('')
      : '<div class="empty-queue"><i class="fas fa-circle-check d-block mb-2 text-success"></i>' + escapeHtml(emptyCopy) + '</div>';
  }

  function renderQueues() {
    var queues = core.deriveQueues(state.overview || {});
    var maps = caseMaps();
    renderQueue('incomingQueue', 'incomingCount', queues.incoming, function(item) {
      var meta = item.safeWorkaround ? 'Safe workaround ready' : 'Owner review · preserve data';
      return queueItemHtml(item, meta, 'fa-inbox', '#1a56a0');
    }, 'No cases need a first response.');
    renderQueue('engineeringQueue', 'engineeringCount', queues.engineering, function(item) {
      return queueItemHtml(maps.cases.get(item.caseId), humanize(item.status), 'fa-code-branch', '#7c3aed');
    }, 'No engineering work is waiting.');
    renderQueue('deployQueue', 'deployCount', queues.deployApproval, function(item) {
      var workItem = maps.workItems.get(item.workItemId);
      return queueItemHtml(workItem && maps.cases.get(workItem.caseId), item.status === 'pending' ? 'Owner decision required' : 'Approved · record external release', 'fa-shield-halved', '#e87e2a');
    }, 'No verified work awaits owner release control.');
    renderQueue('followupQueue', 'followupCount', queues.followup, function(item) {
      var copy = item.status === 'waiting_on_release' ? 'Waiting on verified release' : item.status === 'owner_review' ? 'Owner must approve wording' : item.status === 'approved' ? 'Ready for manual send' : humanize(item.status);
      return queueItemHtml(maps.cases.get(item.caseId), copy, 'fa-reply', '#198754');
    }, 'No customer follow-ups are waiting.');
  }

  function renderImprovementFeed() {
    var cases = (state.overview.cases || []).slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 12);
    byId('improvementFeed').innerHTML = cases.length ? cases.map(function(item) {
      var statusCopy = item.workflowStage === 'closed' ? 'Closed loop' : humanize(item.workflowStage);
      return '<button type="button" class="feed-item bg-transparent border-0 w-100 text-start" data-open-case="' + escapeHtml(item.id) + '">' +
        '<div class="d-flex justify-content-between align-items-start gap-3"><div><div class="d-flex flex-wrap gap-2 align-items-center mb-1">' + improvementTag(item.improvementType) + '<span class="queue-item-meta">' + escapeHtml(core.caseReference(item)) + '</span></div><div class="fw-semibold">' + escapeHtml(item.subject) + '</div><div class="small text-muted mt-1">' + escapeHtml(topicLabel(item.topicKey)) + ' · ' + escapeHtml(statusCopy) + '</div></div><i class="fas fa-chevron-right text-muted mt-2"></i></div>' +
      '</button>';
    }).join('') : '<div class="empty-queue">No support improvements recorded yet.</div>';
  }

  function renderTopics(metrics) {
    var topics = (metrics && metrics.commonTopics) || [];
    if (!topics.length) {
      byId('commonTopics').innerHTML = '<div class="empty-queue">Topic metrics will appear after cases are recorded.</div>';
      return;
    }
    var max = Math.max.apply(Math, topics.map(function(item) { return item.count; }));
    byId('commonTopics').innerHTML = topics.slice(0, 7).map(function(item) {
      var label = item.label || topicLabel(item.topicKey);
      var width = Math.max(8, Math.round(item.count / max * 100));
      return '<div class="topic-row"><div class="topic-name">' + escapeHtml(label) + '</div><div class="topic-track" aria-hidden="true"><div class="topic-fill" style="width:' + width + '%"></div></div><div class="topic-count">' + item.count + '</div></div>';
    }).join('');
  }

  function renderAll() {
    if (!state.overview) return;
    if (!state.overview.metrics) state.overview.metrics = core.calculateMetrics(state.overview);
    renderMetrics(state.overview.metrics);
    renderQueues();
    renderImprovementFeed();
    renderTopics(state.overview.metrics);
    byId('lastUpdated').textContent = 'Updated ' + formatDate(state.overview.generatedAt || new Date().toISOString());
    var role = state.overview.role || { email: state.user && state.user.email || 'Local demo', owner: state.demo };
    byId('roleBadge').textContent = role.owner ? 'Owner controls enabled' : 'Coordinator access';
    if (state.selectedCaseId && byId('caseDetail').classList.contains('show')) renderCaseDetail(state.selectedCaseId);
  }

  function workflowHtml(supportCase, workItem, approval, followup) {
    var steps = [
      { label: 'Intake', done: true },
      { label: 'Safe response', done: !!supportCase.firstResponseAt },
      { label: 'Engineering', done: !!workItem && workItem.status !== 'queued' },
      { label: 'Verification', done: !!workItem && workItem.status === 'verified' },
      { label: 'Deploy approval', done: !!approval && approval.status === 'approved' },
      { label: 'Follow-up', done: !!followup && followup.status === 'sent' },
      { label: 'Closed', done: supportCase.workflowStage === 'closed' }
    ];
    var currentIndex = steps.findIndex(function(step) { return !step.done; });
    if (currentIndex === -1) currentIndex = steps.length - 1;
    return '<div class="workflow-rail">' + steps.map(function(step, index) {
      return '<div class="workflow-step ' + (step.done ? 'done' : index === currentIndex ? 'current' : '') + '">' + (step.done ? '<i class="fas fa-check d-block mb-1"></i>' : '') + escapeHtml(step.label) + '</div>';
    }).join('') + '</div>';
  }

  function detailStatusCard(label, status, body) {
    return '<div class="action-card"><div class="d-flex justify-content-between gap-2"><span class="detail-label">' + escapeHtml(label) + '</span><span class="badge text-bg-light border">' + escapeHtml(humanize(status || 'not started')) + '</span></div>' + (body ? '<div class="small mt-2">' + body + '</div>' : '') + '</div>';
  }

  function actionButton(action, label, icon, style) {
    return '<button type="button" class="btn ' + (style || 'btn-outline-primary') + ' btn-sm" data-workflow-action="' + escapeHtml(action) + '"><i class="fas ' + icon + ' me-1"></i>' + escapeHtml(label) + '</button>';
  }

  function renderActions(supportCase, workItem, approval, followup, goodwill) {
    var role = state.overview.role || { owner: state.demo };
    var buttons = [];
    if (!supportCase.firstResponseAt) buttons.push(actionButton('record_immediate_response', 'Record reviewed response', 'fa-comment-dots', 'btn-primary'));
    if (workItem && workItem.status !== 'cancelled') {
      var handoffLabel = workItem.coordinatorHandoffStatus === 'handed_off'
        ? 'Send updated brief to engineering coordinator'
        : 'Send to engineering coordinator';
      buttons.push(actionButton('handoff_engineering', handoffLabel, 'fa-share-from-square', 'btn-primary'));
    }
    if (workItem && ['queued', 'blocked'].indexOf(workItem.status) !== -1) buttons.push(actionButton('start_engineering', 'Start engineering', 'fa-code-branch'));
    if (workItem && workItem.status === 'in_progress') buttons.push(actionButton('submit_verification', 'Submit for verification', 'fa-flask'));
    if (workItem && workItem.status === 'verification_pending') buttons.push(actionButton('verify_work_item', 'Record verification', 'fa-circle-check', 'btn-success'));
    if (approval && approval.status === 'pending' && role.owner) {
      buttons.push(actionButton('approve_deployment', 'Approve deploy', 'fa-shield-halved', 'btn-warning'));
      buttons.push(actionButton('decline_deployment', 'Decline', 'fa-ban', 'btn-outline-danger'));
    }
    if (approval && approval.status === 'approved' && !approval.deployedAt && role.owner) buttons.push(actionButton('record_deployment', 'Record external deployment', 'fa-clipboard-check', 'btn-warning'));
    if (followup && ['draft', 'owner_review'].indexOf(followup.status) !== -1) buttons.push(actionButton('prepare_followup', followup.status === 'draft' ? 'Prepare follow-up' : 'Edit follow-up draft', 'fa-pen'));
    if (followup && followup.status === 'owner_review' && role.owner) {
      buttons.push(actionButton('approve_followup', 'Approve customer wording', 'fa-user-check', 'btn-success'));
      buttons.push(actionButton('return_followup', 'Return for edits', 'fa-rotate-left', 'btn-outline-secondary'));
    }
    if (followup && followup.status === 'approved') buttons.push(actionButton('mark_followup_sent', 'Record manual send', 'fa-paper-plane', 'btn-success'));
    if (!goodwill) buttons.push(actionButton('recommend_goodwill', 'Recommend goodwill', 'fa-gift'));
    if (goodwill && goodwill.status === 'recommended' && role.owner) {
      buttons.push(actionButton('approve_goodwill', 'Approve goodwill', 'fa-user-check'));
      buttons.push(actionButton('decline_goodwill', 'Decline goodwill', 'fa-ban', 'btn-outline-secondary'));
    }
    if (!workItem && supportCase.firstResponseAt && supportCase.workflowStage !== 'closed') buttons.push(actionButton('close_case', 'Close case', 'fa-circle-check'));
    return buttons.length ? '<div class="d-flex flex-wrap gap-2">' + buttons.join('') + '</div>' : '<div class="small text-muted">No workflow action is available from this state.</div>';
  }

  function renderCaseDetail(caseId) {
    var maps = caseMaps();
    var supportCase = maps.cases.get(caseId);
    if (!supportCase) return;
    state.selectedCaseId = caseId;
    var workItem = maps.workByCase.get(caseId);
    var approval = workItem && maps.approvalByWork.get(workItem.id);
    var followup = maps.followupByCase.get(caseId);
    var goodwill = maps.goodwillByCase.get(caseId);
    byId('caseDetailReference').textContent = core.caseReference(supportCase) + ' · ' + topicLabel(supportCase.topicKey);
    byId('caseDetailTitle').textContent = supportCase.subject;
    var flags = (supportCase.sensitiveFlags || []).map(function(flag) { return '<span class="tag tag-risk">' + escapeHtml(core.SENSITIVE_FLAGS[flag] || humanize(flag)) + '</span>'; }).join('');
    var workBody = workItem ? '<div class="fw-semibold">' + escapeHtml(workItem.title) + '</div><div class="text-muted mt-1">' + escapeHtml(workItem.proposedSolution || '') + '</div>' : 'No engineering item. Likely bugs need a possible solution before automatic creation.';
    var handoffStatus = workItem && workItem.coordinatorHandoffStatus || 'not_sent';
    var handoffBody = handoffStatus === 'handed_off'
      ? '<div>Recorded ' + escapeHtml(formatDate(workItem.coordinatorHandoffAt)) + ' · brief ' + escapeHtml(String(workItem.coordinatorHandoffCount || 1)) + '</div><div class="text-muted mt-1">Audit event recorded. Manual coordinator handoff only; no agent or external action was launched.</div><button type="button" class="btn btn-outline-primary btn-sm mt-2" data-copy-coordinator-brief><i class="fas fa-copy me-1"></i>Copy latest brief</button>'
      : 'No coordinator handoff is recorded. Use the reviewed brief action to prepare and copy one manually.';
    var deployBody = approval ? '<div>Requested ' + escapeHtml(formatDate(approval.requestedAt)) + '</div>' + (approval.releaseReference ? '<div class="text-muted mt-1">Release: ' + escapeHtml(approval.releaseReference) + '</div>' : '') : 'Created only after verification evidence is recorded.';
    var followupBody = followup ? (followup.draftBody ? '<div class="text-muted">' + escapeHtml(followup.draftBody) + '</div>' : 'Waiting for verified release evidence before live-fix wording can be prepared.') : 'No release follow-up is required yet.';
    var creditBody = goodwill ? '<div>' + escapeHtml(humanize(goodwill.creditType)) + '</div><div class="text-muted mt-1">' + escapeHtml(goodwill.recommendationReason || '') + '</div>' : 'Optional. Recommendation and owner approval do not grant a credit.';
    byId('caseDetailBody').innerHTML =
      '<div class="d-flex flex-wrap gap-2 mb-3">' + improvementTag(supportCase.improvementType) + (supportCase.riskLevel !== 'low' ? '<span class="tag tag-risk">' + escapeHtml(humanize(supportCase.riskLevel)) + '</span>' : '') + flags + '</div>' +
      '<div class="mb-4">' + workflowHtml(supportCase, workItem, approval, followup) + '</div>' +
      '<div class="mb-3"><div class="detail-label mb-1">Customer report</div><div>' + escapeHtml(supportCase.summary) + '</div><div class="small text-muted mt-2">' + escapeHtml(supportCase.customerName || 'Customer not named') + (supportCase.customerEmail ? ' · ' + escapeHtml(supportCase.customerEmail) : '') + ' · ' + escapeHtml(humanize(supportCase.source)) + '</div></div>' +
      '<div class="mb-3"><div class="detail-label mb-1">Safe immediate response</div><textarea class="form-control form-control-sm" rows="5" readonly>' + escapeHtml(supportCase.immediateResponseDraft || '') + '</textarea><div class="small text-muted mt-1">Status: ' + escapeHtml(humanize(supportCase.immediateResponseStatus)) + '. Dashboard delivery: never.</div></div>' +
      '<div class="mb-3"><div class="detail-label mb-1">Current workaround</div><div class="action-card small">' + escapeHtml(supportCase.safeWorkaround || 'No safe workaround. Preserve the affected data and route for owner review.') + '</div></div>' +
      '<div class="d-grid gap-2 mb-4">' + detailStatusCard('Engineering', workItem && workItem.status, workBody) + detailStatusCard('Coordinator handoff', handoffStatus, handoffBody) + detailStatusCard('Deployment', approval && approval.status, deployBody) + detailStatusCard('Customer follow-up', followup && followup.status, followupBody) + detailStatusCard('Goodwill', goodwill && goodwill.status, creditBody) + '</div>' +
      '<div class="detail-label mb-2">Available human actions</div>' + renderActions(supportCase, workItem, approval, followup, goodwill) +
      '<div class="alert alert-light border small mt-4 mb-0"><i class="fas fa-lock me-2"></i>No action in this panel sends, deploys, or grants anything automatically.</div>';
  }

  function openCase(caseId) {
    renderCaseDetail(caseId);
    if (!state.detail) state.detail = bootstrap.Offcanvas.getOrCreateInstance(byId('caseDetail'));
    state.detail.show();
  }

  function fieldHtml(field) {
    var id = 'actionField_' + field.name;
    var value = escapeHtml(field.value || '');
    if (field.type === 'select') {
      return '<div><label class="form-label fw-semibold" for="' + id + '">' + escapeHtml(field.label) + '</label><select class="form-select" id="' + id + '" data-action-field="' + escapeHtml(field.name) + '">' + field.options.map(function(option) { return '<option value="' + escapeHtml(option.value) + '"' + (option.value === field.value ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>'; }).join('') + '</select></div>';
    }
    if (field.type === 'preview') {
      return '<div><label class="form-label fw-semibold" for="' + id + '">' + escapeHtml(field.label) + '</label><textarea class="form-control brief-preview" id="' + id + '" rows="' + (field.rows || 15) + '" readonly data-coordinator-brief-preview>' + value + '</textarea>' + (field.help ? '<div class="form-text">' + escapeHtml(field.help) + '</div>' : '') + '</div>';
    }
    if (field.type === 'textarea') {
      return '<div><label class="form-label fw-semibold" for="' + id + '">' + escapeHtml(field.label) + '</label><textarea class="form-control" id="' + id + '" data-action-field="' + escapeHtml(field.name) + '" rows="' + (field.rows || 4) + '"' + (field.required === false ? '' : ' required') + '>' + value + '</textarea>' + (field.help ? '<div class="form-text">' + escapeHtml(field.help) + '</div>' : '') + '</div>';
    }
    return '<div><label class="form-label fw-semibold" for="' + id + '">' + escapeHtml(field.label) + '</label><input class="form-control" id="' + id + '" data-action-field="' + escapeHtml(field.name) + '" value="' + value + '"' + (field.required === false ? '' : ' required') + '>' + (field.help ? '<div class="form-text">' + escapeHtml(field.help) + '</div>' : '') + '</div>';
  }

  function actionDefinition(action) {
    var maps = caseMaps();
    var supportCase = maps.cases.get(state.selectedCaseId);
    var workItem = maps.workByCase.get(state.selectedCaseId);
    var approval = workItem && maps.approvalByWork.get(workItem.id);
    var followup = maps.followupByCase.get(state.selectedCaseId);
    var goodwill = maps.goodwillByCase.get(state.selectedCaseId);
    var handoffProductImpact = supportCase && (supportCase.productImpact || supportCase.summary) || '';
    var handoffEvidenceNotes = workItem && (workItem.coordinatorNotes || workItem.implementationReference) || '';
    var handoffRequestedOutcome = 'Investigate the report, implement the smallest compatible improvement, and return focused test and local UI verification evidence.';
    var handoffBrief = core.buildCoordinatorBrief({
      supportCase: supportCase,
      workItem: workItem,
      productImpact: handoffProductImpact,
      evidenceNotes: handoffEvidenceNotes,
      requestedEngineeringOutcome: handoffRequestedOutcome
    });
    var definitions = {
      record_immediate_response: { title: 'Record reviewed response', help: 'Confirm the customer was answered outside this dashboard. Live-fix claims and release-date promises are blocked.', confirm: 'I reviewed this response and sent it manually.', submit: 'Record response', fields: [{ name: 'responseText', label: 'Customer response', type: 'textarea', rows: 7, value: supportCase && supportCase.immediateResponseDraft }] },
      start_engineering: { title: 'Start engineering work', help: 'This marks the automatically created work item in progress. It does not modify code.', confirm: 'A coordinator is taking ownership of this work.', submit: 'Start work', fields: [] },
      handoff_engineering: { title: 'Send to engineering coordinator', help: 'QuoteDr has no live Codex coordinator integration. Review this privacy-minimized brief, record the manual handoff, then copy it to the coordinator yourself. No agent or production action will launch.', confirm: 'I reviewed this exact brief and understand this records a manual coordinator handoff only.', submit: 'Record handoff', fields: [{ name: 'productImpact', label: 'Product impact', type: 'textarea', rows: 3, value: handoffProductImpact }, { name: 'evidenceNotes', label: 'Evidence, links, or internal notes', type: 'textarea', rows: 4, value: handoffEvidenceNotes, required: false, help: 'Do not add passwords, payment details, tokens, or unnecessary customer identifiers.' }, { name: 'requestedEngineeringOutcome', label: 'Requested engineering outcome', type: 'textarea', rows: 4, value: handoffRequestedOutcome }, { name: 'coordinatorBrief', label: 'Reviewable coordinator brief', type: 'preview', rows: 17, value: handoffBrief, help: 'Customer email is intentionally omitted. Copying is manual and does not start an agent.' }] },
      submit_verification: { title: 'Submit for verification', help: 'Record the implementation reference and what the verifier should check.', confirm: 'The implementation is ready for independent verification.', submit: 'Request verification', fields: [{ name: 'implementationReference', label: 'Branch, commit, or worktree reference', type: 'text' }, { name: 'coordinatorNotes', label: 'What changed and what to verify', type: 'textarea', rows: 5 }] },
      verify_work_item: { title: 'Record verification', help: 'Verification requires a summary plus concrete evidence. This creates a pending deployment approval; it never deploys.', confirm: 'I verified this evidence against the implementation.', submit: 'Mark verified', fields: [{ name: 'verificationSummary', label: 'Verification summary', type: 'textarea', rows: 4 }, { name: 'verificationEvidence', label: 'Evidence (one item per line)', type: 'textarea', rows: 5, help: 'Examples: focused test passed, browser flow verified, release artifact inspected.' }] },
      approve_deployment: { title: 'Approve deployment', help: 'This records owner approval only. The dashboard cannot execute a deployment.', confirm: 'I am the owner and approve this verified work for deployment.', submit: 'Record approval', fields: [{ name: 'decisionNote', label: 'Owner decision note', type: 'textarea', rows: 3 }] },
      decline_deployment: { title: 'Decline deployment', help: 'The work returns to engineering as blocked.', confirm: 'I am the owner and want this work revised before release.', submit: 'Decline', fields: [{ name: 'decisionNote', label: 'What must change', type: 'textarea', rows: 3 }] },
      record_deployment: { title: 'Record external deployment', help: 'Use this only after the approved release was deployed outside QuoteDr. It prepares a follow-up draft but sends nothing.', confirm: 'The verified, owner-approved release is already deployed and I checked the evidence.', submit: 'Record release', fields: [{ name: 'releaseReference', label: 'Release, commit, or deployment reference', type: 'text' }, { name: 'deploymentEvidence', label: 'How the live release was verified', type: 'textarea', rows: 4 }] },
      prepare_followup: { title: 'Prepare customer follow-up', help: 'A statement that a fix is live is blocked until verification and deployment are recorded. Owner approval is still required before manual send.', confirm: 'This draft is ready for owner review and has no unsupported promise.', submit: 'Send to owner review', fields: [{ name: 'draftBody', label: 'Follow-up draft', type: 'textarea', rows: 7, value: followup && followup.draftBody }] },
      approve_followup: { title: 'Approve customer wording', help: 'This approval is required before a live-fix statement can be recorded as sent.', confirm: 'I am the owner and approve this exact customer-facing wording.', submit: 'Approve wording', fields: [{ name: 'decisionNote', label: 'Owner note', type: 'textarea', rows: 3, value: 'Verified release and wording reviewed.' }] },
      return_followup: { title: 'Return follow-up for edits', help: 'The draft returns to the coordinator without sending.', confirm: 'I am returning this draft for revision.', submit: 'Return draft', fields: [{ name: 'decisionNote', label: 'Requested edits', type: 'textarea', rows: 3 }] },
      mark_followup_sent: { title: 'Record manual customer follow-up', help: 'Use only after the approved message was sent outside this dashboard. This closes the support loop.', confirm: 'The owner-approved wording was sent manually to the customer.', submit: 'Record sent', fields: [] },
      recommend_goodwill: { title: 'Recommend goodwill', help: 'A recommendation can be reviewed by the owner. This dashboard cannot grant a credit or change a subscription.', confirm: 'This is a recommendation only; no credit will be granted now.', submit: 'Save recommendation', fields: [{ name: 'creditType', label: 'Recommendation', type: 'select', value: 'free_pro_month', options: [{ value: 'free_pro_month', label: 'Free Pro month' }, { value: 'account_credit', label: 'Account credit' }, { value: 'other', label: 'Other goodwill' }] }, { name: 'recommendationReason', label: 'Why this is appropriate', type: 'textarea', rows: 4 }] },
      approve_goodwill: { title: 'Approve goodwill recommendation', help: 'Approval is recorded here, but the credit must still be granted manually in the appropriate account system.', confirm: 'I am the owner and approve this recommendation without granting it here.', submit: 'Approve recommendation', fields: [{ name: 'decisionNote', label: 'Owner note', type: 'textarea', rows: 3 }] },
      decline_goodwill: { title: 'Decline goodwill recommendation', help: 'No credit will be granted.', confirm: 'I am the owner and decline this recommendation.', submit: 'Decline recommendation', fields: [{ name: 'decisionNote', label: 'Owner note', type: 'textarea', rows: 3 }] },
      close_case: { title: 'Close support case', help: 'Use for non-engineering cases after a human-reviewed response and any needed follow-up.', confirm: 'The customer has a safe answer and no product-fix follow-up remains.', submit: 'Close case', fields: [] }
    };
    var definition = definitions[action];
    if (!definition) return null;
    definition.context = { supportCase: supportCase, workItem: workItem, approval: approval, followup: followup, goodwill: goodwill };
    return definition;
  }

  function currentCoordinatorBrief() {
    if (!state.pendingAction || state.pendingAction.action !== 'handoff_engineering') return '';
    var context = state.pendingAction.definition.context;
    var productImpact = byId('actionField_productImpact');
    var evidenceNotes = byId('actionField_evidenceNotes');
    var requestedOutcome = byId('actionField_requestedEngineeringOutcome');
    return core.buildCoordinatorBrief({
      supportCase: context.supportCase,
      workItem: context.workItem,
      productImpact: productImpact && productImpact.value,
      evidenceNotes: evidenceNotes && evidenceNotes.value,
      requestedEngineeringOutcome: requestedOutcome && requestedOutcome.value
    });
  }

  function refreshCoordinatorBriefPreview() {
    var preview = document.querySelector('[data-coordinator-brief-preview]');
    if (preview && state.pendingAction && state.pendingAction.action === 'handoff_engineering') {
      preview.value = currentCoordinatorBrief();
    }
  }

  function openAction(action) {
    var definition = actionDefinition(action);
    if (!definition) return;
    state.pendingAction = { action: action, definition: definition };
    byId('actionModalEyebrow').textContent = /approve|decline|return/.test(action) ? 'Owner gate' : 'Human action';
    byId('actionModalTitle').textContent = definition.title;
    byId('actionModalHelp').textContent = definition.help;
    byId('actionFields').innerHTML = definition.fields.map(fieldHtml).join('');
    byId('actionConfirmation').checked = false;
    byId('actionConfirmationLabel').textContent = definition.confirm;
    byId('actionSubmit').textContent = definition.submit;
    byId('actionSubmit').disabled = false;
    byId('actionStatus').textContent = '';
    byId('actionCopyBrief').classList.toggle('d-none', action !== 'handoff_engineering');
    byId('actionCopyBrief').dataset.recorded = 'false';
    if (action === 'handoff_engineering') refreshCoordinatorBriefPreview();
    if (!state.actionModal) state.actionModal = bootstrap.Modal.getOrCreateInstance(byId('actionModal'));
    state.actionModal.show();
  }

  function actionPayload(action, fields, context) {
    var supportCase = context.supportCase;
    var workItem = context.workItem;
    var approval = context.approval;
    var followup = context.followup;
    var goodwill = context.goodwill;
    if (action === 'record_immediate_response') return { caseId: supportCase.id, responseText: fields.responseText };
    if (action === 'start_engineering') return { workItemId: workItem.id };
    if (action === 'handoff_engineering') return { workItemId: workItem.id, productImpact: fields.productImpact, evidenceNotes: fields.evidenceNotes, requestedEngineeringOutcome: fields.requestedEngineeringOutcome, humanReviewed: true };
    if (action === 'submit_verification') return { workItemId: workItem.id, implementationReference: fields.implementationReference, coordinatorNotes: fields.coordinatorNotes };
    if (action === 'verify_work_item') return { workItemId: workItem.id, verificationSummary: fields.verificationSummary, verificationEvidence: String(fields.verificationEvidence || '').split(/\r?\n/).map(function(item) { return item.trim(); }).filter(Boolean) };
    if (action === 'approve_deployment' || action === 'decline_deployment') return { approvalId: approval.id, decision: action === 'approve_deployment' ? 'approve' : 'decline', decisionNote: fields.decisionNote };
    if (action === 'record_deployment') return { approvalId: approval.id, releaseReference: fields.releaseReference, deploymentEvidence: fields.deploymentEvidence };
    if (action === 'prepare_followup') return { caseId: supportCase.id, draftBody: fields.draftBody, claimsFixLive: core.containsLiveFixClaim(fields.draftBody) };
    if (action === 'approve_followup' || action === 'return_followup') return { followupId: followup.id, decision: action === 'approve_followup' ? 'approve' : 'return', decisionNote: fields.decisionNote };
    if (action === 'mark_followup_sent') return { followupId: followup.id };
    if (action === 'recommend_goodwill') return { caseId: supportCase.id, creditType: fields.creditType, recommendationReason: fields.recommendationReason };
    if (action === 'approve_goodwill' || action === 'decline_goodwill') return { recommendationId: goodwill.id, decision: action === 'approve_goodwill' ? 'approve' : 'decline', decisionNote: fields.decisionNote };
    if (action === 'close_case') return { caseId: supportCase.id };
    return {};
  }

  function endpointAction(action) {
    if (action === 'approve_deployment' || action === 'decline_deployment') return 'decide_deployment';
    if (action === 'approve_followup' || action === 'return_followup') return 'decide_followup';
    if (action === 'approve_goodwill' || action === 'decline_goodwill') return 'decide_goodwill';
    return action;
  }

  function simulateAction(action, payload, context) {
    var now = new Date().toISOString();
    var supportCase = context.supportCase;
    var workItem = context.workItem;
    var approval = context.approval;
    var followup = context.followup;
    var goodwill = context.goodwill;
    var result = {};
    if (action === 'record_immediate_response') { supportCase.immediateResponseDraft = payload.responseText; supportCase.immediateResponseStatus = 'sent'; supportCase.firstResponseAt = now; supportCase.workflowStage = workItem ? 'engineering' : 'follow_up'; }
    if (action === 'start_engineering') { workItem.status = 'in_progress'; workItem.startedAt = now; supportCase.workflowStage = 'engineering'; }
    if (action === 'handoff_engineering') {
      var coordinatorBrief = core.buildCoordinatorBrief({ supportCase: supportCase, workItem: workItem, productImpact: payload.productImpact, evidenceNotes: payload.evidenceNotes, requestedEngineeringOutcome: payload.requestedEngineeringOutcome });
      workItem.coordinatorHandoffStatus = 'handed_off';
      workItem.coordinatorHandoffAt = now;
      workItem.coordinatorHandoffByEmail = 'local-demo@quotedr.test';
      workItem.coordinatorHandoffCount = Number(workItem.coordinatorHandoffCount || 0) + 1;
      workItem.coordinatorBrief = coordinatorBrief;
      workItem.coordinatorBriefPayload = { productImpact: payload.productImpact, evidenceNotes: payload.evidenceNotes, requestedEngineeringOutcome: payload.requestedEngineeringOutcome };
      state.overview.events.unshift({ id: 'demo-handoff-event-' + Date.now(), caseId: supportCase.id, workItemId: workItem.id, eventType: 'engineering_coordinator_handoff_recorded', actorEmail: 'local-demo@quotedr.test', details: { handoffCount: workItem.coordinatorHandoffCount, externalDeliveryPerformed: false, agentLaunched: false }, occurredAt: now });
      result = { coordinatorBrief: coordinatorBrief, coordinatorHandoffRecorded: true, externalDeliveryPerformed: false, agentLaunched: false };
    }
    if (action === 'submit_verification') { workItem.status = 'verification_pending'; workItem.implementationReference = payload.implementationReference; workItem.coordinatorNotes = payload.coordinatorNotes; supportCase.workflowStage = 'verification'; }
    if (action === 'verify_work_item') {
      workItem.status = 'verified'; workItem.verificationSummary = payload.verificationSummary; workItem.verificationEvidence = payload.verificationEvidence; workItem.verifiedAt = now; supportCase.workflowStage = 'deploy_approval';
      approval = { id: 'demo-deploy-' + Date.now(), workItemId: workItem.id, status: 'pending', requestedAt: now, createdAt: now, updatedAt: now };
      state.overview.deployApprovals.push(approval);
    }
    if (action === 'approve_deployment' || action === 'decline_deployment') { approval.status = payload.decision === 'approve' ? 'approved' : 'declined'; approval.decisionAt = now; approval.decisionNote = payload.decisionNote; if (approval.status === 'declined') { workItem.status = 'blocked'; supportCase.workflowStage = 'engineering'; } }
    if (action === 'record_deployment') { approval.deployedAt = now; approval.releaseReference = payload.releaseReference; approval.deploymentEvidence = payload.deploymentEvidence; followup.status = 'owner_review'; followup.claimsFixLive = true; followup.draftBody = 'Hi ' + (supportCase.customerName || 'there').split(/\s+/)[0] + ', the update for “' + supportCase.subject + '” has been verified and released. Thank you for helping us catch it.'; supportCase.workflowStage = 'follow_up'; }
    if (action === 'prepare_followup') { followup.status = 'owner_review'; followup.draftBody = payload.draftBody; followup.claimsFixLive = payload.claimsFixLive; }
    if (action === 'approve_followup' || action === 'return_followup') { followup.status = payload.decision === 'approve' ? 'approved' : 'draft'; followup.ownerDecisionNote = payload.decisionNote; if (payload.decision === 'approve') followup.ownerApprovedAt = now; }
    if (action === 'mark_followup_sent') { followup.status = 'sent'; followup.sentAt = now; supportCase.workflowStage = 'closed'; supportCase.closedAt = now; }
    if (action === 'recommend_goodwill') { state.overview.goodwillRecommendations.push({ id: 'demo-credit-' + Date.now(), caseId: supportCase.id, creditType: payload.creditType, recommendationReason: payload.recommendationReason, status: 'recommended', createdAt: now }); }
    if (action === 'approve_goodwill' || action === 'decline_goodwill') { goodwill.status = payload.decision === 'approve' ? 'approved' : 'declined'; goodwill.decisionNote = payload.decisionNote; }
    if (action === 'close_case') { supportCase.workflowStage = 'closed'; supportCase.closedAt = now; }
    supportCase.updatedAt = now;
    state.overview.generatedAt = now;
    state.overview.metrics = core.calculateMetrics(state.overview);
    return result;
  }

  async function submitAction(event) {
    event.preventDefault();
    if (!state.pendingAction) return;
    var confirmation = byId('actionConfirmation');
    if (!confirmation.checked) {
      byId('actionStatus').className = 'small mt-3 text-danger';
      byId('actionStatus').textContent = 'Confirm the human-review statement before continuing.';
      return;
    }
    var fields = {};
    document.querySelectorAll('[data-action-field]').forEach(function(input) { fields[input.getAttribute('data-action-field')] = input.value; });
    var pending = state.pendingAction;
    if (pending.action === 'record_immediate_response' && core.containsLiveFixClaim(fields.responseText)) {
      byId('actionStatus').className = 'small mt-3 text-danger';
      byId('actionStatus').textContent = 'An immediate response cannot claim that a fix is live.';
      return;
    }
    if ((pending.action === 'record_immediate_response' || pending.action === 'prepare_followup') && core.containsReleaseDatePromise(pending.action === 'record_immediate_response' ? fields.responseText : fields.draftBody)) {
      byId('actionStatus').className = 'small mt-3 text-danger';
      byId('actionStatus').textContent = 'Remove the unverified release-date promise before continuing.';
      return;
    }
    var payload = actionPayload(pending.action, fields, pending.definition.context);
    var button = byId('actionSubmit');
    button.disabled = true;
    byId('actionStatus').className = 'small mt-3 text-muted';
    byId('actionStatus').textContent = 'Saving reviewed workflow state…';
    var completedHandoff = false;
    try {
      var operationResult;
      if (state.demo) {
        operationResult = simulateAction(pending.action, payload, pending.definition.context);
      } else {
        operationResult = await callOperations(endpointAction(pending.action), payload);
        await loadOverview({ silent: true });
      }
      if (state.demo) renderAll();
      if (pending.action === 'handoff_engineering') {
        var recordedBrief = operationResult && operationResult.coordinatorBrief || currentCoordinatorBrief();
        var briefPreview = document.querySelector('[data-coordinator-brief-preview]');
        if (briefPreview) briefPreview.value = recordedBrief;
        byId('actionStatus').className = 'small mt-3 text-success';
        byId('actionStatus').textContent = 'Coordinator handoff recorded. Copy the reviewed brief and paste it into the coordinator task manually; no agent or external action was launched.';
        byId('actionCopyBrief').dataset.recorded = 'true';
        byId('actionSubmit').textContent = 'Handoff recorded';
        renderCaseDetail(state.selectedCaseId);
        completedHandoff = true;
        return;
      }
      byId('actionStatus').className = 'small mt-3 text-success';
      byId('actionStatus').textContent = state.demo ? 'Demo workflow updated locally.' : 'Workflow updated. No external action was performed.';
      setTimeout(function() {
        state.actionModal.hide();
        renderCaseDetail(state.selectedCaseId);
      }, 450);
    } catch (error) {
      byId('actionStatus').className = 'small mt-3 text-danger';
      byId('actionStatus').textContent = error.message || 'Could not update this workflow.';
    } finally {
      if (!completedHandoff) button.disabled = false;
    }
  }

  function collectNewCaseForm() {
    var form = byId('newCaseForm');
    var data = new FormData(form);
    return {
      source: data.get('source'),
      customerName: data.get('customerName'),
      customerEmail: data.get('customerEmail'),
      subject: data.get('subject'),
      summary: data.get('summary'),
      topicKey: data.get('topicKey'),
      improvementType: data.get('improvementType'),
      isLikelyBug: byId('likelyBug').checked,
      possibleSolution: data.get('possibleSolution'),
      safeWorkaround: data.get('safeWorkaround'),
      sensitiveFlags: Array.from(document.querySelectorAll('[name="sensitiveFlags"]:checked')).map(function(input) { return input.value; })
    };
  }

  function addDemoCase(payload) {
    var now = new Date().toISOString();
    var nextNumber = Math.max.apply(Math, (state.overview.cases || []).map(function(item) { return Number(item.caseNumber) || 0; }).concat([1000])) + 1;
    var caseId = 'demo-case-' + Date.now();
    var riskLevel = payload.sensitiveFlags.indexOf('data_loss') !== -1 || payload.sensitiveFlags.indexOf('broad_incident') !== -1 ? 'critical' : payload.sensitiveFlags.length ? 'sensitive' : 'low';
    var likelyBug = payload.improvementType === 'bug' || payload.isLikelyBug;
    var supportCase = {
      id: caseId,
      caseNumber: nextNumber,
      source: payload.source,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      subject: payload.subject,
      summary: payload.summary,
      topicKey: payload.topicKey,
      improvementType: payload.improvementType,
      riskLevel: riskLevel,
      sensitiveFlags: payload.sensitiveFlags,
      workflowStage: 'intake',
      isLikelyBug: likelyBug,
      possibleSolution: payload.possibleSolution,
      safeWorkaround: payload.safeWorkaround,
      immediateResponseDraft: core.buildImmediateResponseDraft(payload),
      immediateResponseStatus: 'ready_for_human_review',
      humanReviewRequired: true,
      ownerReviewRequired: payload.sensitiveFlags.length > 0 || !payload.safeWorkaround,
      createdAt: now,
      updatedAt: now
    };
    state.overview.cases.unshift(supportCase);
    if (likelyBug && String(payload.possibleSolution || '').trim()) {
      var workId = 'demo-work-' + Date.now();
      state.overview.workItems.unshift({ id: workId, caseId: caseId, title: 'Investigate: ' + payload.subject, problemStatement: payload.summary, proposedSolution: payload.possibleSolution, status: 'queued', automaticallyCreated: true, coordinatorHandoffStatus: 'not_sent', coordinatorHandoffCount: 0, coordinatorBrief: '', createdAt: now, updatedAt: now });
      state.overview.followups.unshift({ id: 'demo-follow-' + Date.now(), caseId: caseId, workItemId: workId, status: 'waiting_on_release', draftBody: '', claimsFixLive: false, createdAt: now, updatedAt: now });
    }
    state.overview.generatedAt = now;
    state.overview.metrics = core.calculateMetrics(state.overview);
    return supportCase;
  }

  async function submitNewCase(event) {
    event.preventDefault();
    var payload = collectNewCaseForm();
    var status = byId('newCaseStatus');
    var button = byId('createCaseSubmit');
    button.disabled = true;
    status.className = 'small text-muted me-auto';
    status.textContent = 'Preparing safe intake…';
    try {
      var created;
      if (state.demo) {
        created = addDemoCase(payload);
        renderAll();
      } else {
        var result = await callOperations('create_case', payload);
        created = result.case;
        await loadOverview({ silent: true });
      }
      status.className = 'small text-success me-auto';
      status.textContent = 'Case created. Nothing was sent.';
      setTimeout(function() {
        state.newCaseModal.hide();
        byId('newCaseForm').reset();
        openCase(created.id);
      }, 450);
    } catch (error) {
      status.className = 'small text-danger me-auto';
      status.textContent = error.message || 'Could not create this case.';
    } finally {
      button.disabled = false;
    }
  }

  function populateIntakeOptions() {
    byId('caseTopic').innerHTML = Object.keys(core.TOPICS).map(function(key) { return '<option value="' + escapeHtml(key) + '">' + escapeHtml(core.TOPICS[key]) + '</option>'; }).join('');
    byId('caseTopic').value = 'support_feedback';
    byId('sensitiveFlagOptions').innerHTML = Object.keys(core.SENSITIVE_FLAGS).map(function(key) {
      var id = 'sensitive_' + key;
      return '<div class="col-sm-6 col-lg-4"><div class="form-check"><input class="form-check-input" type="checkbox" name="sensitiveFlags" value="' + escapeHtml(key) + '" id="' + id + '"><label class="form-check-label small" for="' + id + '">' + escapeHtml(core.SENSITIVE_FLAGS[key]) + '</label></div></div>';
    }).join('');
  }

  function bindEvents() {
    byId('refreshButton').addEventListener('click', function() { loadOverview().catch(function(error) { window.alert(error.message || 'Could not refresh AI Operations.'); }); });
    byId('newCaseButton').addEventListener('click', function() {
      byId('newCaseStatus').textContent = '';
      if (!state.newCaseModal) state.newCaseModal = bootstrap.Modal.getOrCreateInstance(byId('newCaseModal'));
      state.newCaseModal.show();
    });
    byId('newCaseForm').addEventListener('submit', submitNewCase);
    byId('actionForm').addEventListener('submit', submitAction);
    byId('actionFields').addEventListener('input', function() {
      if (state.pendingAction && state.pendingAction.action === 'handoff_engineering') refreshCoordinatorBriefPreview();
    });
    byId('actionCopyBrief').addEventListener('click', async function() {
      try {
        await copyText(document.querySelector('[data-coordinator-brief-preview]') && document.querySelector('[data-coordinator-brief-preview]').value);
        byId('actionStatus').className = 'small mt-3 text-success';
        byId('actionStatus').textContent = this.dataset.recorded === 'true'
          ? 'Recorded brief copied. Paste it into the engineering coordinator task manually.'
          : 'Draft brief copied. This does not record a handoff; use Record handoff after review.';
      } catch (error) {
        byId('actionStatus').className = 'small mt-3 text-danger';
        byId('actionStatus').textContent = error.message || 'Could not copy the coordinator brief.';
      }
    });
    document.addEventListener('click', async function(event) {
      var caseButton = event.target.closest('[data-open-case]');
      if (caseButton) { openCase(caseButton.getAttribute('data-open-case')); return; }
      var copyBriefButton = event.target.closest('[data-copy-coordinator-brief]');
      if (copyBriefButton) {
        var maps = caseMaps();
        var latestWorkItem = maps.workByCase.get(state.selectedCaseId);
        try {
          await copyText(latestWorkItem && latestWorkItem.coordinatorBrief);
          copyBriefButton.innerHTML = '<i class="fas fa-check me-1"></i>Brief copied';
        } catch (error) {
          window.alert(error.message || 'Could not copy the coordinator brief.');
        }
        return;
      }
      var actionButton = event.target.closest('[data-workflow-action]');
      if (actionButton) openAction(actionButton.getAttribute('data-workflow-action'));
    });
    byId('improvementType').addEventListener('change', function() {
      if (this.value === 'bug') byId('likelyBug').checked = true;
    });
  }

  async function init() {
    if (!core) {
      showAccessError('The AI Operations workflow module did not load.');
      return;
    }
    populateIntakeOptions();
    bindEvents();
    state.demo = wantsLocalDemo();
    if (state.demo) {
      state.overview = core.createDemoOverview();
      state.overview.role = { email: 'local-demo@quotedr.test', owner: true };
      byId('demoBanner').classList.remove('d-none');
      byId('demoBanner').classList.add('d-flex');
      showApp();
      renderAll();
      return;
    }
    try {
      var sessionResult = await window._supabase.auth.getSession();
      var session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (!session) {
        window.location.href = 'login.html';
        return;
      }
      state.user = session.user;
      window.currentUser = session.user;
      if (!window.QuoteDrAdmin || !window.QuoteDrAdmin.isAdminUser(session.user)) {
        showAccessError('Your signed-in account does not have QuoteDr administrator access.');
        return;
      }
      showApp();
      await loadOverview();
    } catch (error) {
      showAccessError(error.message || 'AI Operations could not be loaded.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
