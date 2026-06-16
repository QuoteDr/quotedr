package io.quotedr.labortracker;

import android.content.Context;
import android.location.Location;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class QuoteDrEventUploader {
    public static void upload(Context context, String jobSiteId, String eventType, Location location, JSONObject rawPayload) throws Exception {
        JSONObject config = QuoteDrGeofenceStore.config(context);
        String supabaseUrl = config.optString("supabaseUrl", "");
        String anonKey = config.optString("anonKey", "");
        String accessToken = config.optString("accessToken", "");
        String userId = config.optString("userId", "");
        if (supabaseUrl.isEmpty() || anonKey.isEmpty() || accessToken.isEmpty() || userId.isEmpty()) {
            throw new IllegalStateException("QuoteDr geofence config is missing.");
        }

        JSONObject site = QuoteDrGeofenceStore.siteById(context, jobSiteId);
        JSONObject payload = new JSONObject();
        payload.put("user_id", userId);
        String deviceId = config.optString("deviceId", "");
        payload.put("device_id", deviceId.isEmpty() ? JSONObject.NULL : deviceId);
        payload.put("device_key", config.optString("deviceKey", ""));
        payload.put("job_site_id", jobSiteId);
        if (site != null && !site.isNull("quote_id")) {
            String quoteId = site.optString("quote_id", "");
            if (!quoteId.isEmpty() && !"null".equalsIgnoreCase(quoteId)) payload.put("quote_id", quoteId);
        }
        payload.put("event_type", eventType);
        payload.put("transition_source", "android_geofence");
        payload.put("occurred_at", isoNow());
        if (location != null) {
            payload.put("latitude", location.getLatitude());
            payload.put("longitude", location.getLongitude());
            if (location.hasAccuracy()) payload.put("accuracy_m", location.getAccuracy());
        }
        payload.put("raw_payload", rawPayload == null ? new JSONObject() : rawPayload);

        URL url = new URL(supabaseUrl + "/rest/v1/labor_location_events");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("apikey", anonKey);
        conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        conn.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal");
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        conn.setFixedLengthStreamingMode(body.length);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body);
        }
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("Supabase event insert failed: HTTP " + code + " " + readResponseBody(conn));
        }
    }

    private static String isoNow() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    private static String readResponseBody(HttpURLConnection conn) {
        try {
            InputStream stream = conn.getErrorStream();
            if (stream == null) stream = conn.getInputStream();
            if (stream == null) return "";
            byte[] bytes = stream.readAllBytes();
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }
}
