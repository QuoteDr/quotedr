const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const page = read('ai-operations.html');
const ui = read('ai-operations.js');
const core = read('ai-operations-core.js');
const settings = read('settings.html');
const edgeFunction = read('supabase/functions/ai-operations/index.ts');
const migration = read('supabase/migrations/20260808152738_ai_operations_dashboard.sql');
const handoffMigration = read('supabase/migrations/20260808161014_ai_operations_coordinator_handoff.sql');
const config = read('supabase/config.toml');

['incomingQueue', 'engineeringQueue', 'deployQueue', 'followupQueue', 'improvementFeed', 'commonTopics'].forEach(id => {
  assert(page.includes(`id="${id}"`), `dashboard should expose ${id}`);
});
assert(page.includes('Avg first response'), 'dashboard should show first-response timing');
assert(page.includes('Bug → deploy'), 'dashboard should show bug-to-deploy timing');
assert(page.includes('never sends a customer message, deploys code, or grants a credit'), 'dashboard should state the non-execution boundary');
assert(page.includes('billing, payment, data, privacy, access, signature, conflict, and incident'), 'dashboard should preserve sensitive support boundaries');
assert(page.includes('actionCopyBrief'), 'dashboard should expose a manual coordinator-brief copy control');
assert(page.includes('ai-operations-core.js') && page.includes('ai-operations.js'), 'dashboard should load testable workflow logic and UI');
assert(ui.includes("new URLSearchParams(window.location.search || '').get('demo') === '1'"), 'local demo should be explicitly opt-in');
assert(ui.includes("['localhost', '127.0.0.1']"), 'demo mode should be restricted to local hosts');
assert(ui.includes('window.QuoteDrAdmin.isAdminUser(session.user)'), 'live dashboard should enforce the shared admin gate');
assert(settings.includes('id="aiOperationsDashboardLink"') && settings.includes('href="ai-operations.html"'), 'administrator settings should link to AI Operations');
assert(settings.includes('Open AI Operations'), 'chatbot trends should link into the operations workflow');

assert(core.includes('containsLiveFixClaim') && core.includes('containsReleaseDatePromise'), 'shared logic should expose response safety checks');
assert(core.includes('buildCoordinatorBrief'), 'shared logic should build a reviewable engineering brief');
assert(ui.includes("actionButton('handoff_engineering'"), 'engineering cases should expose a coordinator handoff action');
assert(ui.includes('QuoteDr has no live Codex coordinator integration'), 'handoff UI should disclose the manual integration boundary');
assert(ui.includes('data-coordinator-brief-preview'), 'handoff UI should render a reviewable brief');
assert(ui.includes('data-copy-coordinator-brief'), 'recorded handoffs should remain copyable');
assert(edgeFunction.includes('verifyCoordinator(req)'), 'all workflow access should require a coordinator');
assert(edgeFunction.includes('verifyOwner(req)'), 'owner-gated actions should have a separate server guard');
assert(edgeFunction.includes('BASE_OWNER_EMAILS') && edgeFunction.includes('QUOTEDR_OWNER_EMAILS'), 'owner approval should use an explicit, separately configurable allowlist');
assert(edgeFunction.includes("action === 'decide_deployment'"), 'deployment decision should be explicit');
assert(edgeFunction.includes("action === 'decide_followup'"), 'customer wording decision should be explicit');
assert(edgeFunction.includes("action === 'decide_goodwill'"), 'goodwill decision should be explicit');
assert(edgeFunction.includes("action === 'handoff_engineering'"), 'coordinator handoff should be an explicit authenticated action');
assert(edgeFunction.includes('body.humanReviewed !== true'), 'server should require explicit human review for coordinator handoff');
assert(edgeFunction.includes('external_delivery_performed: false'), 'handoff must disclose that no external delivery occurred');
assert(edgeFunction.includes('agent_launched: false'), 'handoff must disclose that no agent was launched');
assert(edgeFunction.includes('merge_performed: false'), 'handoff must disclose that no merge occurred');
assert(edgeFunction.includes('deployment_performed_by_dashboard: false'), 'deployment actions must be records only');
assert(edgeFunction.includes('message_sent_by_dashboard: false'), 'response actions must not send messages');
assert(edgeFunction.includes('credit_granted: false'), 'goodwill actions must not grant credits');
assert(!edgeFunction.includes('api.resend.com'), 'AI Operations must not include an email sender');
assert(!edgeFunction.includes("action === 'grant_credit'"), 'AI Operations must not expose a credit-grant action');
assert(!edgeFunction.includes("action === 'deploy_code'"), 'AI Operations must not expose a code-deploy action');
assert(!edgeFunction.includes("action === 'launch_agent'"), 'AI Operations must not expose an agent-launch action');
assert(!edgeFunction.includes("action === 'send_to_codex'"), 'AI Operations must not pretend to have a Codex transport');
assert(edgeFunction.includes('containsLiveFixClaim(responseText)'), 'immediate responses should reject live-fix claims');
assert(edgeFunction.includes('containsReleaseDatePromise(responseText)'), 'immediate responses should reject unsupported release dates');

[
  'ai_support_cases',
  'ai_engineering_work_items',
  'ai_deploy_approvals',
  'ai_customer_followups',
  'ai_goodwill_recommendations',
  'ai_operations_events'
].forEach(table => {
  assert(migration.includes(`create table if not exists public.${table}`), `migration should create ${table}`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table} should enable RLS`);
  assert(migration.includes(`revoke all on table public.${table} from public, anon, authenticated`), `${table} should deny browser table access`);
});
assert(migration.includes('new.is_likely_bug') && migration.includes('new.possible_solution'), 'likely bugs with a possible solution should auto-create work');
assert(migration.includes('engineering_work_item_auto_created'), 'automatic work creation should be audited');
assert(migration.includes('recorded deployment requires verified work and prior owner approval'), 'database should guard deployment records');
assert(migration.includes('a live-fix follow-up requires a verified and deployed release'), 'database should guard live-fix wording');
assert(migration.includes('customer follow-up requires owner approval'), 'database should require owner approval before a follow-up can be sent');
assert(migration.includes('goodwill decisions require owner approval'), 'database should require owner approval for goodwill');
assert(migration.includes("check (status in ('recommended', 'approved', 'declined'))"), 'goodwill status should stop at a decision');
assert(!migration.includes("'granted'"), 'database should not model an automatic granted-credit state');
assert(handoffMigration.includes('coordinator_handoff_status'), 'handoff migration should mark the current work-item state');
assert(handoffMigration.includes('coordinator_brief_payload'), 'handoff migration should retain the structured brief payload');
assert(handoffMigration.includes('engineering_coordinator_handoff_recorded'), 'database should audit every recorded handoff');
assert(handoffMigration.includes('new.coordinator_handoff_count > old.coordinator_handoff_count'), 'audit event should be tied to a monotonic handoff revision');
assert(handoffMigration.includes("'external_delivery_performed', false"), 'database audit should record no external delivery');
assert(handoffMigration.includes("'agent_launched', false"), 'database audit should record no agent launch');
assert(handoffMigration.includes("'deployment_performed', false") && handoffMigration.includes("'merge_performed', false"), 'database audit should preserve release boundaries');
assert(config.includes('[functions.ai-operations]') && /\[functions\.ai-operations\]\s*verify_jwt\s*=\s*true/.test(config), 'AI Operations Edge Function should require platform JWT verification');

console.log('ai operations static tests passed');
