import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
const REAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
const supabase = createClient(SUPABASE_URL, REAL_SUPABASE_ANON_KEY);

let session = null;
let currentUser = null;
let currentDevice = null;
let currentSites = [];

const $ = (id) => document.getElementById(id);
const NativeGeofence = () => window.Capacitor?.Plugins?.QuoteDrGeofence || null;

function setMessage(id, message) {
  $(id).textContent = message || '';
}

function getDeviceKey() {
  let key = localStorage.getItem('quotedr_labor_device_key');
  if (!key) {
    key = 'android-' + crypto.randomUUID();
    localStorage.setItem('quotedr_labor_device_key', key);
  }
  return key;
}

function renderAuthState() {
  $('authPanel').classList.toggle('hidden', !!currentUser);
  $('trackingPanel').classList.toggle('hidden', !currentUser);
}

function renderSites() {
  $('siteCount').textContent = currentSites.length;
  $('sitesList').innerHTML = currentSites.length ? currentSites.map((site) => (
    `<div class="site">
      <strong>${escapeHtml(site.name || 'Job Site')}</strong>
      <small>${escapeHtml(site.address || '')}</small>
      <small>${Math.round(site.geofence_radius_m || 100)}m radius</small>
    </div>`
  )).join('') : '<div class="message">No pinned active job sites. Pin sites in QuoteDr Labour Tracker first.</div>';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function refreshSession() {
  const result = await supabase.auth.getSession();
  session = result.data?.session || null;
  currentUser = session?.user || null;
  renderAuthState();
  if (currentUser) {
    await registerDevice(false);
    await syncSites(false);
  }
}

async function signIn() {
  setMessage('authMessage', 'Signing in...');
  const email = $('email').value.trim();
  const password = $('password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage('authMessage', error.message);
    return;
  }
  session = data.session;
  currentUser = data.user;
  setMessage('authMessage', '');
  renderAuthState();
  await registerDevice(true);
  await syncSites(true);
}

async function signOut() {
  await supabase.auth.signOut();
  session = null;
  currentUser = null;
  currentDevice = null;
  currentSites = [];
  renderAuthState();
}

async function registerDevice(showMessage) {
  if (!currentUser) return;
  const deviceKey = getDeviceKey();
  const payload = {
    user_id: currentUser.id,
    device_key: deviceKey,
    platform: 'android',
    device_name: navigator.userAgent.includes('Android') ? 'Android phone' : 'Android companion',
    tracking_enabled: false,
    app_version: '0.1.0',
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('labor_devices')
    .upsert(payload, { onConflict: 'user_id,device_key' })
    .select()
    .single();
  if (error) {
    setMessage('deviceStatus', error.message);
    return;
  }
  currentDevice = data;
  $('deviceStatus').textContent = `Registered as ${data.device_name || data.device_key}`;
  if (showMessage) setMessage('trackingMessage', 'Device registered.');
}

async function syncSites(showMessage) {
  if (!currentUser || !session) return;
  if (showMessage) setMessage('trackingMessage', 'Syncing pinned job sites...');
  const { data, error } = await supabase
    .from('labor_job_sites')
    .select('id, quote_id, name, address, latitude, longitude, geofence_radius_m')
    .eq('user_id', currentUser.id)
    .eq('active', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) {
    setMessage('trackingMessage', error.message);
    return;
  }
  currentSites = data || [];
  renderSites();
  const plugin = NativeGeofence();
  if (plugin) {
    await plugin.configure({
      supabaseUrl: SUPABASE_URL,
      anonKey: REAL_SUPABASE_ANON_KEY,
      accessToken: session.access_token,
      userId: currentUser.id,
      deviceId: currentDevice?.id || null,
      deviceKey: getDeviceKey()
    });
    await plugin.registerGeofences({ sites: currentSites });
  }
  await markDeviceSynced(true, null);
  if (showMessage) setMessage('trackingMessage', `Synced ${currentSites.length} pinned job site${currentSites.length === 1 ? '' : 's'}.`);
}

async function markDeviceSynced(enabled, errorMessage) {
  if (!currentUser || !currentDevice) return;
  const { data } = await supabase
    .from('labor_devices')
    .update({
      tracking_enabled: enabled,
      last_sync_at: new Date().toISOString(),
      last_error: errorMessage || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', currentDevice.id)
    .eq('user_id', currentUser.id)
    .select()
    .single();
  if (data) currentDevice = data;
}

async function enableBackgroundTracking() {
  if (!currentUser) return;
  const plugin = NativeGeofence();
  if (!plugin) {
    setMessage('trackingMessage', 'Native geofence bridge is not available in this browser. Open the Android app build.');
    return;
  }
  try {
    setMessage('trackingMessage', 'Requesting location permission...');
    await plugin.requestTrackingPermissions();
    await syncSites(false);
    await markDeviceSynced(true, null);
    setMessage('trackingMessage', 'Background tracking is enabled. Android will send events when geofences trigger.');
  } catch (error) {
    await markDeviceSynced(false, error.message || String(error));
    setMessage('trackingMessage', error.message || String(error));
  }
}

async function sendTestEvent() {
  if (!currentUser || !currentDevice) return;
  const site = currentSites[0];
  const { error } = await supabase.from('labor_location_events').insert({
    user_id: currentUser.id,
    device_id: currentDevice.id,
    device_key: getDeviceKey(),
    job_site_id: site?.id || null,
    quote_id: site?.quote_id || null,
    event_type: 'sync',
    transition_source: 'companion_test',
    occurred_at: new Date().toISOString(),
    latitude: site?.latitude || null,
    longitude: site?.longitude || null,
    raw_payload: { test: true }
  });
  if (error) {
    setMessage('trackingMessage', error.message);
    return;
  }
  $('eventCount').textContent = String((parseInt($('eventCount').textContent || '0', 10) || 0) + 1);
  setMessage('trackingMessage', 'Test event sent to QuoteDr.');
}

$('signInBtn').addEventListener('click', signIn);
$('signOutBtn').addEventListener('click', signOut);
$('enableBtn').addEventListener('click', enableBackgroundTracking);
$('syncBtn').addEventListener('click', () => syncSites(true));
$('testEventBtn').addEventListener('click', sendTestEvent);

refreshSession();
