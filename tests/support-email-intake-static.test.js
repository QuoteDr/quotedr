const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const intake = read('supabase/functions/support-intake/index.ts');
const adapter = read('supabase/functions/_shared/support-agent-adapter.ts');
const migration = read('supabase/migrations/20260811031843_support_email_intake.sql');
const dashboard = read('ai-operations.js');
const settings = read('settings.html');
const config = read('supabase/config.toml');
const guide = read('docs/support-email-intake-owner-setup.md');

assert(intake.includes("x-quotedr-intake-signature") && intake.includes('hmacMatches(raw'), 'email webhook must verify an exact-body HMAC signature');
assert(intake.includes("ALLOWED_RECIPIENTS = new Set(['support@quotedr.io', 'feedback@quotedr.io'])"), 'only the two existing support aliases may enter email intake');
assert(intake.includes("state: 'duplicate'") && intake.includes('delivery_key') && intake.includes('intakeKey'), 'provider replay and case creation must be idempotent');
assert(intake.includes('sanitizeHtml') && intake.includes('privacyMinimize') && intake.includes('trimQuotedText') && intake.includes('quoted_text') && intake.includes('content_stored: false'), 'HTML and case text must be sanitized/minimized, quoted evidence preserved, and attachments metadata only');
assert(intake.includes('CROSS_ACCOUNT_DENIED') && intake.includes('ADMIN_REQUIRED') && intake.includes('OWNER_REQUIRED'), 'feedback, raw-message view, and retention purge must have strict access checks');
assert(adapter.includes("SUPPORT_AGENT_ADAPTER_VERSION = 'support-agent/v1'") && adapter.includes('SUPPORT_AGENT_NOT_CONFIGURED') && !adapter.includes('fetch('), 'agent adapter must be versioned, fail clearly, and have no unreviewed live egress');
assert(migration.includes('enable row level security') && migration.includes('revoke all on table public.ai_support_raw_messages from public, anon, authenticated'), 'raw-message records must be RLS enabled with no browser grants');
assert(migration.includes('unique(provider, provider_message_id)') && migration.includes("interval '90 days'"), 'raw data needs provider dedupe and an explicit retention default');
assert(dashboard.includes('Original customer message') && dashboard.includes('Recommended response (editable, never auto-sent)') && dashboard.includes('Engineering handoff (privacy-minimized)'), 'dashboard must visibly separate raw, recommended response, and redacted handoff');
assert(dashboard.includes('ops-action-button') && dashboard.includes('Restricted intake identity held in the original-message record'), 'intake controls must be touch-safe and restricted identities must not escape the raw-message panel');
assert(read('ai-operations.html').includes('min-height: 44px') && read('ai-operations.html').includes('overflow-x: clip'), 'AI Operations detail panel must prevent horizontal overflow while keeping 44px action targets');
assert(settings.includes("action: 'ingest_feedback'") && settings.includes("action: 'insert'") && settings.includes('send-feedback-email'), 'in-app feedback must preserve save and alert while adding idempotent intake');
assert(/\[functions\.support-intake\]\s*verify_jwt\s*=\s*false/.test(config), 'email bridge endpoint must be reachable for its internal HMAC verification');
assert(guide.includes('gmail.readonly') && guide.includes('Pub/Sub') && guide.includes('HTML, JavaScript'), 'owner guide must minimize Gmail scope and keep secrets out of browser code');
console.log('support email intake static checks passed');
