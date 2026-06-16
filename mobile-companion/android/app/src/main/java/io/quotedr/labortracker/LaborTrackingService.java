package io.quotedr.labortracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LaborTrackingService extends Service {
    private static final String TAG = "QuoteDrGeofence";
    private static final String CHANNEL_ID = "quotedr_labor_tracking";
    private static final int NOTIFICATION_ID = 4107;
    private static final long UPDATE_INTERVAL_MS = 60_000L;
    private static final long MIN_UPDATE_INTERVAL_MS = 30_000L;
    private static final float MIN_UPDATE_DISTANCE_M = 25f;

    private FusedLocationProviderClient fusedLocationClient;
    private ExecutorService executor;

    private final LocationCallback locationCallback = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult result) {
            Location location = result == null ? null : result.getLastLocation();
            if (location != null) evaluateLocation(location);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        executor = Executors.newSingleThreadExecutor();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        startLocationUpdates();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (fusedLocationClient != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
        if (executor != null) {
            executor.shutdown();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startAsForeground() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("QuoteDr labour tracking")
            .setContentText("Watching pinned job sites for arrivals and departures.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Foreground tracker missing fine location permission.");
            stopSelf();
            return;
        }
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(MIN_UPDATE_INTERVAL_MS)
            .setMinUpdateDistanceMeters(MIN_UPDATE_DISTANCE_M)
            .build();
        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
            .addOnSuccessListener(unused -> Log.i(TAG, "Foreground location watcher started."))
            .addOnFailureListener(e -> Log.e(TAG, "Failed to start foreground location watcher", e));
    }

    private void evaluateLocation(Location location) {
        JSONArray sites = QuoteDrGeofenceStore.sites(this);
        for (int i = 0; i < sites.length(); i++) {
            JSONObject site = sites.optJSONObject(i);
            if (site == null) continue;
            String siteId = site.optString("id", "");
            double lat = site.optDouble("latitude", Double.NaN);
            double lng = site.optDouble("longitude", Double.NaN);
            if (siteId.isEmpty() || Double.isNaN(lat) || Double.isNaN(lng)) continue;

            float radius = (float) Math.max(25, site.optDouble("geofence_radius_m", 75));
            float[] distance = new float[1];
            Location.distanceBetween(location.getLatitude(), location.getLongitude(), lat, lng, distance);
            boolean inside = distance[0] <= radius;
            Boolean previousInside = QuoteDrGeofenceStore.insideState(this, siteId);
            if (previousInside != null && previousInside == inside) continue;
            if (previousInside == null && !inside) {
                QuoteDrGeofenceStore.saveInsideState(this, siteId, false);
                continue;
            }

            String eventType = inside ? "enter" : "exit";
            executor.execute(() -> uploadLocationEvent(siteId, eventType, location, distance[0], radius, inside));
        }
    }

    private void uploadLocationEvent(String siteId, String eventType, Location location, float distanceM, float radiusM, boolean inside) {
        try {
            JSONObject raw = new JSONObject();
            raw.put("source", "foreground_location_watcher");
            raw.put("distance_m", distanceM);
            raw.put("radius_m", radiusM);
            QuoteDrEventUploader.upload(this, siteId, eventType, location, raw);
            QuoteDrGeofenceStore.saveInsideState(this, siteId, inside);
            Log.i(TAG, "Foreground watcher uploaded " + eventType + " for " + siteId);
        } catch (Exception e) {
            Log.e(TAG, "Foreground watcher failed to upload " + eventType + " for " + siteId, e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "QuoteDr labour tracking",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps labour tracking active while you visit pinned job sites.");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
