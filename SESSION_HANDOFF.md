# QuoteDr Session Handoff
*Last updated: 2026-04-26 — Updated by Sonic*

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
| `supabase.js` | Old helpers — NOT loaded on any page (confirmed audit 2026-04-25) |
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
- **IKEA Quick Quote** — Tools menu item, parses IKEA order PDF
- **Floor Plan Scanner** — Tools menu item (see below ⬇️)

### Floor Plan Scanner (NEW — 2026-04-26)
**What it does:** Upload a floor plan photo or PDF → AI reads dimensions → auto-populates rooms + material quantities into the quote builder.

**How it works:**
1. **Step 1 — Upload:** JPG/PNG/WebP or PDF. For PDFs with multiple pages, a page picker (← Page X of Y →) lets you navigate to the right floor plan page before analyzing.
2. **Step 2 — Settings:** Scale (dropdown, 10 options), ceiling height, trades to estimate (flooring, drywall, paint, framing, tile), and **Overall Building Dimensions** (optional width × depth fields).
3. **Step 3 — Review:** Extracted rooms with editable names, quantities, and checkboxes. Add selected rooms to quote with one click.

**Edge function:** `analyze-floor-plan` deployed on Supabase. Uses **GPT-4o Vision** (`detail: 'high'`). Requires `OPENAI_API_KEY` Supabase secret.

**Known accuracy limitation:** Plans with only string dimensions on the outside (no per-room labels) are harder for the AI. The "Overall Building Dimensions" field was added to anchor the AI — enter total width × depth from the drawing for better results. Even with this, small rooms (kitchen, bath) may be slightly off. The user should always review and edit before adding to quote.

**Next improvement idea:** Swap GPT-4o for Claude Vision (Anthropic) — early testing suggests Claude reads architectural drawings more accurately at the same cost. Requires adding `ANTHROPIC_API_KEY` as a Supabase secret and updating the edge function to call `https://api.anthropic.com/v1/messages`.

**Files changed:**
- `quote-builder.html` — Floor Plan Scanner modal + all JS functions (`openFloorPlanModal`, `_fpRenderStep1`, `_fpHandleFile`, `_fpRenderPdfPage`, `_fpChangePage`, `_fpGoToStep2`, `_fpAnalyze`, `_fpRenderStep3`, `_fpToggleRoom`, `_fpAddToQuote`)
- `supabase/functions/analyze-floor-plan/index.ts` — edge function

**Commits:** `2cd9ed0`, `b2c693e`, `18d1661`

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
- **Welcome email** on signup — `send-welcome-email` edge function deployed, fires on new user registration
- **pg_cron** daily 9am UTC for quote-followup edge function

---

## Supabase Edge Functions (Deployed)

| Function | Purpose |
|----------|---------|
| `send-quote-email` | Sends quote to client via Resend |
| `send-invoice-email` | Sends invoice to client via Resend |
| `send-welcome-email` | Welcome email on new user signup (uses `RESEND_API_KEY`) |
| `verify-portal-pin` | Server-side PIN validation for client portal |
| `qb-oauth` | QuickBooks OAuth token exchange |
| `qb-sync` | Push quote data to QuickBooks |
| `analyze-floor-plan` | GPT-4o Vision floor plan analysis (uses `OPENAI_API_KEY`) |

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

### `error_logs` table
Populated by `error-reporter.js` — catches unhandled JS errors and promise rejections.

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

---

## Known Issues / Still To Do

### 🔴 Floor Plan Scanner — Accuracy (In Progress)
- GPT-4o Vision gets room-level dimensions wrong on plans with only string dimensions (no per-room labels)
- **Next fix:** Swap edge function to use **Claude Vision** (Anthropic API) — same cost, better spatial accuracy
- To implement: add `ANTHROPIC_API_KEY` as Supabase secret, update `analyze-floor-plan/index.ts` to call `https://api.anthropic.com/v1/messages` with `claude-sonnet-4-6` model and image base64 input
- Alternative if Claude still struggles: two-pass approach (pass 1: extract raw dimension strings, pass 2: assign to rooms)

### 🟡 QuickBooks Integration (Code Fixed — Needs Deploy + End-to-End Test)
- QB OAuth flow is built (`qb-callback.html`, `qb-oauth` and `qb-sync` edge functions)
- QB credentials stored as Supabase Edge Function secrets
- CSRF state validation added
- `intuit_tid` logging added
- **BUT: never fully tested end-to-end with sandbox**
- Next step: deploy `qb-oauth` and `qb-sync`, then test the OAuth flow

### 🟡 Email Routing
- `support@quotedr.io`, `privacy@quotedr.io`, `quotes@quotedr.io` need Cloudflare Email Routing set up

### 🟡 Confirm Supabase Schema
- Run `SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes'` in Supabase SQL editor
- Verify which columns actually exist vs what code assumes

### 🟡 Stripe Test → Live Key Swap
- Still on test keys — swap before real users

### 🟢 Future Features
- **Subscription/billing gate** — Stripe paywall
- **Quote expiry reminders** — pg_cron "quote expires in 48h" client emails
- **Centralize anon key** — currently hardcoded in 15+ files
- **Terms of Service / Privacy Policy** — fill with real legal content
- **QuoteDr Scan** — mobile companion app, scan room with phone camera → auto-populate sqft (Flutter + ARKit/ARCore)

---

## Critical Lessons Learned

1. **PostgREST (Supabase) rejects unknown columns** — adding a column to a save payload that doesn't exist in the DB silently breaks the entire save. Always verify schema first.
2. **Cloudflare caches JS aggressively** — even with `_headers`, browsers hold on to old JS. Use cache-buster query strings on script tags.
3. **`user_data` is a key/value table** — not a flat profile table. Always use `user_id + key` pattern.
4. **`ald_clients` must be an object** (keyed by name), NOT an array. Array format breaks `Object.entries` → client names show as numbers.
5. **Deno bundler hates apostrophes in template literals** — `you're`, `let's` inside HTML inside JS template literal → unexpected EOF. Use string array concatenation instead.
6. **`supabaseAdmin` (service role) required in edge functions** — RLS with anon key blocks writes since `auth.uid()` is null server-side.
7. **PDF.js renders one page at a time** — for multi-page PDFs, store the `pdf` doc object and re-render on page change. Don't reload the file.

---

## Coding Agent Rules (Non-Negotiable)
- **ALL coding tasks → Qwen3-Coder-30B** via LM Studio (`http://host.docker.internal:3000/v1`, model: `qwen/qwen3-coder-30b`)
- **NEVER use Claude Code** unless Adam explicitly asks
- **Sonic (Claude) orchestrates, Qwen executes**
- After every code change: run syntax check before committing
- Always `git add -A && git commit -m "..." && git push` after changes
- Verify Cloudflare is serving latest code after deploy

---

## How to Pick Up
1. Read this file
2. Floor Plan Scanner is live and working — accuracy improvement (Claude Vision swap) is the next coding task
3. QB OAuth needs end-to-end test after deploying updated edge functions
4. Welcome email is live ✅
5. All pre-launch security work from 2026-04-25 is complete ✅
6. Ask Adam what he wants to tackle next!
