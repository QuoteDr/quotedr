const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read('supabase/migrations/20260522100000_labor_notification_checkins.sql');
const dispatch = read('supabase/functions/labor-notification-dispatch/index.ts');
const submit = read('supabase/functions/labor-checkin-submit/index.ts');
const config = read('supabase/config.toml');
const supabase = read('supabase-v2.js');
const mobileApp = read('mobile-companion/www/app.js');
const mobileHtml = read('mobile-companion/www/index.html');

assert(migration.includes('create table if not exists public.labor_notification_settings'), 'migration should create labor notification settings');
assert(migration.includes('create table if not exists public.labor_notification_logs'), 'migration should create labor notification logs');
assert(migration.includes('create table if not exists public.labor_daily_checkins'), 'migration should create daily labor check-ins');
assert(migration.includes('create table if not exists public.labor_item_production_rates'), 'migration should create learned production rates');
assert(migration.includes('invoke-labor-notification-dispatch'), 'migration should schedule the labor notification dispatcher');
assert(migration.includes('enable row level security'), 'migration should enable RLS');
assert(migration.includes('auth.uid() = user_id'), 'migration should scope RLS policies to the current user');

assert(dispatch.includes('FCM_SERVICE_ACCOUNT_JSON'), 'dispatcher should read the Firebase service account secret');
assert(dispatch.includes('https://www.googleapis.com/auth/firebase.messaging'), 'dispatcher should request the FCM messaging OAuth scope');
assert(dispatch.includes('labor_notification_settings'), 'dispatcher should load user notification settings');
assert(dispatch.includes('labor_notification_logs'), 'dispatcher should log notification attempts');
assert(dispatch.includes('labor_devices'), 'dispatcher should send to saved labor device push tokens');
assert(dispatch.includes('labor_morning_reminder'), 'dispatcher should send a morning reminder type');
assert(dispatch.includes('labor_evening_checkin'), 'dispatcher should send an evening check-in type');

assert(submit.includes('labor_daily_checkins'), 'check-in submit should insert daily check-ins');
assert(submit.includes('labor_item_production_rates'), 'check-in submit should update learned production rates');
assert(submit.includes('units_per_hour'), 'check-in submit should calculate units per hour');
assert(submit.includes('.auth.getUser()'), 'check-in submit should authenticate the current user');

assert(config.includes('[functions.labor-notification-dispatch]'), 'Supabase config should include the notification dispatch function');
assert(config.includes('[functions.labor-checkin-submit]'), 'Supabase config should include the check-in submit function');
assert(config.includes('verify_jwt = false'), 'dispatch function should be callable by pg_cron without a JWT');

assert(supabase.includes('saveLaborNotificationSettings'), 'web helpers should save labor notification settings');
assert(supabase.includes('submitLaborDailyCheckin'), 'web helpers should submit labor daily check-ins');
assert(supabase.includes('listLaborProductionRates'), 'web helpers should list learned labor production rates');

assert(mobileHtml.includes('checkinPanel'), 'mobile app should include a fast labor check-in panel');
assert(mobileHtml.includes('notificationPanel'), 'mobile app should include notification settings');
assert(mobileApp.includes('registerPushNotifications'), 'mobile app should register push notifications when available');
assert(mobileApp.includes('submitLaborCheckin'), 'mobile app should submit the fast daily check-in');
assert(mobileApp.includes('calculateProductionRate'), 'mobile app should calculate quantity per hour for the user');
assert(mobileApp.includes('itemSearchResults'), 'mobile app should autocomplete saved items for the check-in');

console.log('labor notifications static test passed');
