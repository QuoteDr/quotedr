# QuoteDr Session Handoff
*Last updated: 2026-04-24 — Written by Sonic for the next session*

---

## What Is QuoteDr?

**QuoteDr.io** — a renovation quoting SaaS built by Adam (ALD Direct Inc.), solo renovation contractor in Ontario. He built it to solve his own problem first, then productize it.

- **GitHub:** github.com/QuoteDr/quotedr (main branch)
- **Live URL:** https://quotedr.io
- **Hosting:** Cloudflare Pages (unlimited bandwidth, free) — NOT Netlify
- **Backend:** Supabase (`axmoffknvblluibuitrq.supabase.co`)
- **Stack:** Plain HTML/CSS/JS, Bootstrap 5, no frameworks
- **Supabase anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso`
- **Google Maps API key:** `AIzaSyD7acqRI6KsoUDTEkyMx36eDNRuuPXdqIA` (for measure tool)

---

## Key Files

| File | Purpose |
|------|---------|
| `quote-builder.html` | Main app — build quotes, manage items, line items, rooms |
| `dashboard.html` | List of all saved quotes, Kanban board |
| `settings.html` | User settings, business profile, Redo Onboarding button in Account tab |
| `interactive-quote-viewer.html` | Client-facing quote view |
| `invoice-viewer.html` | Invoice view with Stripe deposit button |
| `supabase-v2.js` | Supabase client + all auth/DB helpers (cache-busted with ?v= query string) |
| `supabase.js` | Old helpers — mostly superseded, still loaded on some pages |
| `ai-assistant.js` | AI assistant panel |
| `error-reporter.js` | Global JS error catcher → logs to `error_logs` Supabase table |
| `_headers` | Cloudflare cache headers — HTML/JS/CSS all set to no-cache, must-revalidate |

**⚠️ Never load both `supabase.js` AND `supabase-v2.js` on the same page** — duplicate `const` declarations will crash JS.

---

## What the App Does (Current Features)

### Quote Builder (`quote-builder.html`)
- Build quotes room by room with line items
- **Manage Items modal** — add/edit/delete your custom pricing items with categories, unit types, upgrade options, descriptions
- **Quick search** — search items from pricingDatabase AND customItems to add to quote
- **Save All** button — saves all items to cloud (Supabase) + localStorage
- **Cloud sync** — items backed up to `quotes` table as `__ITEMS_BACKUP__` row, restored on every page load
- **Profit/Loss report** per job (collapsible)
- **Room photo attachments** (upload, lightbox viewer)
- **Undo** button per room
- **Measure tool** — opens Google Maps to measure a property
- **3 hamburger menus** in toolbar: File, Tools, Account (mobile-friendly)
- **Quote status** selector (Draft, Sent, Accepted, etc.)
- **Expiry date** with warnings
- **Change Orders** system
- **Client portal** with PIN protection
- **Terms & Conditions** — collapsible section, collapsed by default, badge shows "X/Y selected"
- **Client autocomplete** — type client name, autofills phone/email/address from saved clients
- **Auth guard** — redirects to login.html if no session (no more guest browsing)

### Dashboard (`dashboard.html`)
- Saved quotes list + Kanban board view
- Signature thumbnails, expiry warnings, overdue invoice badges
- Business Insights panel
- Auto-deletes duplicate drafts, shows last opened quote first
- Quote dates display correctly (uses `data.savedAt` with `created_at` fallback)
- Auth guard — redirects to login.html if no session

### Settings (`settings.html`)
- Business profile, quote preferences, pricing & data, integrations, account
- **Redo Onboarding button** in Account tab — clears flag from both Supabase and localStorage
- Auth guard — redirects to login.html if no session

### Other Pages
- **Warranty Certificate** generator
- **Invoice viewer** with Stripe deposit button + print/PDF
- **Send Quote / Send Invoice** modal with email flow (via Resend API)
- **pg_cron** daily 9am UTC for quote-followup edge function

---

## Supabase Schema (Important Tables)

### `quotes` table
Main table for all quotes AND the items backup.

**Confirmed columns:** `id`, `user_id`, `quote_number`, `client_name`, `status`, `total`, `data` (jsonb), `created_at`, `updated_at`

**⚠️ UNCONFIRMED columns** (listed in old docs but may not exist): `client_email`, `client_phone`, `project_address`, `quote_date`, `rooms`, `grand_total`, `terms`. **Do NOT include these in save payloads** — PostgREST returns 400 for unknown columns, silently breaking all saves. Store client info in the `data` JSON column instead.

**`data` JSON column structure (current):**
```json
{
  "clientName": "John Smith",
  "quoteNumber": "2026-001",
  "projectAddress": "123 Main St",
  "clientEmail": "john@example.com",
  "clientPhone": "416-555-1234",
  "rooms": [...],
  "terms": [...],
  "style": {},
  "notes": "",
  "savedAt": "2026-04-24T00:00:00.000Z"
}
```

**Special row:** `quote_number = '__ITEMS_BACKUP__'` — stores all custom items as a JSON snapshot in `data.items_snapshot`. This is the **single source of truth** for items across devices.

**Unique constraint:** `UNIQUE(user_id, quote_number)` — prevents duplicate backup rows.

### `user_data` table (key/value store)
**Schema:** `user_id`, `key`, `value` (jsonb), `updated_at`
**Unique constraint:** `UNIQUE(user_id, key)`

Used for:
- `key='business_profile'` → company info
- `key='company_logo'` → base64 logo
- `key='payment_settings'` → Stripe/payment config
- `key='onboarding_complete'` → `{ complete: true/false }`
- `key='ikea_pricing'` → IKEA estimator data
- `key='estimator_pricing'` → material estimator data

**⚠️ This is NOT a flat table.** `updateUserProfile()` now proxies onboarding calls to `saveOnboardingComplete()`. All reads/writes use the key/value pattern with `user_id + key`.

### `items` table
❌ **DO NOT USE** for per-item saves. Schema is wrong (only `id, user_id, data jsonb`). Was causing items to be overwritten with empty data on startup.

### `item_history` table
Versioned snapshots of items (20 per user, auto-trimmed via trigger). For future restore UI.

### `error_logs` table
Populated by `error-reporter.js` — catches unhandled JS errors and promise rejections. Query with:
```
curl "https://axmoffknvblluibuitrq.supabase.co/rest/v1/error_logs?order=created_at.desc&limit=20" -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>"
```

### RLS Policies on `quotes`
- `"Public quote viewing"` — SELECT USING (true) — anyone can read
- `"Users manage own quotes"` — ALL USING (auth.uid() = user_id) — write own only
- `"Public quote status update"` — UPDATE USING (true)

---

## Items Cloud Sync — How It Works Now

**Save flow:**
1. User hits "Save All" or individual row save
2. `_doBackupItemsToCloud(customItems)` called (inlined directly in quote-builder.html)
3. Gets fresh user via `_supabase.auth.getUser()`
4. Does `upsert` on `quotes` table with `onConflict: 'user_id,quote_number'`
5. Shows ✅ green toast on success

**Restore flow:**
1. On every page load, `_doRestoreItemsFromCloud()` runs (also inlined in quote-builder.html)
2. Fetches the `__ITEMS_BACKUP__` row via `.single()`
3. Merges cloud categories into `customItems` (cloud wins on conflict)
4. Updates localStorage

**Why inlined?** External function calls (`backupItemsToCloud` from `supabase-v2.js`) were silently "not defined" due to load order/scope issues. Inlining guarantees availability.

---

## Client Info Persistence — How It Works Now

**Save:** `collectQuoteData()` gathers `clientName`, `clientEmail`, `clientPhone`, `projectAddress` from form inputs. `saveQuote()` in supabase-v2.js stores them in the `data` JSON column (NOT top-level columns which may not exist).

**Load on refresh:** Startup code reads `ald_active_quote_id` from localStorage → calls `loadQuoteFromSupabase()` → maps `data.clientEmail`/`data.clientPhone`/`data.projectAddress` → calls `applyQuoteData()` which sets the form inputs. Falls back to alternate field names (`email`/`phone`/`project_address`) for older quotes.

**Client autocomplete:** Saved client data lives in `ald_clients` localStorage as an **object keyed by name** (NOT an array). Cloud merge from Supabase `clients` table converts to object format and calls `loadSavedClients()` after merge.

**⚠️ GOTCHA:** `ald_clients` was corrupted to array format at one point. `loadSavedClients()` now auto-detects and fixes this.

---

## Problems Fixed This Session (2026-04-23/24)

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Test Cloud Save button in UI | Leftover debug button | Removed button + `testBackup()` function |
| Onboarding re-triggers after clearing cookies | `onboarding_complete` never saved to Supabase | Added Supabase CDN + supabase-v2.js to onboarding.html |
| `updateUserProfile` silently failing | `user_data` table is key/value but function tried flat column write | Created `saveOnboardingComplete()`/`loadOnboardingComplete()` using key/value pattern |
| `checkOnboardingAndRedirect` using wrong query | Second onboarding check in login.html still used flat-column query | Fixed to use `key='onboarding_complete'` key/value query + quotes fallback |
| Unauthenticated users can use the app | No auth guard on pages | Added `_supabase.auth.getSession()` check to quote-builder, dashboard, settings, onboarding — redirects to login.html |
| Dashboard dates show Dec 31, 1969 | `quote_date` column never saved (and may not exist in DB) | Moved date to `data.savedAt` in JSON; dashboard falls back to `created_at` |
| Client names showing as numbers | Cloud merge saved `ald_clients` as array; `Object.entries` returned indexes as keys | Fixed merge to write as object; `loadSavedClients` auto-repairs arrays |
| Terms & Conditions cluttering the builder | Long list of checkboxes always visible | Made section collapsible (collapsed by default) with badge showing selected count |
| Client email/phone disappearing on refresh | Multiple causes (see below) | Multi-step fix |
| — email/phone not in save payload | `saveQuote` stored as `email`/`phone` in data JSON but `applyQuoteData` read `clientEmail`/`clientPhone` | Standardized: save stores `clientEmail`/`clientPhone`, load checks both field names |
| — `quote_date` breaking saves | Column likely doesn't exist; PostgREST rejects unknown columns with 400 | Removed `quote_date` from payload, stored in `data.savedAt` instead |
| — `client_email`/`client_phone` breaking saves | Same issue — columns may not exist | Removed from payload, all client info in `data` JSON only |
| — Browser serving stale JS | `_headers` had `max-age=3600` for JS; phone cached old supabase-v2.js | Changed to `no-cache, must-revalidate`; added cache-buster `?v=` to all script tags |
| Redo Onboarding not available | No UI to re-trigger onboarding | Added button in Settings → Account tab; `resetOnboarding()` clears Supabase + localStorage |

---

## Known Issues / Still To Do

### 🔴 QuickBooks Integration (Not Working Yet)
- QB OAuth flow is built (`qb-callback.html`, `qb-oauth` and `qb-sync` edge functions)
- QB credentials stored as Supabase Edge Function secrets (rotated — was hardcoded in repo!)
- CSRF state validation added
- `intuit_tid` logging added
- Compliance questionnaire completed on developer.intuit.com
- **BUT: never fully tested end-to-end with sandbox**
- Next step: test the OAuth flow, then test syncing a quote to QB sandbox

### 🟡 Two Manage Items Modals
- One in `quote-builder.html` (the real one, being actively developed)
- One in `settings.html` (old, not updated)
- They conflict — Adam kept accidentally using the settings one
- Should either consolidate or remove the settings one

### 🟡 Confirm Supabase Schema
- Need to verify which columns actually exist on the `quotes` table
- Run `SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes'` in Supabase SQL editor
- If `client_email`, `client_phone`, `project_address`, `quote_date` don't exist, either create them or leave everything in `data` JSON (current approach)

### 🟡 Email Routing
- `support@quotedr.io`, `privacy@quotedr.io`, `quotes@quotedr.io` need Cloudflare Email Routing set up

### 🟡 Cache-Buster Maintenance
- All HTML files reference `supabase-v2.js?v1776989215`
- When making significant JS changes, update the version string or automate it in deploy
- `_headers` now sets all JS/CSS to `no-cache, must-revalidate` which helps but adds a round-trip on each page load

### 🟢 Future: QuoteDr Scan
- Mobile app companion — scan a room with phone camera, auto-populate sq footage into active quote
- Flutter + ARKit/ARCore + Supabase
- After QuoteDr has paying customers

---

## Critical Lessons Learned

1. **PostgREST (Supabase) rejects unknown columns** — adding a column to a save payload that doesn't exist in the DB silently breaks the entire save. Always verify schema first.
2. **Cloudflare caches JS aggressively** — even with `_headers`, browsers hold on to old JS. Use cache-buster query strings on script tags.
3. **`user_data` is a key/value table** — not a flat profile table. Always use `user_id + key` pattern.
4. **`ald_clients` must be an object** (keyed by name), NOT an array. Array format breaks `Object.entries` → client names show as numbers.
5. **`applyQuoteData` field names must match save format** — the save and load must agree on `clientEmail` vs `email`, etc.
6. **Test button cleanup** — remove debug UI before shipping.

---

## Coding Agent Rules (Non-Negotiable)
- **ALL coding tasks → Qwen3-Coder-30B** via LM Studio (`http://host.docker.internal:3000/v1`, model: `qwen/qwen3-coder-30b`)
- **NEVER use Claude Code** unless Adam explicitly asks
- **Sonic (Claude) orchestrates, Qwen executes**
- After every code change: run syntax check before committing
- Always `git add -A && git commit -m "..." && git push` after changes
- Verify Cloudflare is serving latest code after deploy: `curl -s "https://quotedr.io/supabase-v2.js" | grep "some_new_string"`

---

## How to Pick Up
1. Read this file
2. Items cloud sync is working ✅
3. Client info persistence is working ✅ (email/phone/address now save to data JSON)
4. Auth guards on all protected pages ✅
5. Onboarding flow fixed ✅
6. QB OAuth needs end-to-end test
7. Consolidate Manage Items modals
8. Verify actual Supabase schema vs assumed schema
9. Ask Adam what he wants to tackle next!
