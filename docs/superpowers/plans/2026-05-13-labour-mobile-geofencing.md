# Labour Mobile Geofencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android-first mobile companion that registers QuoteDr job-site geofences and syncs arrival/departure events back to Supabase for daily review.

**Architecture:** QuoteDr web remains the review center. Supabase stores registered devices and raw geofence events. The mobile companion signs into Supabase, downloads pinned active job sites, registers native Android geofences, and inserts raw events when Android reports enter/exit transitions.

**Tech Stack:** Static QuoteDr web app, Supabase Auth/REST, Capacitor shell, Android Google Play Services Location geofencing API.

---

### Task 1: Event Schema

**Files:**
- Create: `supabase/migrations/20260513210000_labor_mobile_tracking.sql`
- Modify: `supabase-schema.sql`

- [x] Create `labor_devices` with user-owned device registration state.
- [x] Create `labor_location_events` with user-owned raw geofence events.
- [x] Enable RLS and own-row policies for both tables.
- [x] Add indexes for recent user events and idempotent event inserts.

### Task 2: Web Status

**Files:**
- Modify: `supabase-v2.js`
- Modify: `labor-tracker.html`

- [x] Add helpers for listing/saving labour devices.
- [x] Add helpers for listing/saving labour location events.
- [x] Show pinned-site count, connected devices, and recent GPS events on the Labour Tracker page.

### Task 3: Android Companion Scaffold

**Files:**
- Create: `mobile-companion/package.json`
- Create: `mobile-companion/capacitor.config.json`
- Create: `mobile-companion/www/index.html`
- Create: `mobile-companion/www/app.js`
- Create: `mobile-companion/www/styles.css`
- Create: Android native source under `mobile-companion/android/app/src/main`

- [x] Add sign-in form using Supabase email/password auth.
- [x] Sync active pinned job sites from `labor_job_sites`.
- [x] Register geofences through the native Android bridge.
- [x] Insert geofence events into `labor_location_events`.

### Task 4: Build Verification

**Files:**
- Test generated JS with `node --check`.
- Test HTML inline scripts with `new Function`.
- Confirm Android project cannot be compiled locally unless JDK/Android SDK are installed.

- [x] Run static syntax checks.
- [x] Document missing local Android build prerequisites if unavailable.
