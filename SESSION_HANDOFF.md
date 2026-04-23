# QuoteDr Session Handoff
*Last updated: 2026-04-23 — Written by Sonic for the next session*

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
| `settings.html` | User settings, business profile, Manage Items (duplicate modal — see issues) |
| `interactive-quote-viewer.html` | Client-facing quote view |
| `invoice-viewer.html` | Invoice view with Stripe deposit button |
| `supabase-v2.js` | Supabase client + all auth/DB helpers |
| `supabase.js` | Old helpers — mostly superseded, still loaded on some pages |
| `ai-assistant.js` | AI assistant panel |
| `_headers` | Cloudflare cache headers — prevents HTML caching |

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

### Dashboard (`dashboard.html`)
- Saved quotes list + Kanban board view
- Signature thumbnails, expiry warnings, overdue invoice badges
- Business Insights panel
- Auto-deletes duplicate drafts, shows last opened quote first

### Other Pages
- **Warranty Certificate** generator
- **Invoice viewer** with Stripe deposit button + print/PDF
- **Send Quote / Send Invoice** modal with email flow (via Resend API)
- **pg_cron** daily 9am UTC for quote-followup edge function

---

## Supabase Schema (Important Tables)

### `quotes` table
Main table for all quotes AND the items backup.
```
id, user_id, quote_number, client_name, client_email, client_phone,
project_address, rooms (jsonb), grand_total, terms, status,
created_at, updated_at, data (jsonb), ...
```
**Special row:** `quote_number = '__ITEMS_BACKUP__'` — stores all custom items as a JSON snapshot in `data.items_snapshot`. This is the **single source of truth** for items across devices.

**Unique constraint added:** `UNIQUE(user_id, quote_number)` — prevents duplicate backup rows.

### `items` table
❌ **DO NOT USE** for per-item saves. Schema is wrong (only `id, user_id, data jsonb`). Was causing items to be overwritten with empty data on startup.

### `item_history` table
Versioned snapshots of items (20 per user, auto-trimmed via trigger). For future restore UI.

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

## Problems We Fixed (This Session)

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| "Item saved" button lies, cloud not saving | `backupItemsToCloud` not defined (supabase.js not loaded) | Inlined `_doBackupItemsToCloud` in quote-builder.html |
| Cloud save hangs forever | `getCurrentUser()` returns stale session, `_supabase` auth session mismatch | Switch to `_supabase.auth.getUser()` directly |
| 100+ duplicate `__ITEMS_BACKUP__` rows | update not matching (RLS), falls through to insert every time | Added `UNIQUE(user_id, quote_number)` constraint + cleaned up dupes |
| `.single()` on restore fails | Multiple rows returned | Cleanup + unique constraint |
| False red "Cloud save failed" toast | `.catch()` firing from stale cached code on phone | Removed all `.catch()` red toasts, only show result of actual `.then()` |
| Broken JS — no buttons working | Extra `}` brace introduced during bracket fix | Syntax check via node --check, fixed brace |
| Desktop not getting phone items | `loadItemsFromSupabase` (items table) running on startup and overwriting localStorage | Disabled items table load; cloud restore now always runs on load |

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

### 🟡 Test Button Still in UI
- Blue "🔍 Test Cloud Save" button still in Manage Items modal footer
- Should be removed before production

### 🟡 Cloudflare Cache
- `_headers` file set to no-cache for HTML
- JS/CSS files still cached by Cloudflare
- After deploys, hard refresh (Ctrl+Shift+R) sometimes needed
- Cloudflare serves `/quote-builder` (no extension) — `/quote-builder.html` returns empty!

### 🟡 Email Routing
- `support@quotedr.io`, `privacy@quotedr.io`, `quotes@quotedr.io` need Cloudflare Email Routing set up

### 🟢 Future: QuoteDr Scan
- Mobile app companion — scan a room with phone camera, auto-populate sq footage into active quote
- Flutter + ARKit/ARCore + Supabase
- After QuoteDr has paying customers

---

## Coding Agent Rules (Non-Negotiable)
- **ALL coding tasks → Qwen3-Coder-30B** via LM Studio (`http://host.docker.internal:3000/v1`, model: `qwen/qwen3-coder-30b`)
- **NEVER use Claude Code** unless Adam explicitly asks
- **Sonic (Claude) orchestrates, Qwen executes**
- After every code change: run syntax check (`node --check`) before committing
- Always `git add -A && git commit -m "..." && git push` after changes
- Check `python3 -c "import re; ..."` to extract and validate inline JS from HTML

---

## How to Pick Up
1. Read this file
2. Items cloud sync is working ✅
3. QB OAuth needs end-to-end test
4. Clean up: remove test button, consolidate Manage Items modals
5. Ask Adam what he wants to tackle next!
