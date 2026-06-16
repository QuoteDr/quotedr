const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pluginPath = path.join(
  root,
  'mobile-companion',
  'android',
  'app',
  'src',
  'main',
  'java',
  'io',
  'quotedr',
  'labortracker',
  'QuoteDrGeofencePlugin.java'
);
const servicePath = path.join(
  root,
  'mobile-companion',
  'android',
  'app',
  'src',
  'main',
  'java',
  'io',
  'quotedr',
  'labortracker',
  'LaborTrackingService.java'
);
const manifestPath = path.join(
  root,
  'mobile-companion',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
);
const companionJsPath = path.join(root, 'mobile-companion', 'www', 'app.js');
const uploaderPath = path.join(
  root,
  'mobile-companion',
  'android',
  'app',
  'src',
  'main',
  'java',
  'io',
  'quotedr',
  'labortracker',
  'QuoteDrEventUploader.java'
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plugin = fs.readFileSync(pluginPath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const companionJs = fs.readFileSync(companionJsPath, 'utf8');
const uploader = fs.readFileSync(uploaderPath, 'utf8');

assert(
  plugin.includes('addRegisteredGeofences(call, geofences);'),
  'geofence registration should route through a helper after stale geofences are removed'
);
assert(
  plugin.includes('removeGeofences(getGeofencePendingIntent()).addOnCompleteListener'),
  'geofence registration should wait for old geofence removal to complete before adding new geofences'
);
assert(
  plugin.indexOf('removeGeofences(getGeofencePendingIntent()).addOnCompleteListener') <
    plugin.indexOf('addRegisteredGeofences(call, geofences);'),
  'old geofences should be removed before new geofences are added'
);
assert(
  plugin.includes('ret.put("message", "Registered " + registeredCount + " Android geofence'),
  'native plugin should return a clear registration message for the companion UI'
);
assert(fs.existsSync(servicePath), 'labour companion should include a foreground location tracking service fallback');

const service = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';

assert(
  plugin.includes('startForegroundTracking'),
  'native plugin should expose a method to start the foreground tracking fallback'
);
assert(
  companionJs.includes('plugin.startForegroundTracking()'),
  'enable tracking should start the foreground tracking fallback after syncing sites'
);
assert(
  manifest.includes('android.permission.FOREGROUND_SERVICE_LOCATION'),
  'Android 14+ location foreground service permission should be declared'
);
assert(
  manifest.includes('android:foregroundServiceType="location"'),
  'tracking service should declare the location foreground service type'
);
assert(
  service.includes('requestLocationUpdates'),
  'tracking service should subscribe to native location updates'
);
assert(
  service.includes('QuoteDrEventUploader.upload'),
  'tracking service should upload enter and exit events through the existing Supabase uploader'
);
assert(
  uploader.includes('!site.isNull("quote_id")'),
  'event uploader should not send a literal null quote_id string to Supabase'
);
assert(
  uploader.includes('readResponseBody'),
  'event uploader should include Supabase response bodies in native upload errors'
);

console.log('labor mobile static test passed');
