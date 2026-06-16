package io.quotedr.labortracker;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class QuoteDrGeofenceStore {
    private static final String PREFS = "quotedr_labor_geofence";

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveConfig(Context context, JSONObject config) {
        SharedPreferences.Editor editor = prefs(context).edit();
        editor.putString("supabaseUrl", config.optString("supabaseUrl", ""));
        editor.putString("anonKey", config.optString("anonKey", ""));
        editor.putString("accessToken", config.optString("accessToken", ""));
        editor.putString("userId", config.optString("userId", ""));
        editor.putString("deviceId", config.optString("deviceId", ""));
        editor.putString("deviceKey", config.optString("deviceKey", ""));
        editor.apply();
    }

    public static JSONObject config(Context context) {
        SharedPreferences p = prefs(context);
        JSONObject out = new JSONObject();
        try {
            out.put("supabaseUrl", p.getString("supabaseUrl", ""));
            out.put("anonKey", p.getString("anonKey", ""));
            out.put("accessToken", p.getString("accessToken", ""));
            out.put("userId", p.getString("userId", ""));
            out.put("deviceId", p.getString("deviceId", ""));
            out.put("deviceKey", p.getString("deviceKey", ""));
        } catch (JSONException ignored) {}
        return out;
    }

    public static void saveSites(Context context, JSONArray sites) {
        prefs(context).edit().putString("sites", sites == null ? "[]" : sites.toString()).apply();
    }

    public static JSONArray sites(Context context) {
        try {
            return new JSONArray(prefs(context).getString("sites", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static JSONObject siteById(Context context, String id) {
        JSONArray sites = sites(context);
        for (int i = 0; i < sites.length(); i++) {
            JSONObject site = sites.optJSONObject(i);
            if (site != null && id.equals(site.optString("id"))) return site;
        }
        return null;
    }

    public static Boolean insideState(Context context, String id) {
        String key = "inside_" + id;
        SharedPreferences p = prefs(context);
        if (!p.contains(key)) return null;
        return p.getBoolean(key, false);
    }

    public static void saveInsideState(Context context, String id, boolean inside) {
        prefs(context).edit().putBoolean("inside_" + id, inside).apply();
    }
}
