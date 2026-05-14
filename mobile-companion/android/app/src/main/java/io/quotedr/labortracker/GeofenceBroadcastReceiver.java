package io.quotedr.labortracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.util.Log;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GeofenceBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "QuoteDrGeofence";

    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                GeofencingEvent event = GeofencingEvent.fromIntent(intent);
                if (event == null || event.hasError()) {
                    Log.w(TAG, "Invalid geofence event.");
                    return;
                }
                String eventType = transitionName(event.getGeofenceTransition());
                if (eventType == null) return;
                Location location = event.getTriggeringLocation();
                List<Geofence> geofences = event.getTriggeringGeofences();
                if (geofences == null) return;
                for (Geofence geofence : geofences) {
                    JSONObject raw = new JSONObject();
                    raw.put("transition", event.getGeofenceTransition());
                    raw.put("requestId", geofence.getRequestId());
                    QuoteDrEventUploader.upload(context, geofence.getRequestId(), eventType, location, raw);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to upload geofence event", e);
            } finally {
                pending.finish();
                executor.shutdown();
            }
        });
    }

    private String transitionName(int transition) {
        if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) return "enter";
        if (transition == Geofence.GEOFENCE_TRANSITION_EXIT) return "exit";
        if (transition == Geofence.GEOFENCE_TRANSITION_DWELL) return "dwell";
        return null;
    }
}
