# QuoteDr Labour Companion

Android-first companion app for background job-site geofencing.

## Current Slice

- Signs into QuoteDr with Supabase email/password auth.
- Registers the device in `labor_devices`.
- Downloads active pinned job sites from `labor_job_sites`.
- Registers Android geofences through a native Capacitor bridge.
- Uploads Android enter/exit events into `labor_location_events`.

GPS events are raw evidence only. QuoteDr web still handles daily approval before hours count.

## Local Build Requirements

This workspace can install Node packages and sync Capacitor files, but it does not currently have Java, Gradle, or Android SDK installed. To build an APK locally, install:

- Android Studio
- JDK 17
- Android SDK platform 35

Then run:

```powershell
cd mobile-companion
npm install
npm run sync
npm run open:android
```

## Supabase Migration

Run this migration before using the companion:

`supabase/migrations/20260513210000_labor_mobile_tracking.sql`

## Platform Notes

Android geofencing requires fine location and background location permission. Android may delay background geofence events by a few minutes for battery savings. Radius values below 100m are displayed in QuoteDr, but Android registration uses at least 100m for better reliability.
