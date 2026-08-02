const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const adminAccess = read('admin-access.js');
const dashboard = read('dashboard.html');
const settings = read('settings.html');
const config = read('supabase/config.toml');
const coordinator = read('save-coordinator.js');
const analyticsBrief = read('supabase/functions/analytics-brief/index.ts');
const analyticsTraffic = read('supabase/functions/analytics-traffic/index.ts');
const feedbackEmail = read('supabase/functions/send-feedback-email/index.ts');
const quoteFollowup = read('supabase/functions/quote-followup/index.ts');
const quoteEmail = read('supabase/functions/send-quote-email/index.ts');
const welcomeEmail = read('supabase/functions/send-welcome-email/index.ts');
const trialFollowup = read('supabase/functions/pro-trial-followup/index.ts');
const saveRecovery = read('supabase/functions/save-recovery/index.ts');
const visitorAlert = read('supabase/functions/visitor-alert/index.ts');
const migration = read('supabase/migrations/20260802005740_add_admin_email_routing.sql');
const contact = read('contact.html');
const privacy = read('privacy.html');
const gitignore = read('.gitignore');

for (const source of [adminAccess, dashboard, settings, coordinator, analyticsBrief, analyticsTraffic, saveRecovery, visitorAlert, migration]) {
  assert(source.includes('admin@quotedr.io'), 'administrator access and alerts should include admin@quotedr.io');
}

assert(
  analyticsTraffic.includes("Deno.env.get('QUOTEDR_ADMIN_EMAILS')") &&
    visitorAlert.includes("Deno.env.get('VISITOR_ALERT_EMAIL') ?? 'admin@quotedr.io'"),
  'Traffic analytics should accept the configured admin list and alerts should default to the QuoteDr admin mailbox'
);

assert(
  feedbackEmail.includes("to: [ADMIN_EMAIL]") &&
    feedbackEmail.includes("QUOTEDR_ADMIN_EMAIL") &&
    feedbackEmail.includes("reply_to: isValidEmail(rawUserEmail)") &&
    feedbackEmail.includes("escapeHtml(rawDescription)") &&
    feedbackEmail.includes("if (!response.ok)"),
  'Feedback should deliver directly to the configured admin mailbox, permit safe replies, escape user text, and report delivery failures'
);
assert(!feedbackEmail.includes("to: ['support@quotedr.io']"), 'Feedback delivery must not depend on an unverified forwarding alias');
assert(
  settings.includes('headers: await getSupabaseFunctionAuthHeaders()') &&
    settings.includes('if (!emailResponse.ok)') &&
    config.includes('[functions.send-feedback-email]') &&
    config.includes('verify_jwt = true'),
  'Feedback email calls should use the signed-in session and enforce JWT verification'
);


assert(!quoteFollowup.includes('noreply@quotedr.app'), 'Automated follow-ups must not use the retired quotedr.app sender');
assert(
  quoteFollowup.includes('<quotes@quotedr.io>') &&
    quoteFollowup.includes('loadBusinessProfile(quote.user_id)') &&
    quoteFollowup.includes('reply_to: emailData.replyTo') &&
    quoteFollowup.includes('to: recipient') &&
    quoteFollowup.includes('if (!isValidEmail(recipient)) return false') &&
    quoteFollowup.includes('safeSubjectPart(quote.data.quoteNumber'),
  'Quote follow-ups should use Resend, carry contractor branding, reply to the contractor, and still go only to the client'
);

assert(
  quoteEmail.includes('to: [to]') &&
    quoteEmail.includes('reply_to: replyTo') &&
    quoteEmail.includes('<quotes@quotedr.io>'),
  'Manual quote and invoice emails should preserve their client recipient and contractor reply-to behavior'
);
assert(
  welcomeEmail.includes("reply_to: Deno.env.get('QUOTEDR_ADMIN_EMAIL') || 'admin@quotedr.io'") &&
    trialFollowup.includes('reply_to: Deno.env.get("QUOTEDR_ADMIN_EMAIL") || "admin@quotedr.io"'),
  'Platform lifecycle emails should direct replies to the administrator mailbox'
);
assert(
  saveRecovery.includes('QUOTEDR_SAVE_ALERT_EMAIL') &&
    saveRecovery.includes('?? ADMIN_REPLY_EMAIL') &&
    saveRecovery.includes('reply_to: ADMIN_REPLY_EMAIL'),
  'Save alerts should default to and reply to the administrator mailbox'
);

assert(contact.includes('mailto:support@quotedr.io'), 'Public support should remain a friendly QuoteDr alias');
assert(contact.includes('mailto:feedback@quotedr.io'), 'Public feedback should remain a friendly QuoteDr alias');
assert(privacy.includes('privacy@quotedr.io'), 'Privacy requests should remain on the dedicated public alias');

assert(gitignore.includes('backups/'), 'Local backup exports should be excluded from the deployable repository');
for (const backupName of ['Client list FULL.txt', 'adam-clients-backup.txt', 'adam-pricing-backup.txt']) {
  assert(
    !fs.existsSync(path.join(root, 'backups', backupName)),
    `Client and pricing backup must not be present in the public site: ${backupName}`
  );
}

console.log('email routing static checks passed');
