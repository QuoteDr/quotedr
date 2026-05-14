package io.quotedr.labortracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class GeofenceBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Android clears app geofences on reboot. The user-facing companion sync
        // registers them again when opened; a future worker can re-register here.
    }
}
