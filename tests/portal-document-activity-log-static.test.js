const assert = require('node:assert');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const migration = read('supabase/migrations/20260621143000_portal_document_events.sql');
const edgeSource = read('supabase/functions/client-document/index.ts');
const supabaseSource = read('supabase-v2.js');
const portalSource = read('client-portal.html');
const quoteViewerSource = read('interactive-quote-viewer.html');
const invoiceViewerSource = read('invoice-viewer.html');

assert(migration.includes('create table if not exists public.portal_document_events'), 'migration should create portal_document_events');
assert(migration.includes('event_type text not null'), 'activity events should store event_type');
assert(migration.includes('session_id text not null'), 'activity events should store session_id');
assert(migration.includes('duration_seconds integer'), 'activity events should store duration_seconds');
assert(migration.includes('metadata jsonb not null default'), 'activity events should store JSON metadata');
assert(migration.includes('alter table public.portal_document_events enable row level security'), 'activity table should enable RLS');
assert(migration.includes('revoke all on public.portal_document_events from anon, public'), 'activity table should not be directly readable by public clients');
assert(migration.includes('(select auth.uid()) = user_id'), 'contractors should only read their own activity events');

assert(edgeSource.includes('PortalDocumentEventRow'), 'client-document function should type activity rows');
assert(edgeSource.includes('ALLOWED_DOCUMENT_EVENT_TYPES'), 'client-document function should allowlist activity event types');
assert(edgeSource.includes('logDocumentEvent'), 'client-document function should accept secure log_event calls');
assert(edgeSource.includes('documentActivity'), 'client-document function should expose admin document_activity reads');
assert(edgeSource.includes('action === "log_event"'), 'client-document function should route log_event');
assert(edgeSource.includes('action === "document_activity"'), 'client-document function should route document_activity');
assert(edgeSource.includes('skipped: "owner_activity"'), 'owner/admin previews should not count as client activity');
assert(edgeSource.includes('isAdminPreviewActivityRequest') && edgeSource.includes('skipped: "admin_preview_activity"'), 'admin preview activity requests should not create portal events');
assert(edgeSource.includes('.from("portal_document_events")'), 'client-document function should write/read portal_document_events');
assert(edgeSource.includes('document_opened') && edgeSource.includes('pdf_opened') && edgeSource.includes('payment_clicked'), 'activity event allowlist should include core client events');

assert(supabaseSource.includes('logSecureClientDocumentEvent'), 'supabase helpers should expose event logging');
assert(supabaseSource.includes('loadSecureClientDocumentActivity'), 'supabase helpers should expose admin activity loading');
assert(supabaseSource.includes('keepalive'), 'activity logging should support pagehide keepalive delivery');

assert(quoteViewerSource.includes('initPortalDocumentActivityTracking'), 'quote viewer should initialize activity tracking');
assert(quoteViewerSource.includes('document_opened'), 'quote viewer should log document_opened');
assert(/function logPortalDocumentActivity[\s\S]*isContractorPreviewView\(new URLSearchParams\(window\.location\.search\)\)/.test(quoteViewerSource), 'quote viewer should not log activity in admin preview mode');
assert(quoteViewerSource.includes('document_view_duration'), 'quote viewer should log active viewing duration');
assert(quoteViewerSource.includes('visibilitychange') && quoteViewerSource.includes('pagehide'), 'quote viewer should pause/flush active-time tracking');
assert(quoteViewerSource.includes('signature_started') && quoteViewerSource.includes('document_signed'), 'quote viewer should log signature events');

assert(invoiceViewerSource.includes('initPortalDocumentActivityTracking'), 'invoice viewer should initialize activity tracking');
assert(invoiceViewerSource.includes('document_opened'), 'invoice viewer should log document_opened');
assert(/function logPortalDocumentActivity[\s\S]*isContractorPreviewView\(new URLSearchParams\(window\.location\.search\)\)/.test(invoiceViewerSource), 'invoice viewer should not log activity in admin preview mode');
assert(invoiceViewerSource.includes('payment_clicked'), 'invoice viewer should log payment clicks');
assert(invoiceViewerSource.includes('pdf_opened'), 'invoice viewer should log PDF/print opens');

assert(portalSource.includes('Activity'), 'client portal should render an admin activity action');
assert(portalSource.includes('loadPortalDocumentActivity'), 'client portal should lazy-load document activity');
assert(portalSource.includes('renderPortalDocumentActivityPanel'), 'client portal should render activity panels');
assert(portalSource.includes('portalDocumentActivitySummary'), 'client portal should summarize activity');
assert(portalSource.includes('portalDocumentActivityTimeline'), 'client portal should combine heartbeat durations into viewing sessions');
assert(portalSource.includes('view.duration_seconds +='), 'viewing sessions should accumulate duration heartbeat seconds');
assert(portalSource.includes('For security and service quality, document access may be logged.'), 'client portal should show the client logging notice');
assert(portalSource.includes('pdf_opened'), 'portal PDF sharing flow should log PDF opens');

console.log('portal document activity log static test passed');
