import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
const REAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
const supabase = createClient(SUPABASE_URL, REAL_SUPABASE_ANON_KEY);

let session = null;
let currentUser = null;
let currentDevice = null;
let currentSites = [];
let currentItems = [];
let selectedLaborItem = null;

const $ = (id) => document.getElementById(id);
const NativeGeofence = () => window.Capacitor?.Plugins?.QuoteDrGeofence || null;
const PushNotifications = () => window.Capacitor?.Plugins?.PushNotifications || null;

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
  $('notificationPanel').classList.toggle('hidden', !currentUser);
  $('checkinPanel').classList.toggle('hidden', !currentUser);
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
    await loadNotificationSettings();
    await loadSavedItems();
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
  await loadNotificationSettings();
  await loadSavedItems();
}

async function signOut() {
  await supabase.auth.signOut();
  session = null;
  currentUser = null;
  currentDevice = null;
  currentSites = [];
  currentItems = [];
  selectedLaborItem = null;
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
    push_token: localStorage.getItem('quotedr_labor_push_token') || null,
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

async function registerPushNotifications() {
  if (!currentUser || !currentDevice) return;
  const plugin = PushNotifications();
  if (!plugin) {
    setMessage('notificationMessage', 'Push plugin is not available in this build yet. The backend is ready once Android adds PushNotifications.');
    return;
  }
  try {
    setMessage('notificationMessage', 'Requesting notification permission...');
    const permission = await plugin.requestPermissions();
    if (permission.receive !== 'granted') {
      setMessage('notificationMessage', 'Notifications were not allowed on this device.');
      return;
    }
    await plugin.addListener('registration', async (token) => {
      localStorage.setItem('quotedr_labor_push_token', token.value);
      const { data, error } = await supabase
        .from('labor_devices')
        .update({ push_token: token.value, updated_at: new Date().toISOString() })
        .eq('id', currentDevice.id)
        .eq('user_id', currentUser.id)
        .select()
        .single();
      if (error) setMessage('notificationMessage', error.message);
      else {
        currentDevice = data;
        setMessage('notificationMessage', 'Push notifications registered.');
      }
    });
    await plugin.addListener('registrationError', (error) => {
      setMessage('notificationMessage', error.error || error.message || 'Push registration failed.');
    });
    await plugin.addListener('pushNotificationActionPerformed', () => {
      $('laborItemSearch')?.focus();
    });
    await plugin.register();
  } catch (error) {
    setMessage('notificationMessage', error.message || String(error));
  }
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

async function loadNotificationSettings() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('labor_notification_settings')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  if (error) {
    setMessage('notificationMessage', error.message);
    return;
  }
  const settings = data || {};
  $('remindersEnabled').checked = settings.enabled !== false;
  $('morningTime').value = String(settings.morning_time || '08:00').slice(0, 5);
  $('eveningTime').value = String(settings.evening_time || '17:30').slice(0, 5);
}

async function saveReminderSettings() {
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    enabled: $('remindersEnabled').checked,
    morning_enabled: $('remindersEnabled').checked,
    evening_enabled: $('remindersEnabled').checked,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
    morning_time: $('morningTime').value || '08:00',
    evening_time: $('eveningTime').value || '17:30',
    last_opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from('labor_notification_settings')
    .upsert(payload, { onConflict: 'user_id' });
  setMessage('notificationMessage', error ? error.message : 'Reminder settings saved.');
}

function flattenSavedItems(snapshot) {
  const items = [];
  Object.entries(snapshot || {}).forEach(([category, list]) => {
    if (category === '__choiceGroupTemplates' || !Array.isArray(list)) return;
    list.forEach((item) => {
      if (!item || !item.name) return;
      items.push({
        category,
        name: item.name,
        unitType: item.unitType || item.unit || '',
        rate: item.rate || 0
      });
    });
  });
  return items;
}

async function loadSavedItems() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('quotes')
    .select('data')
    .eq('user_id', currentUser.id)
    .eq('quote_number', '__ITEMS_BACKUP__')
    .maybeSingle();
  if (error) {
    setMessage('checkinMessage', error.message);
    return;
  }
  let snapshot = {};
  try {
    snapshot = JSON.parse(data?.data?.items_snapshot || '{}');
  } catch (_) {
    snapshot = {};
  }
  currentItems = flattenSavedItems(snapshot);
}

function renderItemSearchResults() {
  const query = $('laborItemSearch').value.trim().toLowerCase();
  const list = $('itemSearchResults');
  if (!query) {
    list.innerHTML = '';
    return;
  }
  const matches = currentItems.filter((item) => (
    `${item.category} ${item.name} ${item.unitType}`.toLowerCase().includes(query)
  )).slice(0, 8);
  list.innerHTML = matches.length ? matches.map((item, index) => (
    `<button class="item-result" type="button" data-item-index="${index}">
      <strong>${escapeHtml(item.name)}</strong>
      <small>${escapeHtml(item.category)} - ${escapeHtml(item.unitType || 'unit')} - $${Number(item.rate || 0).toFixed(2)}</small>
    </button>`
  )).join('') : '<div class="message">No saved items found. Try another word.</div>';
  list.querySelectorAll('[data-item-index]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedLaborItem = matches[parseInt(button.dataset.itemIndex, 10)];
      $('laborItemSearch').value = selectedLaborItem.name;
      $('selectedItemSummary').textContent = `${selectedLaborItem.category} - ${selectedLaborItem.name} (${selectedLaborItem.unitType || 'unit'})`;
      list.innerHTML = '';
      calculateProductionRate();
    });
  });
}

function calculateProductionRate() {
  const quantity = parseFloat($('laborQuantity').value || '0') || 0;
  const hours = parseFloat($('laborHours').value || '0') || 0;
  const unit = selectedLaborItem?.unitType || 'units';
  if (quantity <= 0 || hours <= 0) {
    $('productionRatePreview').textContent = 'Enter quantity and hours to calculate the rate.';
    return 0;
  }
  const rate = quantity / hours;
  $('productionRatePreview').textContent = `${quantity} ${unit} in ${hours} hours = ${rate.toFixed(2)} ${unit}/hour.`;
  return rate;
}

async function submitLaborCheckin() {
  if (!currentUser || !session) return;
  if (!selectedLaborItem) {
    setMessage('checkinMessage', 'Pick a saved item first.');
    return;
  }
  const quantity = parseFloat($('laborQuantity').value || '0') || 0;
  const hours = parseFloat($('laborHours').value || '0') || 0;
  if (quantity <= 0 || hours <= 0) {
    setMessage('checkinMessage', 'Enter quantity and hours greater than zero.');
    return;
  }
  setMessage('checkinMessage', 'Saving...');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/labor-checkin-submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': REAL_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      device_id: currentDevice?.id || null,
      item_category: selectedLaborItem.category,
      item_name: selectedLaborItem.name,
      item_unit: selectedLaborItem.unitType || '',
      quantity,
      hours,
      notes: $('laborNotes').value.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
      source: 'mobile_daily_prompt'
    })
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    setMessage('checkinMessage', data.error || 'Check-in failed.');
    return;
  }
  setMessage('checkinMessage', data.summary || 'Labour check-in saved.');
  $('laborQuantity').value = '';
  $('laborHours').value = '';
  $('laborNotes').value = '';
  calculateProductionRate();
}

$('signInBtn').addEventListener('click', signIn);
$('signOutBtn').addEventListener('click', signOut);
$('enableBtn').addEventListener('click', enableBackgroundTracking);
$('syncBtn').addEventListener('click', () => syncSites(true));
$('testEventBtn').addEventListener('click', sendTestEvent);
$('registerPushBtn').addEventListener('click', registerPushNotifications);
$('saveReminderBtn').addEventListener('click', saveReminderSettings);
$('laborItemSearch').addEventListener('input', renderItemSearchResults);
$('laborQuantity').addEventListener('input', calculateProductionRate);
$('laborHours').addEventListener('input', calculateProductionRate);
$('submitCheckinBtn').addEventListener('click', submitLaborCheckin);

refreshSession();
