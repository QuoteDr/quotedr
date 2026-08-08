#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Single-run local bridge for the privacy-minimized AI Operations coordinator
// inbox. It makes exactly one HTTP request per invocation and never starts a
// polling loop, launches an agent, or performs Git/release operations.

const COMMAND_ACTIONS = Object.freeze({
  poll: 'poll',
  claim: 'claim',
  heartbeat: 'heartbeat',
  review: 'record_review',
  outcome: 'record_outcome',
  'cancel-test': 'cancel_synthetic_test',
  'send-test-email': 'send_synthetic_test_notification',
  'confirm-test-email': 'confirm_synthetic_test_notification',
  'owner-decision': 'record_owner_decision',
});

const BOOLEAN_FLAGS = new Set([
  'owner-review-repeated', 'risk-checks-completed', 'privacy-review-repeated',
  'brief-reviewed', 'evidence-reviewed', 'blast-radius-reviewed',
  'task-created-outside-dashboard', 'local-only', 'no-customer-data-included',
  'owner-approved-synthetic-cleanup', 'owner-authorized-single-test-email',
  'synthetic-dashboard-flow-passed', 'dry-run-gates-passed',
  'owner-confirmed-inbox-receipt',
]);

const FALSE_FLAGS = new Set(['deployment-authorized', 'agent-launched']);

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function parseArguments(argv) {
  const [command = '', ...rest] = argv;
  if (!COMMAND_ACTIONS[command]) throw new Error(`Unsupported command: ${command || '(missing)'}`);
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const key = camelCase(name);
    if (BOOLEAN_FLAGS.has(name)) {
      values[key] = true;
      continue;
    }
    if (FALSE_FLAGS.has(name)) {
      values[key] = false;
      continue;
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`Missing value for --${name}`);
    values[key] = next;
    index += 1;
  }
  if (values.limit !== undefined) values.limit = Number(values.limit);
  if (values.retryAfterMinutes !== undefined) values.retryAfterMinutes = Number(values.retryAfterMinutes);
  return { command, action: COMMAND_ACTIONS[command], values };
}

export function buildRequest(argv) {
  const parsed = parseArguments(argv);
  return { action: parsed.action, ...parsed.values };
}

export async function callCoordinator({ endpoint, token, body, fetchImpl = fetch }) {
  if (!/^https:\/\/[^\s]+$/.test(String(endpoint || ''))) throw new Error('QUOTEDR_COORDINATOR_ENDPOINT must be HTTPS');
  if (String(token || '').length < 43) throw new Error('QUOTEDR_COORDINATOR_TOKEN is missing or too short');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = { error: 'Coordinator returned an invalid JSON response' }; }
  if (!response.ok) {
    const error = new Error(payload?.error || `Coordinator request failed (${response.status})`);
    error.status = response.status;
    error.code = payload?.code || 'coordinator_request_failed';
    throw error;
  }
  return payload;
}

export function renderReviewableBrief(payload) {
  const requests = Array.isArray(payload?.requests)
    ? payload.requests
    : payload?.request ? [payload.request] : [];
  if (!requests.length) return 'AI Operations coordinator inbox: no reviewable requests.';
  return requests.map((request) => {
    const caseInfo = request?.task_payload?.case || {};
    const classification = request?.task_payload?.classification || {};
    return [
      `# ${caseInfo.reference || 'Coordinator request'} — ${caseInfo.subject || 'Untitled'}`,
      '',
      `- Inbox ID: ${request.id}`,
      `- Queue state: ${request.state}`,
      `- Risk: ${classification.risk_level || 'unknown'}`,
      `- Improvement type: ${classification.improvement_type || 'unknown'}`,
      '- Privacy minimized: yes',
      '- Owner confirmed: yes',
      '- Deployment authorized: no',
      '',
      request.task_brief || 'No brief was returned.',
    ].join('\n');
  }).join('\n\n---\n\n');
}

function isDirectRun() {
  const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
  return import.meta.url.toLowerCase() === invoked.toLowerCase();
}

if (isDirectRun()) {
  try {
    const body = buildRequest(process.argv.slice(2));
    const payload = await callCoordinator({
      endpoint: process.env.QUOTEDR_COORDINATOR_ENDPOINT,
      token: process.env.QUOTEDR_COORDINATOR_TOKEN,
      body,
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    if (body.action === 'poll' || body.action === 'claim') {
      process.stdout.write(`\n${renderReviewableBrief(payload)}\n`);
    }
  } catch (error) {
    const safe = {
      error: String(error?.message || 'Coordinator command failed'),
      code: String(error?.code || 'local_coordinator_error'),
      status: Number(error?.status || 1),
    };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  }
}
