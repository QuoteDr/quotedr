const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20260623000000_client_activity_notifications.sql', 'utf8');
const clientDocument = fs.readFileSync('supabase/functions/client-document/index.ts', 'utf8');
const supabaseV2 = fs.readFileSync('supabase-v2.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const viewer = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const invoiceViewer = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  migration.includes('create table if not exists public.client_activity_events') &&
  migration.includes('create table if not exists public.client_notification_preferences') &&
  migration.includes('Users can view own client activity events') &&
  migration.includes('Users can manage own client notification preferences'),
  'Migration should create activity event and notification preference tables with owner RLS'
);

assert(
  clientDocument.includes('async function recordClientActivity') &&
  clientDocument.includes('async function maybeSendClientActivityEmail') &&
  clientDocument.includes('event_type: eventType') &&
  clientDocument.includes('email_on_viewed') &&
  clientDocument.includes('action === "mark_viewed"') &&
  clientDocument.includes('recordClientActivity(supabase, updatedRow, "viewed"') &&
  clientDocument.includes('recordClientActivity(supabase, updatedRow, status === "approved" ? "approved" : "accepted"') &&
  clientDocument.includes('recordClientActivity(supabase, updatedRow, "declined"'),
  'Secure client-document function should record and email viewed/accepted/declined client activity'
);

assert(
  clientDocument.includes('recordClientActivity(supabase, target, "viewed"') &&
  clientDocument.includes('source: "portal_document_event"'),
  'Portal document_opened activity should feed the viewed email alert stream'
);

assert(
  clientDocument.includes('unchanged_status') &&
  clientDocument.includes('recordClientActivity(supabase, target, "viewed"'),
  'mark_viewed should still record a deduped viewed alert when the quote status is already past sent'
);

assert(
  clientDocument.includes('email_on_viewed: true') &&
  supabaseV2.includes('email_on_viewed: true'),
  'Client open email alerts should default on when no preference row exists'
);

assert(
  clientDocument.includes('detectClientNoteActivity') &&
  clientDocument.includes('recordClientActivity(supabase, updatedRow, "note_added"'),
  'Secure client-document function should record client note activity'
);

assert(
  supabaseV2.includes('async function loadClientActivityEvents') &&
  supabaseV2.includes('async function markClientActivityEventsRead') &&
  supabaseV2.includes('async function loadClientNotificationPreferences') &&
  supabaseV2.includes('async function saveClientNotificationPreferences'),
  'Supabase browser helper should expose activity list, read receipt, and preference APIs'
);

assert(
  dashboard.includes('id="clientActivityAlertBtn"') &&
  dashboard.includes('id="clientActivityModal"') &&
  dashboard.includes('function openClientActivityAlerts') &&
  dashboard.includes('function renderClientActivityEvents') &&
  dashboard.includes('function saveClientActivityPrefs') &&
  dashboard.includes('refreshClientActivityAlerts();'),
  'Dashboard should include an activity alert center with preferences'
);

assert(
  viewer.includes('isContractorPreviewView(params)') &&
  viewer.includes('if (isPreview) return;') &&
  viewer.includes("updateSecureClientDocument(quoteId, token, 'mark_viewed'"),
  'Client viewer should not mark contractor previews as viewed'
);

assert(
  invoiceViewer.includes('function markInvoiceViewed') &&
  invoiceViewer.includes('isInvoiceContractorPreviewView(params)') &&
  invoiceViewer.includes("updateSecureClientDocument(invoiceId, token, 'mark_viewed'") &&
  invoiceViewer.includes('markInvoiceViewed(supabaseId);'),
  'Invoice viewer should mark real client invoice opens without counting contractor previews'
);
