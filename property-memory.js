(function(window, document) {
    'use strict';

    var PROPERTY_MEMORY_KEY_PREFIX = 'property_memory:';
    var PROPERTY_MEMORY_LOCAL_PREFIX = 'ald_property_memory:';
    var PROPERTY_MEMORY_VERSION = 1;
    var addressLoadSequence = 0;
    var addressInputTimer = null;
    var currentRecord = null;
    var currentNormalizedAddress = '';
    var activeAutomaticMarkupRule = null;
    var additionalContactSequence = 0;
    var reminderSequence = 0;
    var editingDisplayAddress = '';
    var editingNormalizedAddress = '';
    var editingReminders = [];
    var managerRecords = [];
    var managerCloudConfirmed = false;
    var pendingDeleteKey = '';

    function normalizePropertyAddress(value) {
        var normalized = String(value || '').trim().toLowerCase();
        if (!normalized) return '';
        if (typeof normalized.normalize === 'function') {
            normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        }
        normalized = normalized
            .replace(/#/g, ' unit ')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\bstreet\b/g, 'st')
            .replace(/\bavenue\b/g, 'ave')
            .replace(/\broad\b/g, 'rd')
            .replace(/\bboulevard\b/g, 'blvd')
            .replace(/\bdrive\b/g, 'dr')
            .replace(/\blane\b/g, 'ln')
            .replace(/\bcourt\b/g, 'ct')
            .replace(/\bterrace\b/g, 'ter')
            .replace(/\bhighway\b/g, 'hwy')
            .replace(/\bapartment\b/g, 'apt')
            .replace(/\bsuite\b/g, 'unit')
            .replace(/\s+/g, ' ')
            .trim();
        return normalized;
    }

    function propertyMemoryStorageKey(normalizedAddress) {
        return PROPERTY_MEMORY_KEY_PREFIX + encodeURIComponent(normalizedAddress || '');
    }

    function propertyMemoryLocalKey(normalizedAddress) {
        return PROPERTY_MEMORY_LOCAL_PREFIX + encodeURIComponent(normalizedAddress || '');
    }

    function propertyMemoryScopedLocalPrefix(userId) {
        return PROPERTY_MEMORY_LOCAL_PREFIX + encodeURIComponent(userId || '') + ':';
    }

    function propertyMemoryScopedLocalKey(userId, normalizedAddress) {
        return propertyMemoryScopedLocalPrefix(userId) + encodeURIComponent(normalizedAddress || '');
    }

    function cleanText(value) {
        return String(value || '').trim();
    }

    function cleanContact(contact) {
        contact = contact || {};
        return {
            name: cleanText(contact.name),
            phone: cleanText(contact.phone),
            email: cleanText(contact.email)
        };
    }

    function cleanAdditionalContact(contact) {
        contact = contact || {};
        return {
            role: cleanText(contact.role),
            name: cleanText(contact.name),
            phone: cleanText(contact.phone),
            email: cleanText(contact.email)
        };
    }

    function additionalContactHasData(contact) {
        contact = cleanAdditionalContact(contact);
        return !!(contact.role || contact.name || contact.phone || contact.email);
    }

    function normalizeAdditionalContacts(contacts) {
        if (!Array.isArray(contacts)) return [];
        return contacts.map(cleanAdditionalContact).filter(additionalContactHasData);
    }

    function normalizeMarkupPercent(value) {
        if (value === '' || value === null || value === undefined) return null;
        var percent = Number(value);
        if (!isFinite(percent)) return null;
        return Math.max(0, Math.min(100, percent));
    }

    function normalizeMatchText(value) {
        return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function createPropertyReminderId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'property-reminder-' + window.crypto.randomUUID();
        reminderSequence += 1;
        return 'property-reminder-' + Date.now().toString(36) + '-' + reminderSequence.toString(36);
    }

    function legacyPropertyReminderId(raw) {
        raw = raw || {};
        var target = raw.target || {};
        var source = [raw.label || raw.title, raw.message || raw.note, raw.targetType || raw.mode || target.type, raw.category || target.category, raw.itemReference || raw.reference || target.itemReference || target.reference, raw.itemLabel || target.itemLabel || target.name]
            .map(cleanText)
            .join('|');
        var hash = 0;
        for (var index = 0; index < source.length; index += 1) hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
        return 'property-reminder-legacy-' + Math.abs(hash);
    }

    function normalizePropertyReminder(raw) {
        raw = raw || {};
        var target = raw.target || {};
        var targetType = cleanText(raw.targetType || raw.mode || target.type).toLowerCase() === 'item' ? 'item' : 'category';
        return {
            id: cleanText(raw.id) || legacyPropertyReminderId(raw),
            label: cleanText(raw.label || raw.title),
            message: cleanText(raw.message || raw.note),
            targetType: targetType,
            category: cleanText(raw.category || target.category),
            itemReference: cleanText(raw.itemReference || raw.reference || target.itemReference || target.reference),
            itemLabel: cleanText(raw.itemLabel || target.itemLabel || target.name)
        };
    }

    function propertyReminderHasData(reminder) {
        reminder = normalizePropertyReminder(reminder);
        if (!reminder.message) return false;
        return reminder.targetType === 'item' ? !!reminder.itemReference : !!reminder.category;
    }

    function normalizePropertyReminders(reminders) {
        if (!Array.isArray(reminders)) return [];
        var seen = {};
        return reminders.map(normalizePropertyReminder).filter(function(reminder) {
            if (!propertyReminderHasData(reminder) || seen[reminder.id]) return false;
            seen[reminder.id] = true;
            return true;
        });
    }

    function normalizePropertyMemoryRecord(raw, displayAddress, normalizedAddress) {
        raw = raw || {};
        var access = raw.accessLogistics || {};
        var conditions = raw.knownConditions || {};
        var contacts = raw.propertyContacts || {};
        var markupRule = raw.markupRule || {};
        return {
            version: PROPERTY_MEMORY_VERSION,
            normalizedAddress: normalizedAddress || normalizePropertyAddress(raw.normalizedAddress || displayAddress),
            displayAddress: cleanText(displayAddress || raw.displayAddress),
            generalSiteNotes: cleanText(raw.generalSiteNotes),
            accessLogistics: {
                parking: cleanText(access.parking),
                entryCode: cleanText(access.entryCode),
                stairsElevator: cleanText(access.stairsElevator),
                restrictedHours: cleanText(access.restrictedHours),
                loadingDumpster: cleanText(access.loadingDumpster)
            },
            knownConditions: {
                olderConstruction: cleanText(conditions.olderConstruction),
                wiring: cleanText(conditions.wiring),
                plasterMasonry: cleanText(conditions.plasterMasonry),
                fragileFinishes: cleanText(conditions.fragileFinishes),
                hazards: cleanText(conditions.hazards),
                hiddenConditions: cleanText(conditions.hiddenConditions)
            },
            measurements: cleanText(raw.measurements),
            attachmentReferences: cleanText(raw.attachmentReferences),
            propertyContacts: {
                manager: cleanContact(contacts.manager),
                tenant: cleanContact(contacts.tenant),
                superintendent: cleanContact(contacts.superintendent),
                additional: normalizeAdditionalContacts(contacts.additional)
            },
            workHistory: cleanText(raw.workHistory),
            markupRule: {
                percent: normalizeMarkupPercent(markupRule.percent),
                note: cleanText(markupRule.note),
                alwaysApply: markupRule.alwaysApply === true
            },
            reminders: normalizePropertyReminders(raw.reminders || raw.warningTriggers),
            updatedAt: raw.updatedAt || null
        };
    }

    function propertyMemoryHasMeaningfulData(record) {
        if (!record) return false;
        var normalized = normalizePropertyMemoryRecord(record, record.displayAddress, record.normalizedAddress);
        var textValues = [
            normalized.generalSiteNotes,
            normalized.accessLogistics.parking,
            normalized.accessLogistics.entryCode,
            normalized.accessLogistics.stairsElevator,
            normalized.accessLogistics.restrictedHours,
            normalized.accessLogistics.loadingDumpster,
            normalized.knownConditions.olderConstruction,
            normalized.knownConditions.wiring,
            normalized.knownConditions.plasterMasonry,
            normalized.knownConditions.fragileFinishes,
            normalized.knownConditions.hazards,
            normalized.knownConditions.hiddenConditions,
            normalized.measurements,
            normalized.attachmentReferences,
            normalized.workHistory,
            normalized.markupRule.note
        ];
        var contactValues = ['manager', 'tenant', 'superintendent'].some(function(role) {
            var contact = normalized.propertyContacts[role];
            return !!(contact.name || contact.phone || contact.email);
        });
        contactValues = contactValues || normalized.propertyContacts.additional.some(additionalContactHasData);
        return textValues.some(Boolean) || contactValues || normalized.markupRule.percent !== null || normalized.markupRule.alwaysApply || normalized.reminders.length > 0;
    }

    function getAddressInput() {
        return document.getElementById('projectAddress');
    }

    function getCurrentDisplayAddress() {
        var input = getAddressInput();
        return input ? cleanText(input.value) : '';
    }

    function readLocalRecord(normalizedAddress, userId) {
        if (!normalizedAddress) return null;
        try {
            var key = userId ? propertyMemoryScopedLocalKey(userId, normalizedAddress) : propertyMemoryLocalKey(normalizedAddress);
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (normalizePropertyAddress(parsed.normalizedAddress) !== normalizedAddress) return null;
            return normalizePropertyMemoryRecord(parsed, parsed.displayAddress, normalizedAddress);
        } catch (error) {
            return null;
        }
    }

    function writeLocalRecord(record, userId) {
        try {
            var key = userId
                ? propertyMemoryScopedLocalKey(userId, record.normalizedAddress)
                : propertyMemoryLocalKey(record.normalizedAddress);
            localStorage.setItem(key, JSON.stringify(record));
        } catch (error) {
            console.warn('Property memory local save failed:', error);
        }
    }

    function removeLocalRecord(normalizedAddress, userId) {
        if (!normalizedAddress) return;
        try {
            if (userId) localStorage.removeItem(propertyMemoryScopedLocalKey(userId, normalizedAddress));
            else localStorage.removeItem(propertyMemoryLocalKey(normalizedAddress));
        } catch (error) {
            console.warn('Property memory local removal failed:', error);
        }
    }

    async function getPropertyMemoryUser() {
        if (typeof getCurrentUser !== 'function') return null;
        try {
            return await getCurrentUser();
        } catch (error) {
            return null;
        }
    }

    async function loadPropertyMemoryRecord(displayAddress) {
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) return null;
        var hasAuthLookup = typeof getCurrentUser === 'function';
        var user = await getPropertyMemoryUser();
        if (hasAuthLookup && !user) return null;
        var localRecord = readLocalRecord(normalizedAddress, user && user.id);
        if (!user || typeof _supabase === 'undefined') return localRecord;
        try {
            var result = await _supabase
                .from('user_data')
                .select('value')
                .eq('user_id', user.id)
                .eq('key', propertyMemoryStorageKey(normalizedAddress))
                .maybeSingle();
            if (result.error) throw result.error;
            var cloudRecord = result.data && result.data.value;
            if (!cloudRecord || normalizePropertyAddress(cloudRecord.normalizedAddress) !== normalizedAddress) return localRecord;
            var normalizedRecord = normalizePropertyMemoryRecord(cloudRecord, cloudRecord.displayAddress || displayAddress, normalizedAddress);
            writeLocalRecord(normalizedRecord, user.id);
            return normalizedRecord;
        } catch (error) {
            console.warn('Property memory cloud load failed:', error);
            return localRecord;
        }
    }

    function setEntryState(record, normalizedAddress, loading) {
        var button = document.getElementById('propertyMemoryBtn');
        var badge = document.getElementById('propertyMemorySavedBadge');
        var status = document.getElementById('propertyMemoryAddressStatus');
        var hasAddress = !!normalizedAddress;
        var hasSaved = !!record;
        if (button) {
            button.disabled = !hasAddress || loading === true;
            button.setAttribute('aria-label', hasSaved ? 'Open saved property memory for this address' : 'Add property memory for this address');
        }
        if (badge) badge.hidden = !hasSaved;
        if (status) {
            var automaticPercent = record && record.markupRule && record.markupRule.alwaysApply
                ? normalizeMarkupPercent(record.markupRule.percent)
                : null;
            status.textContent = loading
                ? 'Checking saved property information...'
                : (automaticPercent !== null
                    ? 'Saved information is available. Automatic ' + automaticPercent + '% markup is enabled for rooms without a manual room markup.'
                    : (hasSaved ? 'Saved information is available for this address.' : ''));
        }
    }

    async function refreshForCurrentAddress() {
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        var sequence = ++addressLoadSequence;
        currentNormalizedAddress = normalizedAddress;
        currentRecord = null;
        activeAutomaticMarkupRule = null;
        setEntryState(null, normalizedAddress, !!normalizedAddress);
        if (!normalizedAddress) return null;
        var record = await loadPropertyMemoryRecord(displayAddress);
        if (sequence !== addressLoadSequence || normalizedAddress !== normalizePropertyAddress(getCurrentDisplayAddress())) return null;
        currentRecord = record;
        currentNormalizedAddress = normalizedAddress;
        setEntryState(record, normalizedAddress, false);
        activateAutomaticMarkupRule(record, normalizedAddress, { applyNow: true });
        evaluatePropertyReminders();
        return record;
    }

    function ensureModal() {
        var existing = document.getElementById('propertyMemoryModal');
        if (existing) return existing;
        var wrapper = document.createElement('div');
        wrapper.innerHTML = [
            '<div class="modal fade" id="propertyMemoryModal" tabindex="-1" aria-labelledby="propertyMemoryModalLabel" aria-hidden="true">',
            '  <div class="modal-dialog modal-xl modal-dialog-scrollable">',
            '    <div class="modal-content">',
            '      <div class="modal-header bg-primary text-white">',
            '        <div>',
            '          <h2 class="modal-title fs-5" id="propertyMemoryModalLabel"><i class="fas fa-house-circle-check me-2" aria-hidden="true"></i><span id="propertyMemoryModalTitleText">Property memory</span> <span class="badge bg-light text-primary ms-1" id="propertyMemoryModalSavedBadge" hidden>Saved</span></h2>',
            '          <div class="small opacity-75" id="propertyMemoryModalAddress"></div>',
            '        </div>',
            '        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>',
            '      </div>',
            '      <div class="modal-body">',
            '        <div class="alert alert-info py-2 small" role="note"><i class="fas fa-location-dot me-1" aria-hidden="true"></i>This information is saved to this property address. Property contacts stay separate from the quote client and personal client preferences.</div>',
            '        <p class="small fw-semibold text-muted" id="propertyMemoryModalStateMessage"></p>',
            '        <div id="propertyMemoryFormStatus" class="alert d-none" role="status" aria-live="polite"></div>',
            '        <fieldset class="property-memory-section">',
            '          <legend>General site notes</legend>',
            '          <label class="form-label" for="propertyGeneralSiteNotes">Details worth remembering for future visits</label>',
            '          <textarea class="form-control" id="propertyGeneralSiteNotes" rows="3" placeholder="Site layout, recurring concerns, preferred setup locations..."></textarea>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Access and logistics</legend>',
            '          <div class="row g-3">',
            '            <div class="col-md-6"><label class="form-label" for="propertyParking">Parking</label><textarea class="form-control" id="propertyParking" rows="2" placeholder="Permits, reserved spaces, street restrictions..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyEntryCode">Gate, buzzer, or access code</label><textarea class="form-control" id="propertyEntryCode" rows="2" placeholder="Entry instructions and codes..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyStairsElevator">Stairs and elevator</label><textarea class="form-control" id="propertyStairsElevator" rows="2" placeholder="Floor, elevator booking, narrow stairs..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyRestrictedHours">Restricted hours</label><textarea class="form-control" id="propertyRestrictedHours" rows="2" placeholder="Building or neighbourhood work-hour limits..."></textarea></div>',
            '            <div class="col-12"><label class="form-label" for="propertyLoadingDumpster">Loading and dumpster constraints</label><textarea class="form-control" id="propertyLoadingDumpster" rows="2" placeholder="Loading zones, disposal rules, bin placement..."></textarea></div>',
            '          </div>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Known conditions</legend>',
            '          <div class="row g-3">',
            '            <div class="col-md-6"><label class="form-label" for="propertyOlderConstruction">Older construction</label><textarea class="form-control" id="propertyOlderConstruction" rows="2" placeholder="Age, unusual assemblies, previous renovations..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyWiring">Wiring and electrical</label><textarea class="form-control" id="propertyWiring" rows="2" placeholder="Known wiring types, panel concerns, access..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyPlasterMasonry">Plaster, masonry, and substrates</label><textarea class="form-control" id="propertyPlasterMasonry" rows="2" placeholder="Plaster walls, concrete, tile backer, unusual substrates..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyFragileFinishes">Fragile finishes</label><textarea class="form-control" id="propertyFragileFinishes" rows="2" placeholder="Floors, trim, stone, millwork, or surfaces to protect..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyHazards">Hazards</label><textarea class="form-control" id="propertyHazards" rows="2" placeholder="Suspected asbestos, lead, mould, pets, low clearances..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyHiddenConditions">Prior hidden-condition issues</label><textarea class="form-control" id="propertyHiddenConditions" rows="2" placeholder="Leaks, rot, buried services, prior surprises..."></textarea></div>',
            '          </div>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Measurements and references</legend>',
            '          <div class="row g-3">',
            '            <div class="col-md-6"><label class="form-label" for="propertyMeasurements">Reusable measurements</label><textarea class="form-control" id="propertyMeasurements" rows="4" placeholder="Ceiling heights, room dimensions, openings, service locations..."></textarea></div>',
            '            <div class="col-md-6"><label class="form-label" for="propertyAttachmentReferences">Attachment links or file references</label><textarea class="form-control" id="propertyAttachmentReferences" rows="4" placeholder="One link or file reference per line..."></textarea></div>',
            '          </div>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Property contacts</legend>',
            '          <p class="small text-muted mb-2">These contacts belong to the property record and do not replace the quote client.</p>',
            '          <div class="property-memory-contact-grid property-memory-contact-head" aria-hidden="true"><span>Role</span><span>Name</span><span>Phone</span><span>Email</span></div>',
            '          <div class="property-memory-contact-grid"><strong>Manager</strong><label class="visually-hidden" for="propertyManagerName">Manager name</label><input class="form-control" id="propertyManagerName" placeholder="Name"><label class="visually-hidden" for="propertyManagerPhone">Manager phone</label><input class="form-control" id="propertyManagerPhone" type="tel" placeholder="Phone"><label class="visually-hidden" for="propertyManagerEmail">Manager email</label><input class="form-control" id="propertyManagerEmail" type="email" placeholder="Email"></div>',
            '          <div class="property-memory-contact-grid"><strong>Tenant</strong><label class="visually-hidden" for="propertyTenantName">Tenant name</label><input class="form-control" id="propertyTenantName" placeholder="Name"><label class="visually-hidden" for="propertyTenantPhone">Tenant phone</label><input class="form-control" id="propertyTenantPhone" type="tel" placeholder="Phone"><label class="visually-hidden" for="propertyTenantEmail">Tenant email</label><input class="form-control" id="propertyTenantEmail" type="email" placeholder="Email"></div>',
            '          <div class="property-memory-contact-grid"><strong>Superintendent</strong><label class="visually-hidden" for="propertySuperintendentName">Superintendent name</label><input class="form-control" id="propertySuperintendentName" placeholder="Name"><label class="visually-hidden" for="propertySuperintendentPhone">Superintendent phone</label><input class="form-control" id="propertySuperintendentPhone" type="tel" placeholder="Phone"><label class="visually-hidden" for="propertySuperintendentEmail">Superintendent email</label><input class="form-control" id="propertySuperintendentEmail" type="email" placeholder="Email"></div>',
            '          <div id="propertyAdditionalContacts" class="property-memory-additional-contacts" aria-describedby="propertyAdditionalContactsHelp"></div>',
            '          <p class="small text-muted mb-2" id="propertyAdditionalContactsHelp">Add other property-specific contacts such as a concierge, board representative, or maintenance lead.</p>',
            '          <button type="button" class="btn btn-outline-primary btn-sm" id="propertyAddContactBtn" aria-controls="propertyAdditionalContacts"><i class="fas fa-plus me-1" aria-hidden="true"></i>Add property contact</button><div class="visually-hidden" id="propertyAdditionalContactsStatus" role="status" aria-live="polite"></div>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Work history</legend>',
            '          <label class="form-label" for="propertyWorkHistory">Previous work and outcomes at this property</label>',
            '          <textarea class="form-control" id="propertyWorkHistory" rows="4" placeholder="Dates, completed work, contractors, warranties, follow-up items..."></textarea>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Property work reminders</legend>',
            '          <div class="alert alert-light border py-2 small" role="note">Reminders appear only when this property and matching quote work are present. They never add items or change quantities, pricing, client details, or document status.</div>',
            '          <div id="propertyReminderList" class="d-grid gap-2 mb-3" aria-live="polite"></div>',
            '          <div class="property-memory-reminder-editor border rounded p-3" id="propertyReminderEditor">',
            '            <input type="hidden" id="propertyReminderDraftId">',
            '            <div class="row g-3">',
            '              <div class="col-md-4"><label class="form-label" for="propertyReminderLabel">Reminder label</label><input class="form-control" id="propertyReminderLabel" placeholder="Protect stone countertop"></div>',
            '              <div class="col-md-8"><label class="form-label" for="propertyReminderMessage">Reminder message</label><input class="form-control" id="propertyReminderMessage" placeholder="Confirm protection plan before demolition."></div>',
            '              <div class="col-md-4"><label class="form-label" for="propertyReminderTargetType">Show when the quote includes</label><select class="form-select" id="propertyReminderTargetType"><option value="category">A trade or category</option><option value="item">A specific saved item or reference</option></select></div>',
            '              <div class="col-md-4"><label class="form-label" for="propertyReminderCategory">Trade or category</label><input class="form-control" id="propertyReminderCategory" list="propertyReminderCategoryOptions" placeholder="Electrical"><datalist id="propertyReminderCategoryOptions"></datalist></div>',
            '              <div class="col-md-4" id="propertyReminderItemField" hidden><label class="form-label" for="propertyReminderItemReference">Saved item or reference</label><input class="form-control" id="propertyReminderItemReference" list="propertyReminderItemOptions" placeholder="Vanity Installation"><datalist id="propertyReminderItemOptions"></datalist></div>',
            '            </div>',
            '            <div class="small text-muted mt-2" id="propertyReminderTargetHelp">The reminder matches any line item in the exact category, ignoring case and spacing.</div>',
            '            <div class="small mt-2" id="propertyReminderEditorStatus" role="status" aria-live="polite"></div>',
            '            <div class="d-flex flex-wrap gap-2 mt-3"><button type="button" class="btn btn-sm btn-outline-primary" id="propertyReminderSaveBtn"><i class="fas fa-plus me-1" aria-hidden="true"></i>Add reminder</button><button type="button" class="btn btn-sm btn-outline-secondary" id="propertyReminderCancelBtn" hidden>Cancel edit</button></div>',
            '          </div>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section property-memory-markup-section">',
            '          <legend>Optional markup rule</legend>',
            '          <div class="alert alert-warning py-2 small">Saving this rule does not change this quote. You can review and apply it to this quote separately.</div>',
            '          <div class="row g-3 align-items-end">',
            '            <div class="col-md-3"><label class="form-label" for="propertyMarkupPercent">Suggested room markup</label><div class="input-group"><input class="form-control" id="propertyMarkupPercent" type="number" min="0" max="100" step="0.1" inputmode="decimal"><span class="input-group-text">%</span></div></div>',
            '            <div class="col-md-9"><label class="form-label" for="propertyMarkupNote">Reason or review note</label><input class="form-control" id="propertyMarkupNote" placeholder="Why this property may need an adjustment..."></div>',
            '          </div>',
            '          <div id="propertyMarkupCurrentState" class="small fw-semibold mt-3" aria-live="polite"></div>',
            '          <div class="form-check mt-3">',
            '            <input class="form-check-input" type="checkbox" id="propertyMarkupApplyConfirm">',
            '            <label class="form-check-label fw-semibold" for="propertyMarkupApplyConfirm">Apply the reviewed percentage to every room in this quote</label>',
            '          </div>',
            '          <p class="small text-muted mt-1 mb-2">This replaces existing room markup percentages. Individual item markup remains unchanged.</p>',
            '          <button type="button" class="btn btn-outline-warning" id="propertyMarkupApplyBtn" disabled><i class="fas fa-percent me-1" aria-hidden="true"></i>Apply to this quote</button>',
            '          <div class="form-check form-switch mt-4 pt-3 border-top">',
            '            <input class="form-check-input" type="checkbox" role="switch" id="propertyMarkupAlwaysApply" aria-describedby="propertyMarkupAlwaysApplyHelp propertyMarkupAutomaticState">',
            '            <label class="form-check-label fw-semibold" for="propertyMarkupAlwaysApply">Always apply this markup for this property.</label>',
            '          </div>',
            '          <p class="small text-muted mt-1 mb-1" id="propertyMarkupAlwaysApplyHelp">When enabled, Quote Dr automatically applies the saved percentage when this property is selected. Rooms with a manual room markup, including an explicit 0%, are left unchanged. Individual item markup is never changed.</p>',
            '          <div class="small fw-semibold" id="propertyMarkupAutomaticState" aria-live="polite"></div>',
            '        </fieldset>',
            '      </div>',
            '      <div class="modal-footer justify-content-between gap-2">',
            '        <button type="button" class="btn btn-outline-secondary me-auto" id="propertyMemoryManageAllBtn"><i class="fas fa-list me-1" aria-hidden="true"></i>Manage all saved properties</button>',
            '        <button type="button" class="btn btn-outline-danger" id="propertyMemoryDeleteBtn" hidden><i class="fas fa-trash me-1" aria-hidden="true"></i>Remove this property memory</button>',
            '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>',
            '        <button type="button" class="btn btn-primary" id="propertyMemorySaveBtn"><i class="fas fa-floppy-disk me-1" aria-hidden="true"></i>Save property memory</button>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        var modal = wrapper.firstElementChild;
        document.body.appendChild(modal);
        document.getElementById('propertyMemorySaveBtn').addEventListener('click', savePropertyMemoryFromForm);
        document.getElementById('propertyAddContactBtn').addEventListener('click', function() {
            addAdditionalPropertyContact({}, { focusRole: true, announce: true });
        });
        document.getElementById('propertyMarkupApplyConfirm').addEventListener('change', updatePropertyMarkupApplyState);
        document.getElementById('propertyMarkupPercent').addEventListener('input', function() {
            updatePropertyMarkupApplyState();
            updatePropertyMarkupAutomaticState();
        });
        document.getElementById('propertyMarkupAlwaysApply').addEventListener('change', updatePropertyMarkupAutomaticState);
        document.getElementById('propertyMarkupApplyBtn').addEventListener('click', applyPropertyMarkupToQuote);
        document.getElementById('propertyReminderTargetType').addEventListener('change', updateReminderTargetFields);
        document.getElementById('propertyReminderSaveBtn').addEventListener('click', saveReminderDraft);
        document.getElementById('propertyReminderCancelBtn').addEventListener('click', clearReminderDraft);
        document.getElementById('propertyMemoryDeleteBtn').addEventListener('click', deleteEditingPropertyMemory);
        document.getElementById('propertyMemoryManageAllBtn').addEventListener('click', openPropertyMemoryManager);
        modal.addEventListener('shown.bs.modal', function() {
            var firstField = document.getElementById('propertyGeneralSiteNotes');
            if (firstField) firstField.focus();
        });
        return modal;
    }

    function fieldValue(id) {
        var field = document.getElementById(id);
        return field ? cleanText(field.value) : '';
    }

    function setFieldValue(id, value) {
        var field = document.getElementById(id);
        if (field) field.value = value === null || value === undefined ? '' : value;
    }

    function propertyReminderTargetDescription(reminder) {
        reminder = normalizePropertyReminder(reminder);
        if (reminder.targetType === 'item') {
            return 'Saved item/reference: ' + (reminder.category ? reminder.category + ' - ' : '') + (reminder.itemLabel || reminder.itemReference);
        }
        return 'Trade/category: ' + reminder.category;
    }

    function propertyReminderCatalogEntries() {
        var entries = [];
        var seen = {};
        [typeof pricingDatabase !== 'undefined' ? pricingDatabase : null, typeof customItems !== 'undefined' ? customItems : null].forEach(function(source) {
            if (!source || typeof source !== 'object') return;
            Object.keys(source).forEach(function(category) {
                if (category.indexOf('__') === 0 || !Array.isArray(source[category])) return;
                source[category].forEach(function(item) {
                    var name = cleanText(item && (item.name || item.description || item.serviceName));
                    if (!name) return;
                    var key = normalizeMatchText(category) + '::' + normalizeMatchText(name);
                    if (seen[key]) return;
                    seen[key] = true;
                    entries.push({ category: cleanText(category), name: name, reference: key });
                });
            });
        });
        return entries;
    }

    function populateReminderTargetOptions() {
        var categoryList = document.getElementById('propertyReminderCategoryOptions');
        var itemList = document.getElementById('propertyReminderItemOptions');
        if (!categoryList || !itemList) return;
        categoryList.textContent = '';
        itemList.textContent = '';
        var categories = {};
        propertyReminderCatalogEntries().forEach(function(entry) {
            if (!categories[entry.category]) {
                categories[entry.category] = true;
                var categoryOption = document.createElement('option');
                categoryOption.value = entry.category;
                categoryList.appendChild(categoryOption);
            }
            var itemOption = document.createElement('option');
            itemOption.value = entry.name;
            itemOption.label = entry.category;
            itemList.appendChild(itemOption);
        });
    }

    function updateReminderTargetFields() {
        var typeField = document.getElementById('propertyReminderTargetType');
        var itemField = document.getElementById('propertyReminderItemField');
        var help = document.getElementById('propertyReminderTargetHelp');
        var isItem = !!typeField && typeField.value === 'item';
        if (itemField) itemField.hidden = !isItem;
        if (help) help.textContent = isItem
            ? 'The reminder matches only the saved item/reference in the selected category. It never adds the item.'
            : 'The reminder matches any line item in the exact category, ignoring case and spacing.';
    }

    function setReminderEditorStatus(message, type) {
        var status = document.getElementById('propertyReminderEditorStatus');
        if (!status) return;
        status.className = 'small mt-2 ' + (type === 'danger' ? 'text-danger' : (type === 'success' ? 'text-success' : 'text-muted'));
        status.textContent = message || '';
    }

    function clearReminderDraft(options) {
        options = options || {};
        setFieldValue('propertyReminderDraftId', '');
        setFieldValue('propertyReminderLabel', '');
        setFieldValue('propertyReminderMessage', '');
        setFieldValue('propertyReminderCategory', '');
        setFieldValue('propertyReminderItemReference', '');
        setFieldValue('propertyReminderTargetType', 'category');
        var saveButton = document.getElementById('propertyReminderSaveBtn');
        var cancelButton = document.getElementById('propertyReminderCancelBtn');
        if (saveButton) saveButton.innerHTML = '<i class="fas fa-plus me-1" aria-hidden="true"></i>Add reminder';
        if (cancelButton) cancelButton.hidden = true;
        updateReminderTargetFields();
        if (!options.keepStatus) setReminderEditorStatus('');
    }

    function resolveReminderCatalogEntry(category, itemReference) {
        var categoryKey = normalizeMatchText(category);
        var referenceKey = normalizeMatchText(itemReference);
        if (!referenceKey) return null;
        var entries = propertyReminderCatalogEntries();
        return entries.find(function(entry) {
            return normalizeMatchText(entry.name) === referenceKey && (!categoryKey || normalizeMatchText(entry.category) === categoryKey);
        }) || null;
    }

    function saveReminderDraft() {
        var id = fieldValue('propertyReminderDraftId');
        var targetType = fieldValue('propertyReminderTargetType') === 'item' ? 'item' : 'category';
        var category = fieldValue('propertyReminderCategory');
        var itemReference = fieldValue('propertyReminderItemReference');
        var catalogEntry = targetType === 'item' ? resolveReminderCatalogEntry(category, itemReference) : null;
        if (catalogEntry) category = category || catalogEntry.category;
        var reminder = normalizePropertyReminder({
            id: id || createPropertyReminderId(),
            label: fieldValue('propertyReminderLabel'),
            message: fieldValue('propertyReminderMessage'),
            targetType: targetType,
            category: category,
            itemReference: catalogEntry ? catalogEntry.reference : itemReference,
            itemLabel: catalogEntry ? catalogEntry.name : itemReference
        });
        if (!reminder.message) {
            setReminderEditorStatus('Enter the reminder message.', 'danger');
            var messageField = document.getElementById('propertyReminderMessage');
            if (messageField) messageField.focus();
            return;
        }
        if (reminder.targetType === 'category' && !reminder.category) {
            setReminderEditorStatus('Choose or enter the trade/category.', 'danger');
            var categoryField = document.getElementById('propertyReminderCategory');
            if (categoryField) categoryField.focus();
            return;
        }
        if (reminder.targetType === 'item' && !reminder.itemReference) {
            setReminderEditorStatus('Choose or enter the saved item/reference.', 'danger');
            var itemField = document.getElementById('propertyReminderItemReference');
            if (itemField) itemField.focus();
            return;
        }
        var existingIndex = editingReminders.findIndex(function(existing) { return existing.id === reminder.id; });
        if (existingIndex >= 0) editingReminders[existingIndex] = reminder;
        else editingReminders.push(reminder);
        renderReminderList();
        clearReminderDraft({ keepStatus: true });
        setReminderEditorStatus(existingIndex >= 0 ? 'Reminder updated in this draft. Save property memory to finish.' : 'Reminder added to this draft. Save property memory to finish.', 'success');
    }

    function editReminderDraft(reminderId) {
        var reminder = editingReminders.find(function(candidate) { return candidate.id === reminderId; });
        if (!reminder) return;
        setFieldValue('propertyReminderDraftId', reminder.id);
        setFieldValue('propertyReminderLabel', reminder.label);
        setFieldValue('propertyReminderMessage', reminder.message);
        setFieldValue('propertyReminderTargetType', reminder.targetType);
        setFieldValue('propertyReminderCategory', reminder.category);
        setFieldValue('propertyReminderItemReference', reminder.itemLabel || reminder.itemReference);
        var saveButton = document.getElementById('propertyReminderSaveBtn');
        var cancelButton = document.getElementById('propertyReminderCancelBtn');
        if (saveButton) saveButton.innerHTML = '<i class="fas fa-check me-1" aria-hidden="true"></i>Update reminder';
        if (cancelButton) cancelButton.hidden = false;
        updateReminderTargetFields();
        setReminderEditorStatus('Editing ' + (reminder.label || 'property reminder') + '. Choose Update reminder to apply this draft.');
        var labelField = document.getElementById('propertyReminderLabel');
        if (labelField) labelField.focus();
    }

    async function removeReminderDraft(reminderId) {
        var reminder = editingReminders.find(function(candidate) { return candidate.id === reminderId; });
        if (!reminder) return;
        var name = reminder.label || reminder.message;
        var message = 'Remove the reminder "' + name + '" from this property memory draft? Existing quote pricing and data will not change.';
        var confirmed = typeof qdConfirm === 'function'
            ? await qdConfirm(message, { title: 'Remove Property Reminder?', okText: 'Remove Reminder', cancelText: 'Cancel', okClass: 'btn-danger', type: 'danger' })
            : window.confirm(message);
        if (!confirmed) return;
        editingReminders = editingReminders.filter(function(candidate) { return candidate.id !== reminderId; });
        renderReminderList();
        clearReminderDraft({ keepStatus: true });
        setReminderEditorStatus('Reminder removed from this draft. Save property memory to finish.', 'success');
    }

    function renderReminderList() {
        var list = document.getElementById('propertyReminderList');
        if (!list) return;
        list.textContent = '';
        if (!editingReminders.length) {
            var empty = document.createElement('div');
            empty.className = 'text-muted small border rounded p-3';
            empty.textContent = 'No property reminders saved.';
            list.appendChild(empty);
            return;
        }
        editingReminders.forEach(function(reminder) {
            var card = document.createElement('div');
            card.className = 'property-memory-reminder-card border rounded p-3';
            var heading = document.createElement('div');
            heading.className = 'fw-bold';
            heading.textContent = reminder.label || 'Property reminder';
            var message = document.createElement('div');
            message.className = 'mt-1';
            message.textContent = reminder.message;
            var target = document.createElement('div');
            target.className = 'small text-muted mt-1';
            target.textContent = propertyReminderTargetDescription(reminder);
            var actions = document.createElement('div');
            actions.className = 'd-flex flex-wrap gap-2 mt-2';
            var edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-sm btn-outline-primary';
            edit.textContent = 'Edit reminder';
            edit.addEventListener('click', function() { editReminderDraft(reminder.id); });
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-sm btn-outline-danger';
            remove.textContent = 'Remove reminder';
            remove.setAttribute('aria-label', 'Remove ' + (reminder.label || 'property reminder'));
            remove.addEventListener('click', function() { removeReminderDraft(reminder.id); });
            actions.appendChild(edit);
            actions.appendChild(remove);
            card.appendChild(heading);
            card.appendChild(message);
            card.appendChild(target);
            card.appendChild(actions);
            list.appendChild(card);
        });
    }

    function setAdditionalContactStatus(message) {
        var status = document.getElementById('propertyAdditionalContactsStatus');
        if (status) status.textContent = message || '';
    }

    function appendAdditionalContactInput(row, id, labelText, fieldName, type, placeholder, value) {
        var label = document.createElement('label');
        label.className = 'visually-hidden';
        label.setAttribute('for', id);
        label.textContent = labelText;

        var input = document.createElement('input');
        input.className = 'form-control';
        input.id = id;
        input.type = type || 'text';
        input.placeholder = placeholder;
        input.value = value || '';
        input.autocomplete = 'off';
        input.setAttribute('data-property-contact-field', fieldName);

        row.appendChild(label);
        row.appendChild(input);
        return input;
    }

    function addAdditionalPropertyContact(contact, options) {
        var container = document.getElementById('propertyAdditionalContacts');
        if (!container) return null;
        contact = cleanAdditionalContact(contact);
        options = options || {};
        additionalContactSequence += 1;
        var rowId = 'propertyAdditionalContact' + additionalContactSequence;
        var row = document.createElement('div');
        row.className = 'property-memory-contact-grid property-memory-additional-contact';
        row.setAttribute('data-property-additional-contact', '');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', contact.role ? contact.role + ' property contact' : 'Additional property contact');

        var roleInput = appendAdditionalContactInput(row, rowId + 'Role', 'Contact role', 'role', 'text', 'Role', contact.role);
        appendAdditionalContactInput(row, rowId + 'Name', 'Contact name', 'name', 'text', 'Name', contact.name);
        appendAdditionalContactInput(row, rowId + 'Phone', 'Contact phone', 'phone', 'tel', 'Phone', contact.phone);
        appendAdditionalContactInput(row, rowId + 'Email', 'Contact email', 'email', 'email', 'Email', contact.email);

        var removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-outline-danger btn-sm property-memory-contact-remove';
        removeButton.innerHTML = '<i class="fas fa-trash me-1" aria-hidden="true"></i>Remove';
        function updateRowLabel() {
            var role = cleanText(roleInput.value);
            row.setAttribute('aria-label', role ? role + ' property contact' : 'Additional property contact');
            removeButton.setAttribute('aria-label', role ? 'Remove ' + role + ' property contact' : 'Remove additional property contact');
        }
        roleInput.addEventListener('input', updateRowLabel);
        updateRowLabel();
        removeButton.addEventListener('click', function() {
            row.remove();
            setAdditionalContactStatus('Property contact removed.');
            var addButton = document.getElementById('propertyAddContactBtn');
            if (addButton) addButton.focus();
        });
        row.appendChild(removeButton);
        container.appendChild(row);

        if (options.announce) setAdditionalContactStatus('Property contact added. Enter a role and any available contact details.');
        if (options.focusRole) roleInput.focus();
        return row;
    }

    function renderAdditionalPropertyContacts(contacts) {
        var container = document.getElementById('propertyAdditionalContacts');
        if (!container) return;
        container.textContent = '';
        normalizeAdditionalContacts(contacts).forEach(function(contact) {
            addAdditionalPropertyContact(contact);
        });
        setAdditionalContactStatus('');
    }

    function readAdditionalPropertyContacts() {
        var container = document.getElementById('propertyAdditionalContacts');
        if (!container) return [];
        return Array.prototype.map.call(container.querySelectorAll('[data-property-additional-contact]'), function(row) {
            function rowValue(fieldName) {
                var input = row.querySelector('[data-property-contact-field="' + fieldName + '"]');
                return input ? cleanText(input.value) : '';
            }
            return {
                role: rowValue('role'),
                name: rowValue('name'),
                phone: rowValue('phone'),
                email: rowValue('email')
            };
        }).filter(additionalContactHasData);
    }

    function setFormRecord(record, displayAddress, normalizedAddress) {
        record = normalizePropertyMemoryRecord(record, displayAddress, normalizedAddress);
        setFieldValue('propertyGeneralSiteNotes', record.generalSiteNotes);
        setFieldValue('propertyParking', record.accessLogistics.parking);
        setFieldValue('propertyEntryCode', record.accessLogistics.entryCode);
        setFieldValue('propertyStairsElevator', record.accessLogistics.stairsElevator);
        setFieldValue('propertyRestrictedHours', record.accessLogistics.restrictedHours);
        setFieldValue('propertyLoadingDumpster', record.accessLogistics.loadingDumpster);
        setFieldValue('propertyOlderConstruction', record.knownConditions.olderConstruction);
        setFieldValue('propertyWiring', record.knownConditions.wiring);
        setFieldValue('propertyPlasterMasonry', record.knownConditions.plasterMasonry);
        setFieldValue('propertyFragileFinishes', record.knownConditions.fragileFinishes);
        setFieldValue('propertyHazards', record.knownConditions.hazards);
        setFieldValue('propertyHiddenConditions', record.knownConditions.hiddenConditions);
        setFieldValue('propertyMeasurements', record.measurements);
        setFieldValue('propertyAttachmentReferences', record.attachmentReferences);
        setFieldValue('propertyManagerName', record.propertyContacts.manager.name);
        setFieldValue('propertyManagerPhone', record.propertyContacts.manager.phone);
        setFieldValue('propertyManagerEmail', record.propertyContacts.manager.email);
        setFieldValue('propertyTenantName', record.propertyContacts.tenant.name);
        setFieldValue('propertyTenantPhone', record.propertyContacts.tenant.phone);
        setFieldValue('propertyTenantEmail', record.propertyContacts.tenant.email);
        setFieldValue('propertySuperintendentName', record.propertyContacts.superintendent.name);
        setFieldValue('propertySuperintendentPhone', record.propertyContacts.superintendent.phone);
        setFieldValue('propertySuperintendentEmail', record.propertyContacts.superintendent.email);
        renderAdditionalPropertyContacts(record.propertyContacts.additional);
        setFieldValue('propertyWorkHistory', record.workHistory);
        editingReminders = normalizePropertyReminders(record.reminders);
        populateReminderTargetOptions();
        renderReminderList();
        clearReminderDraft();
        setFieldValue('propertyMarkupPercent', record.markupRule.percent);
        setFieldValue('propertyMarkupNote', record.markupRule.note);
        var checkbox = document.getElementById('propertyMarkupApplyConfirm');
        if (checkbox) checkbox.checked = false;
        var alwaysApplyCheckbox = document.getElementById('propertyMarkupAlwaysApply');
        if (alwaysApplyCheckbox) alwaysApplyCheckbox.checked = record.markupRule.alwaysApply === true;
        updatePropertyMarkupApplyState();
        updatePropertyMarkupAutomaticState();
        updateCurrentQuoteMarkupState();
    }

    function readFormRecord(displayAddress, normalizedAddress) {
        return normalizePropertyMemoryRecord({
            generalSiteNotes: fieldValue('propertyGeneralSiteNotes'),
            accessLogistics: {
                parking: fieldValue('propertyParking'),
                entryCode: fieldValue('propertyEntryCode'),
                stairsElevator: fieldValue('propertyStairsElevator'),
                restrictedHours: fieldValue('propertyRestrictedHours'),
                loadingDumpster: fieldValue('propertyLoadingDumpster')
            },
            knownConditions: {
                olderConstruction: fieldValue('propertyOlderConstruction'),
                wiring: fieldValue('propertyWiring'),
                plasterMasonry: fieldValue('propertyPlasterMasonry'),
                fragileFinishes: fieldValue('propertyFragileFinishes'),
                hazards: fieldValue('propertyHazards'),
                hiddenConditions: fieldValue('propertyHiddenConditions')
            },
            measurements: fieldValue('propertyMeasurements'),
            attachmentReferences: fieldValue('propertyAttachmentReferences'),
            propertyContacts: {
                manager: { name: fieldValue('propertyManagerName'), phone: fieldValue('propertyManagerPhone'), email: fieldValue('propertyManagerEmail') },
                tenant: { name: fieldValue('propertyTenantName'), phone: fieldValue('propertyTenantPhone'), email: fieldValue('propertyTenantEmail') },
                superintendent: { name: fieldValue('propertySuperintendentName'), phone: fieldValue('propertySuperintendentPhone'), email: fieldValue('propertySuperintendentEmail') },
                additional: readAdditionalPropertyContacts()
            },
            workHistory: fieldValue('propertyWorkHistory'),
            reminders: editingReminders,
            markupRule: {
                percent: fieldValue('propertyMarkupPercent'),
                note: fieldValue('propertyMarkupNote'),
                alwaysApply: !!document.getElementById('propertyMarkupAlwaysApply')?.checked
            },
            updatedAt: new Date().toISOString()
        }, displayAddress, normalizedAddress);
    }

    function updatePropertyMemoryModalState(record) {
        var hasSaved = !!record;
        var title = document.getElementById('propertyMemoryModalTitleText');
        var badge = document.getElementById('propertyMemoryModalSavedBadge');
        var state = document.getElementById('propertyMemoryModalStateMessage');
        var deleteButton = document.getElementById('propertyMemoryDeleteBtn');
        var saveButton = document.getElementById('propertyMemorySaveBtn');
        if (title) title.textContent = hasSaved ? 'Review property memory' : 'Add property memory';
        if (badge) badge.hidden = !hasSaved;
        if (deleteButton) deleteButton.hidden = !hasSaved;
        if (saveButton) saveButton.innerHTML = '<i class="fas fa-floppy-disk me-1" aria-hidden="true"></i>' + (hasSaved ? 'Save changes' : 'Save property memory');
        if (state) state.textContent = hasSaved
            ? 'Review or edit this exact normalized-address record.'
            : 'No Property Memory is saved for this normalized address yet.';
    }

    function showFormStatus(message, type) {
        var status = document.getElementById('propertyMemoryFormStatus');
        if (!status) return;
        status.className = 'alert alert-' + (type || 'info') + ' py-2';
        status.textContent = message;
    }

    function clearFormStatus() {
        var status = document.getElementById('propertyMemoryFormStatus');
        if (!status) return;
        status.className = 'alert d-none';
        status.textContent = '';
    }

    function ensureManagerModal() {
        var existing = document.getElementById('propertyMemoryManagerModal');
        if (existing) return existing;
        var wrapper = document.createElement('div');
        wrapper.innerHTML = [
            '<div class="modal fade" id="propertyMemoryManagerModal" tabindex="-1" aria-labelledby="propertyMemoryManagerTitle" aria-hidden="true">',
            '  <div class="modal-dialog modal-lg modal-dialog-scrollable">',
            '    <div class="modal-content">',
            '      <div class="modal-header bg-primary text-white">',
            '        <div><h2 class="modal-title fs-5" id="propertyMemoryManagerTitle"><i class="fas fa-house-circle-check me-2" aria-hidden="true"></i>Manage Property Memory</h2><div class="small opacity-75">Private, address-isolated records for your signed-in account</div></div>',
            '        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>',
            '      </div>',
            '      <div class="modal-body">',
            '        <div class="alert alert-light border small" id="propertyMemoryManagerCurrentState" role="status" aria-live="polite"></div>',
            '        <label class="form-label fw-semibold" for="propertyMemoryManagerSearch">Search saved addresses or property notes</label>',
            '        <input class="form-control" type="search" id="propertyMemoryManagerSearch" placeholder="Search address, notes, contacts, or reminders" autocomplete="off">',
            '        <div class="small text-muted mt-2" id="propertyMemoryManagerStatus" role="status" aria-live="polite">Loading saved properties...</div>',
            '        <div id="propertyMemoryManagerList" class="d-grid gap-2 mt-3"></div>',
            '      </div>',
            '      <div class="modal-footer"><button type="button" class="btn btn-outline-primary" id="propertyMemoryManagerRefreshBtn"><i class="fas fa-rotate me-1" aria-hidden="true"></i>Refresh</button><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        var modal = wrapper.firstElementChild;
        document.body.appendChild(modal);
        document.getElementById('propertyMemoryManagerSearch').addEventListener('input', renderPropertyMemoryManagerList);
        document.getElementById('propertyMemoryManagerRefreshBtn').addEventListener('click', loadPropertyMemoryManagerRecords);
        modal.addEventListener('shown.bs.modal', function() {
            var search = document.getElementById('propertyMemoryManagerSearch');
            if (search) search.focus();
        });
        return modal;
    }

    function localPropertyMemoryRecordsForUser(userId) {
        var records = [];
        if (!userId) return records;
        try {
            if (typeof localStorage.length !== 'number' || typeof localStorage.key !== 'function') return records;
            var prefix = propertyMemoryScopedLocalPrefix(userId);
            for (var index = 0; index < localStorage.length; index += 1) {
                var key = localStorage.key(index);
                if (!key || key.indexOf(prefix) !== 0) continue;
                try {
                    var parsed = JSON.parse(localStorage.getItem(key));
                    var normalizedAddress = normalizePropertyAddress(parsed && parsed.normalizedAddress);
                    if (!normalizedAddress || key !== propertyMemoryScopedLocalKey(userId, normalizedAddress)) continue;
                    records.push(normalizePropertyMemoryRecord(parsed, parsed.displayAddress, normalizedAddress));
                } catch (recordError) {
                    console.warn('Skipped an unreadable local property memory record:', recordError);
                }
            }
        } catch (error) {
            console.warn('Property memory device records could not be listed:', error);
        }
        return records;
    }

    function propertyMemorySearchText(record) {
        record = normalizePropertyMemoryRecord(record, record && record.displayAddress, record && record.normalizedAddress);
        var contacts = ['manager', 'tenant', 'superintendent'].map(function(role) {
            var contact = record.propertyContacts[role];
            return [contact.name, contact.phone, contact.email].join(' ');
        });
        record.propertyContacts.additional.forEach(function(contact) {
            contacts.push([contact.role, contact.name, contact.phone, contact.email].join(' '));
        });
        return normalizeMatchText([
            record.displayAddress,
            record.normalizedAddress,
            record.generalSiteNotes,
            record.workHistory,
            record.measurements,
            contacts.join(' '),
            record.reminders.map(function(reminder) { return [reminder.label, reminder.message, reminder.category, reminder.itemLabel, reminder.itemReference].join(' '); }).join(' ')
        ].join(' '));
    }

    async function fetchCloudPropertyMemoryRecords(user) {
        if (!user || typeof _supabase === 'undefined') throw new Error('Account sync is unavailable.');
        var result = await _supabase
            .from('user_data')
            .select('key,value,updated_at')
            .eq('user_id', user.id)
            .like('key', PROPERTY_MEMORY_KEY_PREFIX + '%');
        if (result.error) throw result.error;
        return (result.data || []).map(function(row) {
            var raw = row && row.value;
            var normalizedAddress = normalizePropertyAddress(raw && raw.normalizedAddress);
            if (!normalizedAddress || row.key !== propertyMemoryStorageKey(normalizedAddress)) return null;
            var record = normalizePropertyMemoryRecord(raw, raw.displayAddress, normalizedAddress);
            if (!record.updatedAt && row.updated_at) record.updatedAt = row.updated_at;
            return record;
        }).filter(Boolean);
    }

    function mergePropertyMemoryRecords(localRecords, cloudRecords) {
        var merged = {};
        (localRecords || []).forEach(function(record) {
            merged[record.normalizedAddress] = { record: record, hasLocal: true, hasCloud: false };
        });
        (cloudRecords || []).forEach(function(record) {
            var existing = merged[record.normalizedAddress] || { hasLocal: false };
            merged[record.normalizedAddress] = { record: record, hasLocal: existing.hasLocal === true, hasCloud: true };
        });
        return Object.keys(merged).map(function(key) { return merged[key]; }).sort(function(left, right) {
            return left.record.displayAddress.localeCompare(right.record.displayAddress);
        });
    }

    function setManagerStatus(message, type) {
        var status = document.getElementById('propertyMemoryManagerStatus');
        if (!status) return;
        status.className = 'small mt-2 ' + (type === 'danger' ? 'text-danger' : (type === 'warning' ? 'text-warning-emphasis' : 'text-muted'));
        status.textContent = message || '';
    }

    function currentAddressManagerState() {
        var state = document.getElementById('propertyMemoryManagerCurrentState');
        if (!state) return;
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) {
            state.textContent = 'The current quote has no project address. You can still search and manage saved properties below.';
            return;
        }
        var match = managerRecords.find(function(entry) { return entry.record.normalizedAddress === normalizedAddress; });
        if (!managerCloudConfirmed) {
            state.textContent = match
                ? 'A device copy exists for the current quote address, but account sync could not be checked: ' + match.record.displayAddress + ' (normalized: ' + normalizedAddress + ').'
                : 'No device copy was found for the current quote address, and account sync could not be checked: ' + displayAddress + ' (normalized: ' + normalizedAddress + ').';
            return;
        }
        state.textContent = match
            ? 'Current quote address is saved: ' + match.record.displayAddress + ' (normalized: ' + normalizedAddress + ').'
            : 'Current quote address is not saved: ' + displayAddress + ' (normalized: ' + normalizedAddress + ').';
    }

    function renderPropertyMemoryManagerList() {
        var list = document.getElementById('propertyMemoryManagerList');
        var search = document.getElementById('propertyMemoryManagerSearch');
        if (!list) return;
        var query = normalizeMatchText(search && search.value);
        var filtered = managerRecords.filter(function(entry) {
            return !query || propertyMemorySearchText(entry.record).indexOf(query) !== -1;
        });
        list.textContent = '';
        if (!filtered.length) {
            var empty = document.createElement('div');
            empty.className = 'border rounded p-4 text-center text-muted';
            empty.textContent = managerRecords.length ? 'No saved properties match this search.' : 'No saved Property Memory records were found for this account.';
            list.appendChild(empty);
            return;
        }
        filtered.forEach(function(entry) {
            var record = entry.record;
            var card = document.createElement('article');
            card.className = 'property-memory-manager-card border rounded p-3';
            var headingRow = document.createElement('div');
            headingRow.className = 'd-flex flex-wrap align-items-start justify-content-between gap-2';
            var heading = document.createElement('div');
            var title = document.createElement('h3');
            title.className = 'h6 mb-1';
            title.textContent = record.displayAddress || record.normalizedAddress;
            var normalized = document.createElement('div');
            normalized.className = 'small text-muted';
            normalized.textContent = 'Normalized address: ' + record.normalizedAddress;
            heading.appendChild(title);
            heading.appendChild(normalized);
            var badge = document.createElement('span');
            badge.className = 'badge ' + (entry.hasCloud ? 'bg-success' : 'bg-warning text-dark');
            badge.textContent = entry.hasCloud ? 'Account synced' : 'This device only';
            headingRow.appendChild(heading);
            headingRow.appendChild(badge);
            var summary = document.createElement('div');
            summary.className = 'small mt-2';
            summary.textContent = record.generalSiteNotes || record.workHistory || (record.reminders.length ? record.reminders.length + ' reminder' + (record.reminders.length === 1 ? '' : 's') : 'Saved property details');
            var actions = document.createElement('div');
            actions.className = 'd-flex flex-wrap gap-2 mt-3';
            var review = document.createElement('button');
            review.type = 'button';
            review.className = 'btn btn-sm btn-primary';
            review.textContent = 'Review or edit';
            review.setAttribute('aria-label', 'Review or edit Property Memory for ' + (record.displayAddress || record.normalizedAddress));
            review.addEventListener('click', function() {
                var manager = document.getElementById('propertyMemoryManagerModal');
                if (manager) bootstrap.Modal.getOrCreateInstance(manager).hide();
                openPropertyMemory({ record: record, displayAddress: record.displayAddress, normalizedAddress: record.normalizedAddress });
            });
            actions.appendChild(review);
            if (!entry.hasCloud) {
                var retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'btn btn-sm btn-outline-primary';
                retry.textContent = 'Retry account sync';
                retry.addEventListener('click', function() { retryPropertyMemorySync(record, retry); });
                actions.appendChild(retry);
            }
            card.appendChild(headingRow);
            card.appendChild(summary);
            card.appendChild(actions);
            list.appendChild(card);
        });
    }

    async function loadPropertyMemoryManagerRecords() {
        var user = await getPropertyMemoryUser();
        if (!user) {
            managerRecords = [];
            managerCloudConfirmed = false;
            setManagerStatus('Sign in to list and manage account-scoped Property Memory.', 'danger');
            renderPropertyMemoryManagerList();
            currentAddressManagerState();
            return managerRecords;
        }
        var localRecords = localPropertyMemoryRecordsForUser(user.id);
        setManagerStatus('Loading saved properties...');
        try {
            var cloudRecords = await fetchCloudPropertyMemoryRecords(user);
            cloudRecords.forEach(function(record) { writeLocalRecord(record, user.id); });
            managerRecords = mergePropertyMemoryRecords(localPropertyMemoryRecordsForUser(user.id), cloudRecords);
            managerCloudConfirmed = true;
            setManagerStatus(managerRecords.length + ' saved propert' + (managerRecords.length === 1 ? 'y' : 'ies') + ' loaded for this account.');
        } catch (error) {
            console.warn('Property memory manager cloud load failed:', error);
            managerRecords = mergePropertyMemoryRecords(localRecords, []);
            managerCloudConfirmed = false;
            setManagerStatus('Account sync could not be checked. Showing only this account\'s saved records on this device.', 'warning');
        }
        renderPropertyMemoryManagerList();
        currentAddressManagerState();
        return managerRecords;
    }

    async function openPropertyMemoryManager() {
        var user = await getPropertyMemoryUser();
        if (!user) {
            var message = 'Sign in before managing account-scoped Property Memory.';
            if (typeof qdAlert === 'function') await qdAlert(message, { title: 'Sign-in Needed', type: 'info' });
            else window.alert(message);
            return;
        }
        var editor = document.getElementById('propertyMemoryModal');
        if (editor) bootstrap.Modal.getOrCreateInstance(editor).hide();
        var modal = ensureManagerModal();
        var search = document.getElementById('propertyMemoryManagerSearch');
        if (search) search.value = '';
        bootstrap.Modal.getOrCreateInstance(modal).show();
        await loadPropertyMemoryManagerRecords();
        if (search) search.focus();
    }

    async function retryPropertyMemorySync(record, button) {
        if (!record || typeof saveUserDataValue !== 'function') return;
        if (button) button.disabled = true;
        setManagerStatus('Retrying account sync for ' + (record.displayAddress || record.normalizedAddress) + '...');
        try {
            var result = await saveUserDataValue(propertyMemoryStorageKey(record.normalizedAddress), record, {
                entityType: 'user_data',
                entityLabel: 'Property memory - ' + (record.displayAddress || record.normalizedAddress)
            });
            if (!result || result.state !== 'cloud_saved' || result.error) throw (result && result.error) || new Error('Account sync is still pending.');
            await loadPropertyMemoryManagerRecords();
        } catch (error) {
            console.warn('Property memory retry failed:', error);
            setManagerStatus('Account sync is still not confirmed. The device copy is retained for another retry.', 'warning');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function buildPropertyMemoryDeleteTarget(normalizedAddress) {
        return {
            table: 'user_data',
            action: 'delete',
            filters: [{ column: 'key', value: propertyMemoryStorageKey(normalizedAddress) }],
            select: false,
            expectRows: false
        };
    }

    async function removePropertyMemoryCloudRecord(normalizedAddress, displayAddress, user) {
        user = user || await getPropertyMemoryUser();
        if (!user) throw new Error('Sign in before removing account-scoped Property Memory.');
        var target = buildPropertyMemoryDeleteTarget(normalizedAddress);
        if (typeof qdDurableSupabaseOperation === 'function') {
            var durableResult = await qdDurableSupabaseOperation({
                entityType: 'user_data',
                entityId: propertyMemoryStorageKey(normalizedAddress),
                entityLabel: 'Property memory - ' + displayAddress,
                action: 'delete',
                payload: { normalizedAddress: normalizedAddress },
                target: target
            });
            if (!durableResult || durableResult.state !== 'cloud_saved' || durableResult.error) {
                throw (durableResult && durableResult.error) || new Error('Account deletion is pending.');
            }
            return true;
        }
        throw new Error('Durable account deletion is unavailable. The device fallback was retained.');
    }

    function finishPropertyMemoryDeletion(normalizedAddress, displayAddress, userId) {
        removeLocalRecord(normalizedAddress, userId);
        pendingDeleteKey = '';
        if (currentNormalizedAddress === normalizedAddress) {
            currentRecord = null;
            activeAutomaticMarkupRule = null;
            setEntryState(null, normalizedAddress, false);
            evaluatePropertyReminders();
        }
        if (editingNormalizedAddress === normalizedAddress) {
            setFormRecord(null, displayAddress, normalizedAddress);
            updatePropertyMemoryModalState(null);
        }
        var deleteButton = document.getElementById('propertyMemoryDeleteBtn');
        if (deleteButton) deleteButton.innerHTML = '<i class="fas fa-trash me-1" aria-hidden="true"></i>Remove this property memory';
    }

    async function deleteEditingPropertyMemory() {
        var normalizedAddress = editingNormalizedAddress;
        var displayAddress = editingDisplayAddress || (currentRecord && currentRecord.displayAddress) || getCurrentDisplayAddress();
        if (!normalizedAddress) return;
        var message = 'Remove only the saved Property Memory for "' + displayAddress + '" (normalized address: ' + normalizedAddress + ')? Site notes, property contacts, reminders, work history, and the saved markup rule for this address will be removed. Client CRM records, quote ownership, and this quote\'s current pricing will not change.';
        var confirmed = typeof qdConfirm === 'function'
            ? await qdConfirm(message, { title: 'Remove Exact Property Memory?', okText: 'Remove This Address', cancelText: 'Cancel', okClass: 'btn-danger', type: 'danger' })
            : window.confirm(message);
        if (!confirmed) return;
        var user = await getPropertyMemoryUser();
        var deleteButton = document.getElementById('propertyMemoryDeleteBtn');
        var saveButton = document.getElementById('propertyMemorySaveBtn');
        if (deleteButton) deleteButton.disabled = true;
        if (saveButton) saveButton.disabled = true;
        showFormStatus('Waiting for account confirmation before removing the device fallback...', 'info');
        try {
            await removePropertyMemoryCloudRecord(normalizedAddress, displayAddress, user);
            finishPropertyMemoryDeletion(normalizedAddress, displayAddress, user && user.id);
            showFormStatus('Property Memory removed from your account and this device. Current quote pricing and client data were not changed.', 'success');
        } catch (error) {
            pendingDeleteKey = propertyMemoryStorageKey(normalizedAddress);
            console.warn('Property memory removal was not confirmed:', error);
            showFormStatus('Property Memory was not removed. The account deletion is unconfirmed, so the device fallback is retained. Retry when online.', 'danger');
            if (deleteButton) deleteButton.innerHTML = '<i class="fas fa-rotate me-1" aria-hidden="true"></i>Retry removal for this address';
        } finally {
            if (deleteButton) deleteButton.disabled = false;
            if (saveButton) saveButton.disabled = false;
        }
    }

    async function handlePropertyMemoryDeleteAcknowledgement(event) {
        var detail = event && event.detail || {};
        var operation = detail.operation || {};
        if (operation.entityType !== 'user_data' || operation.action !== 'delete') return;
        var entityId = cleanText(operation.entityId);
        if (!entityId || entityId.indexOf(PROPERTY_MEMORY_KEY_PREFIX) !== 0) return;
        var normalizedAddress = '';
        try {
            normalizedAddress = decodeURIComponent(entityId.slice(PROPERTY_MEMORY_KEY_PREFIX.length));
        } catch (error) {
            return;
        }
        if (entityId !== propertyMemoryStorageKey(normalizedAddress)) return;
        var user = await getPropertyMemoryUser();
        var record = editingNormalizedAddress === normalizedAddress ? readFormRecord(editingDisplayAddress, editingNormalizedAddress) : currentRecord;
        finishPropertyMemoryDeletion(normalizedAddress, record && record.displayAddress || editingDisplayAddress || normalizedAddress, user && user.id);
        showFormStatus('Property Memory deletion is now confirmed for this account and the device fallback was removed.', 'success');
        if (document.getElementById('propertyMemoryManagerModal') && document.getElementById('propertyMemoryManagerModal').classList.contains('show')) loadPropertyMemoryManagerRecords();
    }

    async function openPropertyMemory(options) {
        options = options || {};
        var displayAddress = cleanText(options.displayAddress || getCurrentDisplayAddress());
        var normalizedAddress = normalizePropertyAddress(options.normalizedAddress || displayAddress);
        if (!normalizedAddress) {
            var message = 'Enter the project address before opening Property Memory.';
            if (typeof qdAlert === 'function') await qdAlert(message, { title: 'Project Address Needed', type: 'info' });
            else alert(message);
            if (getAddressInput()) getAddressInput().focus();
            return;
        }
        var record = options.record
            ? normalizePropertyMemoryRecord(options.record, displayAddress, normalizedAddress)
            : await loadPropertyMemoryRecord(displayAddress);
        if (!options.record && normalizePropertyAddress(getCurrentDisplayAddress()) !== normalizedAddress) return;
        var modal = ensureModal();
        clearFormStatus();
        document.getElementById('propertyMemoryModalAddress').textContent = displayAddress;
        editingDisplayAddress = displayAddress;
        editingNormalizedAddress = normalizedAddress;
        if (normalizePropertyAddress(getCurrentDisplayAddress()) === normalizedAddress) {
            currentRecord = record;
            currentNormalizedAddress = normalizedAddress;
            setEntryState(record, normalizedAddress, false);
        }
        setFormRecord(record, displayAddress, normalizedAddress);
        updatePropertyMemoryModalState(record);
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    async function savePropertyMemoryFromForm() {
        var displayAddress = editingDisplayAddress || getCurrentDisplayAddress();
        var normalizedAddress = editingNormalizedAddress || normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) return;
        var saveButton = document.getElementById('propertyMemorySaveBtn');
        var alwaysApplyCheckbox = document.getElementById('propertyMarkupAlwaysApply');
        var rawMarkupPercent = fieldValue('propertyMarkupPercent');
        var numericMarkupPercent = Number(rawMarkupPercent);
        if (alwaysApplyCheckbox && alwaysApplyCheckbox.checked && (!rawMarkupPercent || !isFinite(numericMarkupPercent) || numericMarkupPercent < 0 || numericMarkupPercent > 100)) {
            showFormStatus('Enter a markup percentage between 0 and 100 before enabling automatic markup.', 'warning');
            var markupField = document.getElementById('propertyMarkupPercent');
            if (markupField) markupField.focus();
            return;
        }
        var record = readFormRecord(displayAddress, normalizedAddress);
        var user = await getPropertyMemoryUser();
        if (!user && typeof getCurrentUser === 'function') {
            showFormStatus('Sign in before saving account-scoped Property Memory.', 'warning');
            return;
        }
        writeLocalRecord(record, user && user.id);
        if (normalizePropertyAddress(getCurrentDisplayAddress()) === normalizedAddress) {
            currentRecord = record;
            currentNormalizedAddress = normalizedAddress;
            activateAutomaticMarkupRule(record, normalizedAddress, { applyNow: false });
            setEntryState(record, normalizedAddress, false);
            evaluatePropertyReminders();
        }
        updatePropertyMemoryModalState(record);
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1" aria-hidden="true"></i>Saving...';
        }
        var cloudSaved = false;
        try {
            if (user && typeof saveUserDataValue === 'function') {
                var result = await saveUserDataValue(propertyMemoryStorageKey(normalizedAddress), record, {
                    entityType: 'user_data',
                    entityLabel: 'Property memory - ' + displayAddress
                });
                if (result && result.state === 'cloud_saved' && !result.error) cloudSaved = true;
                else if (result && result.error) throw result.error;
            }
            showFormStatus(cloudSaved ? 'Property memory saved to your account.' : 'Property memory is saved on this device. Account sync is pending; retry from Manage Property Memory when you are online.', cloudSaved ? 'success' : 'warning');
        } catch (error) {
            console.warn('Property memory cloud save failed:', error);
            showFormStatus('Property memory is saved on this device, but account sync is not confirmed. Open Manage Property Memory to retry when you are online.', 'warning');
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fas fa-floppy-disk me-1" aria-hidden="true"></i>Save property memory';
            }
        }
    }

    function roomMarkupSummary() {
        if (typeof rooms === 'undefined' || !Array.isArray(rooms) || rooms.length === 0) return 'No rooms are available in this quote yet.';
        var percentages = rooms.map(function(room) {
            return Math.max(0, Math.min(100, Number(room.markup) || 0));
        });
        var unique = percentages.filter(function(value, index) { return percentages.indexOf(value) === index; });
        if (unique.length === 1) return 'Current quote room markup: ' + unique[0] + '% across ' + rooms.length + ' room' + (rooms.length === 1 ? '' : 's') + '.';
        return 'Current quote room markup varies by room: ' + unique.join('%, ') + '%.';
    }

    function updateCurrentQuoteMarkupState() {
        var state = document.getElementById('propertyMarkupCurrentState');
        if (state) state.textContent = roomMarkupSummary();
    }

    function updatePropertyMarkupApplyState() {
        var checkbox = document.getElementById('propertyMarkupApplyConfirm');
        var button = document.getElementById('propertyMarkupApplyBtn');
        var percent = normalizeMarkupPercent(fieldValue('propertyMarkupPercent'));
        var hasRooms = typeof rooms !== 'undefined' && Array.isArray(rooms) && rooms.length > 0;
        if (button) button.disabled = !(checkbox && checkbox.checked && percent !== null && hasRooms);
    }

    function updatePropertyMarkupAutomaticState() {
        var checkbox = document.getElementById('propertyMarkupAlwaysApply');
        var state = document.getElementById('propertyMarkupAutomaticState');
        if (!state) return;
        var rawPercent = fieldValue('propertyMarkupPercent');
        var numericPercent = Number(rawPercent);
        if (!checkbox || !checkbox.checked) {
            state.className = 'small fw-semibold text-muted';
            state.textContent = 'Automatic application is off. This quote changes only if you use Apply to this quote.';
            return;
        }
        if (!rawPercent || !isFinite(numericPercent) || numericPercent < 0 || numericPercent > 100) {
            state.className = 'small fw-semibold text-danger';
            state.textContent = 'Enter a percentage from 0 to 100 before saving automatic application.';
            return;
        }
        state.className = 'small fw-semibold text-primary';
        state.textContent = 'When saved, Quote Dr will automatically apply ' + numericPercent + '% to rooms without a manual room markup whenever this property is selected.';
    }

    function automaticMarkupRuleFromRecord(record, normalizedAddress) {
        var normalizedRecord = normalizePropertyMemoryRecord(record, record && record.displayAddress, normalizedAddress);
        if (!normalizedRecord.markupRule.alwaysApply || normalizedRecord.markupRule.percent === null) return null;
        return {
            normalizedAddress: normalizedAddress || normalizedRecord.normalizedAddress,
            percent: normalizedRecord.markupRule.percent,
            note: normalizedRecord.markupRule.note
        };
    }

    function roomHasManualRoomMarkup(room) {
        if (!room || !Object.prototype.hasOwnProperty.call(room, 'markup')) return false;
        return room.markup !== '' && room.markup !== null && room.markup !== undefined;
    }

    function applyAutomaticMarkupToUnmarkedRooms(options) {
        options = options || {};
        if (!activeAutomaticMarkupRule || typeof rooms === 'undefined' || !Array.isArray(rooms) || rooms.length === 0) return 0;
        var skippedRoomIds = activeAutomaticMarkupRule.skipRoomIds || [];
        var targets = rooms.filter(function(room) {
            return !roomHasManualRoomMarkup(room) && skippedRoomIds.indexOf(String(room && room.id)) === -1;
        });
        if (!targets.length) return 0;
        if (options.undo !== false && typeof _pushUndo === 'function') _pushUndo();
        targets.forEach(function(room) {
            room.markup = activeAutomaticMarkupRule.percent;
            if (room.hideMarkup === undefined) room.hideMarkup = true;
        });
        if (options.render !== false && typeof renderRooms === 'function') renderRooms();
        if (options.persist !== false) {
            if (typeof saveSessionQuote === 'function') saveSessionQuote();
            if (typeof markUnsaved === 'function') markUnsaved();
        }
        updateCurrentQuoteMarkupState();
        if (options.announce !== false && typeof showToast === 'function') {
            showToast(
                activeAutomaticMarkupRule.percent + '% saved property markup applied to ' + targets.length + ' room' + (targets.length === 1 ? '' : 's') + '. Existing manual room markups were kept.',
                'info'
            );
        }
        return targets.length;
    }

    function activateAutomaticMarkupRule(record, normalizedAddress, options) {
        options = options || {};
        activeAutomaticMarkupRule = automaticMarkupRuleFromRecord(record, normalizedAddress);
        if (!activeAutomaticMarkupRule) return 0;
        activeAutomaticMarkupRule.skipRoomIds = options.applyNow === false && typeof rooms !== 'undefined' && Array.isArray(rooms)
            ? rooms.map(function(room) { return String(room && room.id); })
            : [];
        if (options.applyNow === false) return 0;
        return applyAutomaticMarkupToUnmarkedRooms(options);
    }

    async function applyPropertyMarkupToQuote() {
        var checkbox = document.getElementById('propertyMarkupApplyConfirm');
        var rawPercent = fieldValue('propertyMarkupPercent');
        var percent = normalizeMarkupPercent(rawPercent);
        if (!checkbox || !checkbox.checked || percent === null) return;
        if (typeof rooms === 'undefined' || !Array.isArray(rooms) || rooms.length === 0) return;
        if (Number(rawPercent) < 0 || Number(rawPercent) > 100) {
            showFormStatus('Enter a markup percentage between 0 and 100.', 'warning');
            return;
        }
        var message = 'Apply ' + percent + '% room markup to all ' + rooms.length + ' room' + (rooms.length === 1 ? '' : 's') + '? This replaces existing room markup percentages. Individual item markup remains unchanged.';
        var confirmed = typeof qdConfirm === 'function'
            ? await qdConfirm(message, { title: 'Apply Property Markup?', okText: 'Apply Markup', cancelText: 'Cancel', okClass: 'btn-warning', type: 'warning' })
            : window.confirm(message);
        if (!confirmed) return;
        if (typeof _pushUndo === 'function') _pushUndo();
        rooms.forEach(function(room) {
            room.markup = percent;
            if (room.hideMarkup === undefined) room.hideMarkup = true;
        });
        if (typeof renderRooms === 'function') renderRooms();
        if (typeof saveSessionQuote === 'function') saveSessionQuote();
        if (typeof markUnsaved === 'function') markUnsaved();
        checkbox.checked = false;
        updatePropertyMarkupApplyState();
        updateCurrentQuoteMarkupState();
        showFormStatus(percent + '% room markup applied to this quote. Property notes were not changed.', 'success');
    }

    function normalizeReminderAcknowledgements(values) {
        if (!Array.isArray(values)) return [];
        return values.map(cleanText).filter(function(value, index, list) {
            return value && list.indexOf(value) === index;
        });
    }

    function propertyReminderAcknowledgementKey(normalizedAddress, reminder) {
        reminder = normalizePropertyReminder(reminder);
        return normalizedAddress + '::' + reminder.id;
    }

    function propertyReminderMatchesItem(reminder, item) {
        reminder = normalizePropertyReminder(reminder);
        item = item || {};
        var source = item.savedItemSource || {};
        var itemCategory = normalizeMatchText(item.category || source.category);
        var targetCategory = normalizeMatchText(reminder.category);
        if (reminder.targetType === 'category') return !!targetCategory && itemCategory === targetCategory;
        if (targetCategory && itemCategory !== targetCategory) return false;
        var targetReference = normalizeMatchText(reminder.itemReference || reminder.itemLabel);
        if (!targetReference) return false;
        var names = [item.serviceName, item.description, item.name, source.name, item.itemReference, item.reference, source.key, source.reference, source.id]
            .map(normalizeMatchText)
            .filter(Boolean);
        var combined = names.map(function(name) { return normalizeMatchText(itemCategory + ' ' + name); });
        return names.indexOf(targetReference) !== -1 || combined.indexOf(targetReference) !== -1;
    }

    function findMatchingPropertyReminders(record, displayAddress, quoteItems, acknowledgements) {
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        var normalizedRecord = normalizePropertyMemoryRecord(record, record && record.displayAddress, record && record.normalizedAddress);
        if (!normalizedAddress || normalizedRecord.normalizedAddress !== normalizedAddress) return [];
        quoteItems = Array.isArray(quoteItems) ? quoteItems : [];
        acknowledgements = normalizeReminderAcknowledgements(acknowledgements);
        return normalizedRecord.reminders.filter(function(reminder) {
            var key = propertyReminderAcknowledgementKey(normalizedAddress, reminder);
            return acknowledgements.indexOf(key) === -1 && quoteItems.some(function(item) {
                return propertyReminderMatchesItem(reminder, item);
            });
        });
    }

    function currentQuoteLineItems() {
        if (typeof rooms === 'undefined' || !Array.isArray(rooms)) return [];
        var items = [];
        rooms.forEach(function(room) {
            (room && Array.isArray(room.items) ? room.items : []).forEach(function(item) {
                if (item && item._coRemoved !== true) items.push(item);
            });
        });
        return items;
    }

    function setReminderAcknowledgements(values) {
        window._propertyMemoryReminderAcknowledgements = normalizeReminderAcknowledgements(values);
        if (window._loadedQuoteData) window._loadedQuoteData.propertyMemoryReminderAcknowledgements = window._propertyMemoryReminderAcknowledgements.slice();
        if (window._currentQuoteData) window._currentQuoteData.propertyMemoryReminderAcknowledgements = window._propertyMemoryReminderAcknowledgements.slice();
    }

    function getReminderAcknowledgements() {
        return normalizeReminderAcknowledgements(window._propertyMemoryReminderAcknowledgements);
    }

    function acknowledgePropertyReminder(key) {
        var acknowledgements = getReminderAcknowledgements();
        if (acknowledgements.indexOf(key) === -1) acknowledgements.push(key);
        setReminderAcknowledgements(acknowledgements);
        evaluatePropertyReminders();
        if (typeof saveSessionQuote === 'function') saveSessionQuote();
        if (typeof markUnsaved === 'function') markUnsaved();
    }

    function clearPropertyReminderArea() {
        var area = document.getElementById('propertyMemoryReminderArea');
        if (!area) return;
        area.textContent = '';
        area.hidden = true;
    }

    function evaluatePropertyReminders() {
        var area = document.getElementById('propertyMemoryReminderArea');
        if (!area) return [];
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        var record = currentRecord;
        if (!record || record.normalizedAddress !== normalizedAddress) {
            clearPropertyReminderArea();
            return [];
        }
        var matches = findMatchingPropertyReminders(record, displayAddress, currentQuoteLineItems(), getReminderAcknowledgements());
        area.textContent = '';
        area.hidden = !matches.length;
        matches.forEach(function(reminder) {
            var key = propertyReminderAcknowledgementKey(normalizedAddress, reminder);
            var alertNode = document.createElement('div');
            alertNode.className = 'alert alert-warning property-memory-reminder-alert mt-2 mb-0';
            alertNode.setAttribute('role', 'status');
            alertNode.setAttribute('data-property-reminder-key', key);
            var heading = document.createElement('div');
            heading.className = 'fw-bold';
            heading.textContent = reminder.label || 'Property reminder';
            var message = document.createElement('div');
            message.className = 'mt-1';
            message.textContent = reminder.message;
            var target = document.createElement('div');
            target.className = 'small text-muted mt-1';
            target.textContent = 'Matched ' + propertyReminderTargetDescription(reminder) + '. No quote values were changed.';
            var actions = document.createElement('div');
            actions.className = 'd-flex flex-wrap gap-2 mt-2';
            var dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.className = 'btn btn-sm btn-warning';
            dismiss.textContent = 'Dismiss for this quote';
            dismiss.addEventListener('click', function() { acknowledgePropertyReminder(key); });
            var review = document.createElement('button');
            review.type = 'button';
            review.className = 'btn btn-sm btn-outline-secondary';
            review.textContent = 'Review Property Memory';
            review.addEventListener('click', function() { openPropertyMemory(); });
            actions.appendChild(dismiss);
            actions.appendChild(review);
            alertNode.appendChild(heading);
            alertNode.appendChild(message);
            alertNode.appendChild(target);
            alertNode.appendChild(actions);
            area.appendChild(alertNode);
        });
        return matches;
    }

    function onAddressInput() {
        clearTimeout(addressInputTimer);
        activeAutomaticMarkupRule = null;
        currentRecord = null;
        clearPropertyReminderArea();
        setEntryState(null, normalizePropertyAddress(getCurrentDisplayAddress()), true);
        addressInputTimer = setTimeout(function() { refreshForCurrentAddress(); }, 350);
    }

    function init() {
        ensureModal();
        var addressInput = getAddressInput();
        if (!addressInput) return;
        addressInput.addEventListener('input', onAddressInput);
        addressInput.addEventListener('change', refreshForCurrentAddress);
        var button = document.getElementById('propertyMemoryBtn');
        if (button) button.addEventListener('click', openPropertyMemory);
        var manageButton = document.getElementById('managePropertyMemoryBtn');
        if (manageButton) manageButton.addEventListener('click', openPropertyMemoryManager);
        window.addEventListener('quotedr-save-acknowledged', handlePropertyMemoryDeleteAcknowledgement);
        refreshForCurrentAddress();
    }

    window.QuoteDrPropertyMemory = {
        open: openPropertyMemory,
        openManager: openPropertyMemoryManager,
        removeCurrent: deleteEditingPropertyMemory,
        normalizeAddress: normalizePropertyAddress,
        refreshForCurrentAddress: refreshForCurrentAddress,
        applyMarkupToQuote: applyPropertyMarkupToQuote,
        applyAutomaticMarkupToUnmarkedRooms: applyAutomaticMarkupToUnmarkedRooms,
        evaluateReminders: evaluatePropertyReminders,
        setQuoteReminderAcknowledgements: setReminderAcknowledgements,
        __test: {
            normalizeAddress: normalizePropertyAddress,
            storageKey: propertyMemoryStorageKey,
            localKey: propertyMemoryLocalKey,
            scopedLocalKey: propertyMemoryScopedLocalKey,
            normalizeRecord: normalizePropertyMemoryRecord,
            hasMeaningfulData: propertyMemoryHasMeaningfulData,
            normalizeAdditionalContacts: normalizeAdditionalContacts,
            additionalContactHasData: additionalContactHasData,
            normalizeMarkupPercent: normalizeMarkupPercent,
            normalizeReminder: normalizePropertyReminder,
            normalizeReminders: normalizePropertyReminders,
            reminderMatchesItem: propertyReminderMatchesItem,
            findMatchingReminders: findMatchingPropertyReminders,
            reminderAcknowledgementKey: propertyReminderAcknowledgementKey,
            mergeRecords: mergePropertyMemoryRecords,
            searchText: propertyMemorySearchText,
            buildDeleteTarget: buildPropertyMemoryDeleteTarget,
            removeCloudRecord: removePropertyMemoryCloudRecord,
            finishDeletion: finishPropertyMemoryDeletion,
            activateAutomaticMarkupRule: activateAutomaticMarkupRule,
            roomHasManualRoomMarkup: roomHasManualRoomMarkup
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window, document);
