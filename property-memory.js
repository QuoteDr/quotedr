(function(window, document) {
    'use strict';

    var PROPERTY_MEMORY_KEY_PREFIX = 'property_memory:';
    var PROPERTY_MEMORY_LOCAL_PREFIX = 'ald_property_memory:';
    var PROPERTY_MEMORY_VERSION = 1;
    var addressLoadSequence = 0;
    var addressInputTimer = null;
    var currentRecord = null;
    var currentNormalizedAddress = '';

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

    function normalizeMarkupPercent(value) {
        if (value === '' || value === null || value === undefined) return null;
        var percent = Number(value);
        if (!isFinite(percent)) return null;
        return Math.max(0, Math.min(100, percent));
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
                superintendent: cleanContact(contacts.superintendent)
            },
            workHistory: cleanText(raw.workHistory),
            markupRule: {
                percent: normalizeMarkupPercent(markupRule.percent),
                note: cleanText(markupRule.note)
            },
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
        return textValues.some(Boolean) || contactValues || normalized.markupRule.percent !== null;
    }

    function getAddressInput() {
        return document.getElementById('projectAddress');
    }

    function getCurrentDisplayAddress() {
        var input = getAddressInput();
        return input ? cleanText(input.value) : '';
    }

    function readLocalRecord(normalizedAddress) {
        if (!normalizedAddress) return null;
        try {
            var raw = localStorage.getItem(propertyMemoryLocalKey(normalizedAddress));
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (normalizePropertyAddress(parsed.normalizedAddress) !== normalizedAddress) return null;
            return normalizePropertyMemoryRecord(parsed, parsed.displayAddress, normalizedAddress);
        } catch (error) {
            return null;
        }
    }

    function writeLocalRecord(record) {
        try {
            localStorage.setItem(propertyMemoryLocalKey(record.normalizedAddress), JSON.stringify(record));
        } catch (error) {
            console.warn('Property memory local save failed:', error);
        }
    }

    async function loadPropertyMemoryRecord(displayAddress) {
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) return null;
        var localRecord = readLocalRecord(normalizedAddress);
        if (typeof getCurrentUser !== 'function' || typeof _supabase === 'undefined') return localRecord;
        try {
            var user = await getCurrentUser();
            if (!user) return localRecord;
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
            writeLocalRecord(normalizedRecord);
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
        var hasSaved = propertyMemoryHasMeaningfulData(record);
        if (button) {
            button.disabled = !hasAddress || loading === true;
            button.setAttribute('aria-label', hasSaved ? 'Open saved property memory for this address' : 'Add property memory for this address');
        }
        if (badge) badge.hidden = !hasSaved;
        if (status) {
            status.textContent = loading ? 'Checking saved property information...' : (hasSaved ? 'Saved information is available for this address.' : '');
        }
    }

    async function refreshForCurrentAddress() {
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        var sequence = ++addressLoadSequence;
        currentNormalizedAddress = normalizedAddress;
        currentRecord = null;
        setEntryState(null, normalizedAddress, !!normalizedAddress);
        if (!normalizedAddress) return null;
        var record = await loadPropertyMemoryRecord(displayAddress);
        if (sequence !== addressLoadSequence || normalizedAddress !== normalizePropertyAddress(getCurrentDisplayAddress())) return null;
        currentRecord = record;
        currentNormalizedAddress = normalizedAddress;
        setEntryState(record, normalizedAddress, false);
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
            '          <h2 class="modal-title fs-5" id="propertyMemoryModalLabel"><i class="fas fa-house-circle-check me-2" aria-hidden="true"></i>Property memory</h2>',
            '          <div class="small opacity-75" id="propertyMemoryModalAddress"></div>',
            '        </div>',
            '        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>',
            '      </div>',
            '      <div class="modal-body">',
            '        <div class="alert alert-info py-2 small" role="note"><i class="fas fa-location-dot me-1" aria-hidden="true"></i>This information is saved to this property address. Property contacts stay separate from the quote client and personal client preferences.</div>',
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
            '        </fieldset>',
            '        <fieldset class="property-memory-section">',
            '          <legend>Work history</legend>',
            '          <label class="form-label" for="propertyWorkHistory">Previous work and outcomes at this property</label>',
            '          <textarea class="form-control" id="propertyWorkHistory" rows="4" placeholder="Dates, completed work, contractors, warranties, follow-up items..."></textarea>',
            '        </fieldset>',
            '        <fieldset class="property-memory-section property-memory-markup-section">',
            '          <legend>Optional markup rule</legend>',
            '          <div class="alert alert-warning py-2 small"><strong>Saving this rule never changes pricing.</strong> Applying it to a quote is always a separate, explicit action.</div>',
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
            '        </fieldset>',
            '      </div>',
            '      <div class="modal-footer">',
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
        document.getElementById('propertyMarkupApplyConfirm').addEventListener('change', updatePropertyMarkupApplyState);
        document.getElementById('propertyMarkupPercent').addEventListener('input', updatePropertyMarkupApplyState);
        document.getElementById('propertyMarkupApplyBtn').addEventListener('click', applyPropertyMarkupToQuote);
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
        setFieldValue('propertyWorkHistory', record.workHistory);
        setFieldValue('propertyMarkupPercent', record.markupRule.percent);
        setFieldValue('propertyMarkupNote', record.markupRule.note);
        var checkbox = document.getElementById('propertyMarkupApplyConfirm');
        if (checkbox) checkbox.checked = false;
        updatePropertyMarkupApplyState();
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
                superintendent: { name: fieldValue('propertySuperintendentName'), phone: fieldValue('propertySuperintendentPhone'), email: fieldValue('propertySuperintendentEmail') }
            },
            workHistory: fieldValue('propertyWorkHistory'),
            markupRule: { percent: fieldValue('propertyMarkupPercent'), note: fieldValue('propertyMarkupNote') },
            updatedAt: new Date().toISOString()
        }, displayAddress, normalizedAddress);
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

    async function openPropertyMemory() {
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) {
            var message = 'Enter the project address before opening Property Memory.';
            if (typeof qdAlert === 'function') await qdAlert(message, { title: 'Project Address Needed', type: 'info' });
            else alert(message);
            if (getAddressInput()) getAddressInput().focus();
            return;
        }
        var record = await loadPropertyMemoryRecord(displayAddress);
        if (normalizePropertyAddress(getCurrentDisplayAddress()) !== normalizedAddress) return;
        var modal = ensureModal();
        clearFormStatus();
        document.getElementById('propertyMemoryModalAddress').textContent = displayAddress;
        currentRecord = record;
        currentNormalizedAddress = normalizedAddress;
        setEntryState(record, normalizedAddress, false);
        setFormRecord(record, displayAddress, normalizedAddress);
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    async function savePropertyMemoryFromForm() {
        var displayAddress = getCurrentDisplayAddress();
        var normalizedAddress = normalizePropertyAddress(displayAddress);
        if (!normalizedAddress) return;
        var saveButton = document.getElementById('propertyMemorySaveBtn');
        var record = readFormRecord(displayAddress, normalizedAddress);
        writeLocalRecord(record);
        currentRecord = record;
        currentNormalizedAddress = normalizedAddress;
        setEntryState(record, normalizedAddress, false);
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1" aria-hidden="true"></i>Saving...';
        }
        var cloudSaved = false;
        try {
            if (typeof saveUserDataValue === 'function') {
                var result = await saveUserDataValue(propertyMemoryStorageKey(normalizedAddress), record, {
                    entityType: 'user_data',
                    entityLabel: 'Property memory - ' + displayAddress
                });
                if (result && result.error) throw result.error;
                cloudSaved = true;
            }
            showFormStatus(cloudSaved ? 'Property memory saved to your account.' : 'Property memory saved on this device.', cloudSaved ? 'success' : 'warning');
        } catch (error) {
            console.warn('Property memory cloud save failed:', error);
            showFormStatus('Property memory is saved on this device, but cloud sync is not available right now.', 'warning');
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

    function onAddressInput() {
        clearTimeout(addressInputTimer);
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
        refreshForCurrentAddress();
    }

    window.QuoteDrPropertyMemory = {
        open: openPropertyMemory,
        refreshForCurrentAddress: refreshForCurrentAddress,
        applyMarkupToQuote: applyPropertyMarkupToQuote,
        __test: {
            normalizeAddress: normalizePropertyAddress,
            storageKey: propertyMemoryStorageKey,
            localKey: propertyMemoryLocalKey,
            normalizeRecord: normalizePropertyMemoryRecord,
            hasMeaningfulData: propertyMemoryHasMeaningfulData,
            normalizeMarkupPercent: normalizeMarkupPercent
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window, document);
