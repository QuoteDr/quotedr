const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const settings = read('settings.html');
const dashboard = read('dashboard.html');
const builder = read('quote-builder.html');
const loader = read('app-broadcasts.js');
const migration = read('supabase/migrations/20260621120000_admin_broadcast_messages.sql');

assert(settings.includes('id="userMessagesTabLink"'), 'settings should expose an admin-only User Messages tab link');
assert(settings.includes('id="tab-user-messages"'), 'settings should include the User Messages admin panel');
assert(settings.includes('QUOTEDR_ADMIN_EMAILS'), 'settings should use shared QuoteDr admin email checks');
assert(settings.includes('loadBroadcastAdminMessages'), 'settings should load saved broadcast messages for admin');
assert(settings.includes('saveBroadcastMessage'), 'settings should let admin save broadcast messages');
assert(settings.includes('previewBroadcastMessage'), 'settings should let admin preview a broadcast');
assert(settings.includes('archiveBroadcastMessage'), 'settings should let admin archive/pause broadcast messages');
assert(settings.includes('broadcastMessageType'), 'admin panel should include message type controls');
assert(settings.includes('broadcastStartsAt'), 'admin panel should include scheduled start controls');
assert(settings.includes('broadcastEndsAt'), 'admin panel should include end date controls');
assert(settings.includes('broadcastShowMode'), 'admin panel should include once/until date/until off controls');

assert(loader.includes('window.QuoteDrBroadcasts'), 'shared loader should expose QuoteDrBroadcasts');
assert(loader.includes('app_broadcast_messages'), 'shared loader should query broadcast messages');
assert(loader.includes('app_broadcast_receipts'), 'shared loader should record per-user receipts');
assert(loader.includes('shown_count'), 'shared loader should increment shown counts');
assert(loader.includes('dismissed_at'), 'shared loader should persist dismissal');
assert(loader.includes('bootstrap.Modal'), 'shared loader should render messages as Bootstrap modals');

assert(dashboard.includes('app-broadcasts.js'), 'dashboard should include the broadcast loader');
assert(builder.includes('app-broadcasts.js'), 'quote builder should include the broadcast loader');
assert(settings.includes('app-broadcasts.js'), 'settings should include the broadcast loader');

assert(migration.includes('create table if not exists public.app_broadcast_messages'), 'migration should create app_broadcast_messages');
assert(migration.includes('create table if not exists public.app_broadcast_receipts'), 'migration should create app_broadcast_receipts');
assert(migration.includes('alter table public.app_broadcast_messages enable row level security'), 'messages table should enable RLS');
assert(migration.includes('alter table public.app_broadcast_receipts enable row level security'), 'receipts table should enable RLS');
assert(migration.includes("lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@alddirect.ca'"), 'migration should restrict admin policies to info@alddirect.ca');
assert(migration.includes('to authenticated'), 'migration should grant authenticated policies');
assert(migration.includes('auth.uid() = user_id'), 'receipts policies should scope rows to the current user');

console.log('admin broadcasts static test passed');
