package io.quotedr.labortracker;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "QuoteDrGeofence",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        ),
        @Permission(
            alias = "backgroundLocation",
            strings = {
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            }
        )
    }
)
public class QuoteDrGeofencePlugin extends Plugin {
    private GeofencingClient geofencingClient;

    @Override
    public void load() {
        geofencingClient = LocationServices.getGeofencingClient(getContext());
    }

    @PluginMethod
    public void configure(PluginCall call) {
        JSONObject config = new JSONObject();
        try {
            config.put("supabaseUrl", call.getString("supabaseUrl", ""));
            config.put("anonKey", call.getString("anonKey", ""));
            config.put("accessToken", call.getString("accessToken", ""));
            config.put("userId", call.getString("userId", ""));
            config.put("deviceId", call.getString("deviceId", ""));
            config.put("deviceKey", call.getString("deviceKey", ""));
            QuoteDrGeofenceStore.saveConfig(getContext(), config);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void requestTrackingPermissions(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundPermissionCallback");
            return;
        }
        call.resolve();
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission is required for job-site tracking.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundPermissionCallback");
            return;
        }
        call.resolve();
    }

    @PermissionCallback
    private void backgroundPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            call.reject("Always allow location is required for background geofence tracking.");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void registerGeofences(PluginCall call) {
        if (!hasFineLocation()) {
            call.reject("Location permission is required before geofences can be registered.");
            return;
        }
        JSArray jsSites = call.getArray("sites");
        if (jsSites == null) jsSites = new JSArray();
        JSONArray storedSites = new JSONArray();
        List<Geofence> geofences = new ArrayList<>();
        try {
            for (int i = 0; i < jsSites.length(); i++) {
                JSONObject site = jsSites.getJSONObject(i);
                String id = site.optString("id", "");
                double lat = site.optDouble("latitude", Double.NaN);
                double lng = site.optDouble("longitude", Double.NaN);
                if (id.isEmpty() || Double.isNaN(lat) || Double.isNaN(lng)) continue;
                float radius = (float) Math.max(100, site.optDouble("geofence_radius_m", 100));
                storedSites.put(site);
                geofences.add(new Geofence.Builder()
                    .setRequestId(id)
                    .setCircularRegion(lat, lng, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
                    .build());
            }
            QuoteDrGeofenceStore.saveSites(getContext(), storedSites);
            geofencingClient.removeGeofences(getGeofencePendingIntent());
            if (geofences.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("registered", 0);
                call.resolve(ret);
                return;
            }
            GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofences)
                .build();
            geofencingClient.addGeofences(request, getGeofencePendingIntent())
                .addOnSuccessListener(unused -> {
                    JSObject ret = new JSObject();
                    ret.put("registered", geofences.size());
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject(e.getMessage()));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void clearGeofences(PluginCall call) {
        geofencingClient.removeGeofences(getGeofencePendingIntent())
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    private boolean hasFineLocation() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private PendingIntent getGeofencePendingIntent() {
        Intent intent = new Intent(getContext(), GeofenceBroadcastReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(getContext(), 0, intent, flags);
    }
}
