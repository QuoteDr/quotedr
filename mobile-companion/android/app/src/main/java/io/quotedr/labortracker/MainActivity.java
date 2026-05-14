package io.quotedr.labortracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QuoteDrGeofencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
