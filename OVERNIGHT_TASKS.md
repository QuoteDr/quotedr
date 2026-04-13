# QuoteDr.io Overnight Task List
# Status: [ ] = todo, [x] = done, [~] = partial/needs review

## TASK 1 — Fix sign out buttons [ ]
All signOut() calls in quote-builder.html, dashboard.html, settings.html do nothing.
Root cause: supabase.js defines signOut() but the Supabase client init at top of supabase.js
uses `window.supabase` which may conflict with the variable name.
Fix: In supabase.js, rename the client variable from `supabase` to `_supabase` everywhere,
and update all references inside supabase.js (auth calls, from/table calls etc).
Also ensure signOut() does: await _supabase.auth.signOut(); window.location.href = 'login.html';

## TASK 2 — "Hide from Client" toggles in Settings business profile [ ]
File: settings.html
For each field in the Business Profile card (business_name, owner_name, address, city/province/postal,
phone, email, hst_number), add a small "Hide from client" checkbox inline next to the field label.
Store hidden fields in localStorage as 'ald_hidden_profile_fields' (array of field keys).
Save/load with the profile save button.
In interactive-quote-viewer.html and invoice-viewer.html, when rendering businessInfoDisplay,
check ald_hidden_profile_fields and skip hidden fields.

## TASK 3 — Back button in Dashboard [ ]
File: dashboard.html
Add a back button in the top-left of the navbar, styled exactly like the one in settings.html:
<a href="quote-builder.html" class="btn btn-outline-light btn-sm">
    <i class="fas fa-arrow-left"></i> Back
</a>
Place it to the left of the "QuoteDr." brand text.

## TASK 4 — Empty state message in Dashboard [ ]
File: dashboard.html
In the renderQuotes() function, find the empty state HTML:
'<p>Loading quotes...</p>' or similar
Change it to: '<p>No quotes saved yet! <a href="#" onclick="newQuote()">Build your first quote →</a></p>'
Also fix the initial loading state — the div starts with "Loading quotes..." text.
Change initial inner HTML of quotesList to show a spinner, then after load if empty show the friendly message.

## TASK 5 — Fix Settings save getting stuck [ ]
File: settings.html
The saveProfile() function disables the button and shows spinner, but if saveBusinessProfile()
throws or the tables don't exist yet (schema not run), it never re-enables the button.
Fix: wrap the entire saveBusinessProfile call in try/catch, always re-enable the button in a finally block.
Also add a fallback: if Supabase save fails, save to localStorage instead and show a warning message
"Saved locally (cloud sync unavailable)" so it never gets stuck.

## TASK 6 — Onboarding flow for first-time users [ ]
Files: create onboarding.html, update login.html to redirect first-time users there
Build a multi-step onboarding wizard (4 steps):
Step 1: Welcome — "Let's set up your QuoteDr account" with a Start button
Step 2: Business Info — same fields as Settings (business name, address, phone, HST). Save to localStorage.
Step 3: Logo Upload — file input accepting SVG/PNG/JPG. Stores as base64 in localStorage key 'ald_logo'.
  Show preview. Include text "SVG recommended for crisp printing".
Step 4: Done — "You're all set! Start building quotes." button goes to quote-builder.html.
In login.html after successful sign in, check localStorage for 'ald_onboarding_complete'.
If not set, redirect to onboarding.html. If set, go to quote-builder.html.
Onboarding sets localStorage 'ald_onboarding_complete' = '1' on completion.
Add a "Skip" button on every step that goes straight to quote-builder.html and sets the flag.

## TASK 7 — Move "Save Template" button to each room header [ ]
File: quote-builder.html
Currently there is a global "Save Template" button in the toolbar area.
Goal: Add a "Save as Template" button to each individual room's header div (next to the Delete Room button).
When clicked, it saves ONLY that room (not all rooms) as a template.
Find the room header HTML in the renderRooms() function (look for the delete room button per room).
Add next to it:
<button onclick="saveRoomAsTemplate(${room.id})" class="btn btn-sm btn-info text-white ms-1" title="Save this room as a template">
    <i class="fas fa-bookmark"></i>
</button>
Add the saveRoomAsTemplate(roomId) function:
- Finds the room by ID in the rooms array
- Prompts for a template name (default: room name)
- Saves just that room to localStorage 'ald_quote_templates'
Keep the existing global saveTemplate() function as-is.

## TASK 8 — Templates dropdown: top 15, toggle hide, "View All" page [ ]
File: quote-builder.html
Current loadTemplatesDropdown() shows all templates.
Changes needed:
a) Dropdown shows max 15 templates (sorted by a 'pinOrder' or recency). Second click hides it.
b) At the TOP of the dropdown, add a "⚙ Manage Templates" button that opens a new modal or page.
c) Create a modal (id="manageTemplatesModal") with a drag-sortable list of ALL templates.
   User drags to reorder. Top 15 in the sorted order appear in the quick dropdown.
   Use the existing SortableJS library (already loaded) for drag-and-drop.
   Each template row shows name, room count, a delete button.
   Save order to localStorage 'ald_template_order' (array of template IDs in order).

## TASK 9 — Additional improvements [ ]
a) Add quote number auto-increment: read last quote number from localStorage 'ald_last_quote_num',
   increment by 1, auto-fill the quoteNumber field on page load if it is empty.
b) Add a "Duplicate Quote" button somewhere sensible (maybe in dashboard quote cards) that copies
   a quote and opens it as a new draft.
c) Add client phone + email to the dashboard quote card subtitle line so you can see contact info at a glance.
d) In the quote builder, when a client is selected from autocomplete, auto-fill address/phone/email
   fields if that client has saved data.
