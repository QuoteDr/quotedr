// Quote Dr save/load, autosave, and startup session helpers.
// Extracted from quote-builder.html while preserving the existing global API.

        // -- Save / Load / Auto-save ---------------------------------------------

        let saveFileHandle = null;
        let autoSaveTimer = null;
        var _autoSaveTimer = null;
        var _autoSaveOn = localStorage.getItem('ald_autosave_enabled') !== 'false';
        let unsavedChanges = false;
        let initDone = false;
        let supabaseQuoteId = null;
        currentUser = null;

        function parseQuoteMoney(value) {
            var raw = String(value || '');
            var negative = /-/.test(raw) || /\(.+\)/.test(raw);
            var amount = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
            return negative ? -amount : amount;
        }

        function quoteStorageData(row) {
            return row && row.data ? row.data : {};
        }

        function quoteStorageIsJunked(row) {
            return !!quoteStorageData(row).junk_deleted_at;
        }

        function quoteStorageEscapeHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function quoteStorageJsAttr(value) {
            return quoteStorageEscapeHtml(JSON.stringify(String(value == null ? '' : value)));
        }

        function quoteStorageClientName(row) {
            var data = quoteStorageData(row);
            return String((row && row.client_name) || data.clientName || data.client_name || '').trim();
        }

        function quoteStorageQuoteNumber(row) {
            var data = quoteStorageData(row);
            return String((row && row.quote_number) || data.quoteNumber || data.quote_number || '').trim();
        }

        function quoteStorageDisplayTitle(row) {
            var data = quoteStorageData(row);
            var title = String(data.quoteTitle || data.invoiceTitle || data.title || '').trim();
            return title || quoteStorageClientName(row) || 'Unnamed Client';
        }

        function quoteStorageRowTime(row) {
            var data = quoteStorageData(row);
            return new Date(data.savedAt || (row && row.updated_at) || (row && row.created_at) || 0).getTime() || 0;
        }

        function quoteStorageDuplicateKey(row) {
            var status = String((row && row.status) || quoteStorageData(row).status || '').toLowerCase();
            if (status !== 'draft') return '';
            var client = quoteStorageClientName(row);
            var quoteNumber = quoteStorageQuoteNumber(row);
            return (client || quoteNumber) ? (client + '|' + quoteNumber) : '';
        }

        function quoteStorageActiveRows(rows) {
            var active = (rows || []).filter(function(row) { return !quoteStorageIsJunked(row); });
            var seen = {};
            var deduped = [];
            active.forEach(function(row) {
                var key = quoteStorageDuplicateKey(row);
                if (!key || !Object.prototype.hasOwnProperty.call(seen, key)) {
                    if (key) seen[key] = deduped.length;
                    deduped.push(row);
                    return;
                }
                var existingIndex = seen[key];
                var existing = deduped[existingIndex];
                if (quoteStorageRowTime(row) > quoteStorageRowTime(existing)) {
                    deduped[existingIndex] = row;
                }
            });
            return deduped;
        }

        function quoteIsPortalLockedForBuilder(row) {
            return !!(row && row.data && row.data.portal_visible === true);
        }

        function quoteDataIsPortalLockedForBuilder(data) {
            return !!(data && (data.portal_visible === true || (data.data && data.data.portal_visible === true)));
        }

        function clearPortalLockedBuilderRestoreState() {
            localStorage.removeItem("ald_active_quote_id");
            localStorage.removeItem("ald_open_cloud_quote");
            localStorage.removeItem("ald_session_quote");
            window._supabaseQuoteId = null;
        }

        async function handlePortalLockedBuilderLoad(q) {
            var added = q && q.data && q.data.portal_added_at ? new Date(q.data.portal_added_at).toLocaleString() : '';
            var message = 'This document is already in a client portal and cannot be edited directly. Remove it from the portal in the dashboard to edit, or duplicate it as a new revision.';
            if (added) message += '\n\nAdded to portal: ' + added;
            message += '\n\nChoose another quote/draft, or start a new quote.';
            clearPortalLockedBuilderRestoreState();
            if (typeof qdAlert === 'function') {
                var choice = true;
                if (typeof qdConfirm === 'function') {
                    choice = await qdConfirm(message, {
                        title: 'Portal Document Locked',
                        okText: 'Choose Another Quote/Draft',
                        okClass: 'btn-primary',
                        secondaryText: 'Start New Quote',
                        secondaryValue: 'new',
                        secondaryClass: 'btn-outline-success',
                        cancelText: 'Dashboard',
                        type: 'warning'
                    });
                } else {
                    await qdAlert(message, { title: 'Portal Document Locked', type: 'warning' });
                }
                if (choice === 'new') {
                    window.location.href = 'quote-builder.html?new=1';
                } else {
                    window.location.href = 'dashboard.html';
                }
            } else {
                alert(message);
                window.location.href = 'dashboard.html';
            }
            return true;
        }

        function qdQuoteStorageTextKey(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^\w\s]/g, '')
                .trim();
        }

        function sanitizeQuoteRoomsForSave(sourceRooms) {
            var clonedRooms = JSON.parse(JSON.stringify(sourceRooms || []));
            clonedRooms.forEach(function(room) {
                (room.items || []).forEach(function(item) {
                    var note = String(item && item.notes || '').trim();
                    var description = String(item && item.itemDescription || '').trim();
                    if (note && description && qdQuoteStorageTextKey(note) === qdQuoteStorageTextKey(description)) {
                        item.notes = '';
                    }
                });
            });
            return clonedRooms;
        }

        function collectQuoteData() {
            var grandTotal = parseQuoteMoney(document.getElementById('grandTotalDisplay')?.textContent || '0');
            var isChangeOrder = window._quoteDocumentType === 'change_order';
            var statusEl = document.getElementById('quoteStatus');
            var status = statusEl ? statusEl.value : (isChangeOrder ? 'draft' : 'draft');
            var supabaseId = window._supabaseQuoteId || null;
            var loadedData = window._loadedQuoteData || window._currentQuoteData || {};
            if (isChangeOrder && supabaseId && window._parentQuoteId && supabaseId === window._parentQuoteId) {
                supabaseId = null;
            }
            return {
                version: 1,
                savedAt: new Date().toISOString(),
                type: window._quoteDocumentType || 'quote',
                documentType: window._quoteDocumentType || 'quote',
                parentQuoteId: window._parentQuoteId || '',
                parentQuoteNumber: window._parentQuoteNumber || '',
                parentQuoteTotal: parseFloat(window._parentQuoteTotal || 0) || 0,
                changeOrderBaseRooms: window._changeOrderBaseRooms || [],
                changeOrderPreviousApprovedTotal: parseFloat(window._changeOrderPreviousApprovedTotal || window._previousApprovedChangeOrderTotal || 0) || 0,
                changeOrderPriceSummary: window._changeOrderPriceSummary || null,
                changeOrderNumber: parseInt(window._changeOrderNumber || 0, 10) || null,
                changeReason: document.getElementById('changeOrderReason')?.value || '',
                status: status,
                quoteTitle:     document.getElementById('quoteTitle')?.value     || '',
                clientName:     document.getElementById('clientName')?.value     || '',
                quoteNumber:    document.getElementById('quoteNumber')?.value    || '',
                projectAddress: document.getElementById('projectAddress')?.value || '',
                clientPhone:    document.getElementById('clientPhone')?.value    || '',
                clientEmail:    document.getElementById('clientEmail')?.value    || '',
                terms: getSelectedTerms(),
                rooms: sanitizeQuoteRoomsForSave(rooms),
                categoryStyles: JSON.parse(JSON.stringify(categoryStyles || {})),
                roomCounter: roomCounter,
                quoteAdjustment: getQuoteClientAdjustment(),
                grandTotal: grandTotal,
                total: grandTotal,
                supabaseId: supabaseId,
                currency: (function(){ try { return JSON.parse(localStorage.getItem('ald_quote_prefs')||'{}').currency||'CAD'; } catch(e){return 'CAD';} })(),
                paymentSettings: (typeof getLocalPaymentSettingsSnapshot === 'function') ? getLocalPaymentSettingsSnapshot() : null,
                businessProfile: (typeof getLocalBusinessProfileSnapshot === 'function') ? getLocalBusinessProfileSnapshot() : {},
                hiddenProfileFields: (typeof getLocalHiddenProfileFieldsSnapshot === 'function') ? getLocalHiddenProfileFieldsSnapshot() : [],
                portal_visible: loadedData.portal_visible === true,
                portal_id: loadedData.portal_id || '',
                portal_name: loadedData.portal_name || '',
                portal_client_name: loadedData.portal_client_name || loadedData.clientName || '',
                portal_client_email: loadedData.portal_client_email || loadedData.clientEmail || loadedData.email || '',
                portal_pin: loadedData.portal_pin || '',
                portal_added_at: loadedData.portal_added_at || null,
                portal_theme: loadedData.portal_theme || null
            };
        }

        function toggleClientInfo() {
            var body = document.getElementById('clientInfoBody');
            var btn = document.getElementById('clientInfoToggleBtn');
            if (!body || !btn) return;
            var hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            btn.innerHTML = hidden
                ? '<i class="fas fa-eye-slash me-1"></i>Hide'
                : '<i class="fas fa-eye me-1"></i>Show';
        }

        function applyQuoteData(data) {
            var wasInitDone = initDone;
            initDone = false; // suppress markUnsaved during load
            if (document.getElementById('quoteTitle'))     document.getElementById('quoteTitle').value     = data.quoteTitle || data.clientName || data.client_name || '';
            if (document.getElementById('clientName'))     document.getElementById('clientName').value     = data.clientName || data.client_name || '';
            if (document.getElementById('quoteNumber'))    document.getElementById('quoteNumber').value    = data.quoteNumber || data.quote_number || '';
            if (document.getElementById('quoteStatus'))    document.getElementById('quoteStatus').value    = data.status || 'draft';
            if (document.getElementById('projectAddress')) document.getElementById('projectAddress').value = data.projectAddress || data.project_address || '';
            if (document.getElementById('clientPhone'))    document.getElementById('clientPhone').value    = data.clientPhone || data.phone || '';
            if (document.getElementById('clientEmail'))    document.getElementById('clientEmail').value    = data.clientEmail || data.email || '';
            renderTermsCheckboxes();
            if (data.terms && Array.isArray(data.terms)) {
                document.querySelectorAll('#termsCheckboxes input[type="checkbox"]').forEach(function(cb) {
                    cb.checked = data.terms.includes(cb.dataset.text);
                });
            }
            rooms = data.rooms || [];
            if (data.categoryStyles && typeof categoryStyles !== 'undefined') {
                Object.assign(categoryStyles, data.categoryStyles || {});
                try { localStorage.setItem('ald_category_styles', JSON.stringify(categoryStyles)); } catch(e) {}
            }
            roomCounter = data.roomCounter || rooms.length;
            setQuoteClientAdjustment(data.quoteAdjustment || data.clientAdjustment || null);
            window._quoteDocumentType = data.type || data.documentType || 'quote';
            window._parentQuoteId = data.parentQuoteId || data.parent_quote_id || '';
            window._parentQuoteNumber = data.parentQuoteNumber || '';
            window._parentQuoteTotal = parseFloat(data.parentQuoteTotal || 0) || 0;
            window._changeOrderBaseRooms = data.changeOrderBaseRooms || [];
            window._changeOrderPreviousApprovedTotal = parseFloat(data.changeOrderPreviousApprovedTotal || data.previousApprovedChangeOrderTotal || 0) || 0;
            window._previousApprovedChangeOrderTotal = window._changeOrderPreviousApprovedTotal;
            window._changeOrderPriceSummary = data.changeOrderPriceSummary || null;
            window._changeOrderNumber = parseInt(data.changeOrderNumber || data.change_order_number || 0, 10) || 0;
            setTimeout(function() {
                if (document.getElementById('changeOrderReason')) document.getElementById('changeOrderReason').value = data.changeReason || '';
                if (typeof updateChangeOrderModeUI === 'function') updateChangeOrderModeUI();
            }, 0);
            // Restore Supabase ID so autosave overwrites the correct record
            if (data.supabaseId) {
                window._supabaseQuoteId = data.supabaseId;
                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                window._quoteFullyLoaded = true;
            }
            window._loadedQuoteData = Object.assign({}, data, { supabaseId: window._supabaseQuoteId || data.supabaseId || null });
            renderRooms();
            initDone = wasInitDone;
            unsavedChanges = false; // clean slate after load
        }

        function updateSaveStatus(state, detail) {
            const el = document.getElementById('saveStatus');
            if (!el) return;
            const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (state === 'saved') {
                el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> Saved at ' + t + (detail ? ' \u2014 ' + detail : '') + '</span>';
                unsavedChanges = false;
            } else if (state === 'unsaved') {
                el.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-circle"></i> Unsaved changes</span>';
            } else if (state === 'saving') {
                el.innerHTML = '<span style="color:#6c757d;"><i class="fas fa-spinner fa-spin"></i> Saving\u2026</span>';
            } else if (state === 'loaded') {
                el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-folder-open"></i> Opened at ' + t + (detail ? ' \u2014 ' + detail : '') + '</span>';
                unsavedChanges = false;
            } else if (state === 'error') {
                el.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> ' + (detail || 'Save failed') + '</span>';
            }
        }

        function markUnsaved() {
            unsavedChanges = true;
            var el = document.getElementById('saveStatus');
            if (el) el.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-circle"></i> Unsaved changes</span>';
            // Debounced auto-save: 1 second after last change
            if (_autoSaveOn) {
                clearTimeout(_autoSaveTimer);
                _autoSaveTimer = setTimeout(function() { doAutoSave(); }, 1000);
            }
        }

        async function writeToHandle(handle) {
            updateSaveStatus('saving');
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(collectQuoteData(), null, 2));
            await writable.close();
            updateSaveStatus('saved');
            updateDraftWarning();
        }

        async function newQuote() {
            if (!await qdConfirm('Start a new quote? Any unsaved changes will be lost.', {
                title: 'Start New Quote',
                okText: 'Start New',
                okClass: 'btn-warning',
                type: 'warning'
            })) return;
            window._quoteFullyLoaded = true; // new quote - intentionally empty, allow save
            // Clear all fields
            ['quoteTitle','clientName','clientEmail','projectAddress','quoteNotes'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.value = '';
            });
            rooms = [];
            renderRooms();
            document.getElementById('quoteNumber').value = nextQuoteNumberValue();
            checkQuoteNumberDuplicate();
            currentQuoteId = null;
            window._quoteDocumentType = 'quote';
            window._parentQuoteId = '';
            window._parentQuoteNumber = '';
            window._parentQuoteTotal = 0;
            window._changeOrderNumber = 0;
            if (typeof updateChangeOrderModeUI === 'function') updateChangeOrderModeUI();
            saveFileHandle = null; // force "Save As" on next save
            unsavedChanges = false;
            document.title = 'Quote Builder - QuoteDr';
        }

        function qdAfterManualQuoteSave() {
            if (typeof qdMaybeShowSecondQuoteUpgradePrompt === 'function') {
                setTimeout(function() { qdMaybeShowSecondQuoteUpgradePrompt(); }, 500);
            }
        }

async function saveQuote() {
            // Always show save dialog first
            var qData = collectQuoteData();
            if (!qData.clientName && !qData.rooms.length) {
                qdAlert('Nothing to save yet - add a client name or some rooms first.');
                return;
            }
            showSaveDialog(qData);
            return;

            // Desktop: use File System API
            if (!saveFileHandle) {
                try {
                    const client = document.getElementById('clientName')?.value.trim() || 'Quote';
                    const date = new Date().toISOString().slice(0, 10);
                    saveFileHandle = await window.showSaveFilePicker({
                        suggestedName: client + ' - ' + date + '.qdr',
                        types: [{ description: 'QuoteDr File', accept: { 'application/json': ['.qdr'] } }]
                    });
                    startAutoSave();
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    downloadQuoteFallback();
                    return;
                }
            }
            try {
                await writeToHandle(saveFileHandle);
            } catch (err) {
                updateSaveStatus('error', 'Could not write file');
            }
            if (typeof saveQuoteToSupabase === 'function') {
                var qData2 = collectQuoteData();
                saveQuoteToSupabase(qData2).then(function(result) {
                    if (result && result.data) {
                        var saved = Array.isArray(result.data) ? result.data[0] : result.data;
                        if (saved && saved.id) {
                            window._supabaseQuoteId = saved.id;
                            localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                        }
                    }
                }).catch(function(){});
            }
        }

        // -- Save Dialog ----------------------------------------------------------
        var _saveDialogData = null;
        var _selectedOverwriteId = null;

        async function showSaveDialog(qData) {
            _saveDialogData = qData;
            _selectedOverwriteId = null;
            // Pre-fill name
            var nameInput = document.getElementById('saveQuoteNameInput');
            if (nameInput) nameInput.value = qData.quoteTitle || qData.clientName || '';
            // Disable overwrite button
            var owBtn = document.getElementById('overwriteBtn');
            if (owBtn) owBtn.disabled = true;
            // Load existing quotes
            var listEl = document.getElementById('saveQuoteList');
            if (listEl) listEl.innerHTML = '<div class="text-muted small text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</div>';
            // Show modal (reuse existing instance if already initialized)
            var saveModalEl = document.getElementById('saveQuoteModal');
            var modal = bootstrap.Modal.getInstance(saveModalEl) || new bootstrap.Modal(saveModalEl);
            modal.show();
            // Fetch quotes
            if (typeof listQuotesFromSupabase === 'function') {
                var result = await listQuotesFromSupabase();
                var quotes = (result && result.data) ? result.data : [];
                if (!listEl) return;
                if (!quotes.length) {
                    listEl.innerHTML = '<div class="text-muted small text-center py-2">No saved quotes yet</div>';
                    return;
                }
                listEl.innerHTML = quotes.map(function(q) {
                    var date = q.updated_at ? new Date(q.updated_at).toLocaleDateString() : '';
                    var total = q.total ? ('$' + parseFloat(q.total).toFixed(2)) : '$0.00';
                    return '<div class="save-quote-item p-2 mb-1 rounded" style="border:1px solid #dee2e6; cursor:pointer;" onclick="selectSaveOverwrite(\'' + q.id + '\', this)">' +
                        '<div class="fw-bold">' + (q.client_name || 'Unnamed') + '</div>' +
                        '<div class="text-muted small">' + date + ' &middot; ' + total + '</div>' +
                        '</div>';
                }).join('');
            }
        }

        function selectSaveOverwrite(id, el) {
            _selectedOverwriteId = id;
            document.querySelectorAll('.save-quote-item').forEach(function(e) {
                e.style.background = '';
                e.style.borderColor = '#dee2e6';
            });
            el.style.background = '#e8f0fe';
            el.style.borderColor = '#1a56a0';
            var owBtn = document.getElementById('overwriteBtn');
            if (owBtn) owBtn.disabled = false;
        }

        async function confirmSaveAsNew() {
            if (!_saveDialogData) return;
            var nameInput = document.getElementById('saveQuoteNameInput');
            if (nameInput && nameInput.value.trim()) _saveDialogData.quoteTitle = nameInput.value.trim();

            // Block save if quote number is already used
            var qNum = (document.getElementById('quoteNumber')?.value || '').trim();
            var usedNums = getUsedQuoteNumbers();
            if (qNum && usedNums.includes(qNum) && !window._supabaseQuoteId) {
                var errEl = document.getElementById('saveQuoteNumError');
                if (errEl) {
                    errEl.style.display = 'block';
                    errEl.textContent = '\u26a0\ufe0f Quote number "' + qNum + '" is already used. Change it before saving as new.';
                    setTimeout(function(){ errEl.style.display = 'none'; }, 5000);
                } else {
                    qdAlert('Quote number "' + qNum + '" is already used. Change the quote number before saving as new.');
                }
                return;
            }

            _saveDialogData.supabaseId = null; // Force new insert
            _saveDialogData.forceNew = true;
            window._supabaseQuoteId = null;
            localStorage.removeItem("ald_active_quote_id");
            var saveBtn = document.getElementById('saveAsNewBtn');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...'; }
            try {
                var result = await saveQuoteToSupabase(_saveDialogData);
                if (result && !result.error && result.data) {
                    var saved = Array.isArray(result.data) ? result.data[0] : result.data;
                    if (saved && saved.id) {
                        window._supabaseQuoteId = saved.id;
                        localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                    }
                }
                unsavedChanges = false;
                updateSaveStatus('saved', 'Saved to cloud ?');
                updateDraftWarning();
                bootstrap.Modal.getInstance(document.getElementById('saveQuoteModal')).hide();
                qdAfterManualQuoteSave();
                // Update visible fields if the save dialog changed the title/name.
                if (document.getElementById('quoteTitle')) document.getElementById('quoteTitle').value = _saveDialogData.quoteTitle || '';
                if (document.getElementById('clientName')) document.getElementById('clientName').value = _saveDialogData.clientName;
            } catch(e) {
                qdAlert('Save failed: ' + e.message);
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Save as New'; }
            }
        }

        async function confirmOverwrite() {
            if (!_saveDialogData || !_selectedOverwriteId) return;
            var nameInput = document.getElementById('saveQuoteNameInput');
            if (nameInput) _saveDialogData.quoteTitle = nameInput.value.trim();
            var selectedEl = document.querySelector('.save-quote-item[style*="background"]');
            var quoteName = selectedEl ? selectedEl.querySelector('.fw-bold')?.textContent : 'this quote';
            if (!await qdConfirm('Overwrite "' + quoteName + '"? This cannot be undone.', {
                title: 'Overwrite Quote',
                okText: 'Overwrite',
                okClass: 'btn-warning',
                type: 'warning'
            })) return;
            _saveDialogData.supabaseId = _selectedOverwriteId;
            window._supabaseQuoteId = _selectedOverwriteId;
            localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
            var owBtn = document.getElementById('overwriteBtn');
            if (owBtn) { owBtn.disabled = true; owBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...'; }
            try {
                var result = await saveQuoteToSupabase(_saveDialogData);
                unsavedChanges = false;
                updateSaveStatus('saved', 'Saved to cloud ?');
                updateDraftWarning();
                bootstrap.Modal.getInstance(document.getElementById('saveQuoteModal')).hide();
                qdAfterManualQuoteSave();
                if (document.getElementById('quoteTitle')) document.getElementById('quoteTitle').value = _saveDialogData.quoteTitle || '';
            } catch(e) {
                qdAlert('Save failed: ' + e.message);
            } finally {
                if (owBtn) { owBtn.disabled = false; owBtn.innerHTML = '<i class="fas fa-save me-1"></i>Overwrite'; }
            }
        }
        async function confirmSaveLocally() {
            bootstrap.Modal.getInstance(document.getElementById('saveQuoteModal')).hide();
            if (window.showSaveFilePicker) {
                // Desktop: use File System API
                try {
                    var client = (_saveDialogData && (_saveDialogData.quoteTitle || _saveDialogData.clientName)) || 'Quote';
                    var date = new Date().toISOString().slice(0, 10);
                    saveFileHandle = await window.showSaveFilePicker({
                        suggestedName: client + ' - ' + date + '.qdr',
                        types: [{ description: 'QuoteDr File', accept: { 'application/json': ['.qdr'] } }]
                    });
                    await writeToHandle(saveFileHandle);
                    updateSaveStatus('saved', 'Saved locally ?');
                    startAutoSave();
                } catch(err) {
                    if (err.name !== 'AbortError') downloadQuoteFallback();
                }
            } else {
                // Mobile: download as file
                downloadQuoteFallback();
            }
        }

        // -- End Save Dialog ------------------------------------------------------

        async function loadQuoteFromFile() {
            // Always show the cloud load modal first
            showLoadModal();
        }

        async function loadQuoteFromLocalFile() {
            if (unsavedChanges && !await qdConfirm('You have unsaved changes. Open a different quote anyway?', {
                title: 'Unsaved Changes',
                okText: 'Open Anyway',
                okClass: 'btn-warning',
                type: 'warning'
            })) return;
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'QuoteDr File', accept: { 'application/json': ['.qdr', '.aldquote'] } }]
                });
                const file = await handle.getFile();
                const data = JSON.parse(await file.text());
                saveFileHandle = handle;
                applyQuoteData(data);
                startAutoSave();
                updateSaveStatus('loaded', handle.name);
                var m = bootstrap.Modal.getInstance(document.getElementById('loadQuoteModal'));
                if (m) m.hide();
            } catch (err) {
                if (err.name !== 'AbortError') updateSaveStatus('error', 'Could not open file');
            }
        }

        async function showLoadModal() {
            if (unsavedChanges && !await qdConfirm('You have unsaved changes. Open a different quote anyway?', {
                title: 'Unsaved Changes',
                okText: 'Open Anyway',
                okClass: 'btn-warning',
                type: 'warning'
            })) return;

            // Build or show modal
            var modalEl = document.getElementById('loadQuoteModal');
            if (!modalEl) {
                modalEl = document.createElement('div');
                modalEl.className = 'modal fade';
                modalEl.id = 'loadQuoteModal';
                modalEl.tabIndex = -1;
                modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background:#1a56a0; color:white;">
                            <h5 class="modal-title"><i class="fas fa-folder-open me-2"></i>Open Quote</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="loadQuoteList" style="max-height:300px; overflow-y:auto;">
                                <div class="text-muted small text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Loading your quotes...</div>
                            </div>
                        </div>
                        <div class="modal-footer flex-wrap gap-2">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-outline-secondary" onclick="loadQuoteFromLocalFile()" id="openLocalFileBtn" style="display:none;"><i class="fas fa-folder me-1"></i>Open Local File</button>
                        </div>
                    </div>
                </div>`;
                document.body.appendChild(modalEl);
                // Show local file button only if File System API available
                if (window.showOpenFilePicker) {
                    modalEl.querySelector('#openLocalFileBtn').style.display = '';
                }
            }

            var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modal.show();

            // Fetch cloud quotes
            var listEl = document.getElementById('loadQuoteList');
            if (typeof listQuotesFromSupabase === 'function') {
                var result = await listQuotesFromSupabase();
                var quotes = quoteStorageActiveRows((result && result.data) ? result.data : []);
                if (!quotes.length) {
                    listEl.innerHTML = '<div class="text-muted small text-center py-3">No saved cloud quotes yet.<br>Save a quote first using the Save button.</div>';
                    return;
                }
                listEl.innerHTML = quotes.map(function(q) {
                    var data = quoteStorageData(q);
                    var quoteTitle = String(data.quoteTitle || data.invoiceTitle || data.title || '').trim();
                    var clientName = quoteStorageClientName(q);
                    var displayTitle = quoteStorageDisplayTitle(q);
                    var quoteNumber = quoteStorageQuoteNumber(q);
                    var dateValue = data.savedAt || q.updated_at || q.created_at;
                    var date = dateValue ? new Date(dateValue).toLocaleDateString() : '';
                    var totalValue = parseFloat(q.total || data.grandTotal || data.total || 0) || 0;
                    var total = '$' + totalValue.toFixed(2);
                    var details = [];
                    if (quoteTitle && clientName) details.push(clientName);
                    if (quoteNumber) details.push('#' + quoteNumber);
                    if (date) details.push(date);
                    details.push(total);
                    return '<div class="p-2 mb-1 rounded" style="border:1px solid #dee2e6; cursor:pointer;" ' +
                        'onclick="loadCloudQuote(' + quoteStorageJsAttr(q.id) + ')" ' +
                        'onmouseover="this.style.background=\'#e8f0fe\'" onmouseout="this.style.background=\'\'">' +
                        '<div class="fw-bold">' + quoteStorageEscapeHtml(displayTitle) + '</div>' +
                        '<div class="text-muted small">' + details.map(quoteStorageEscapeHtml).join(' &middot; ') + '</div>' +
                        '</div>';
                }).join('');
            }
        }

        async function loadCloudQuote(quoteId) {
            var listEl = document.getElementById('loadQuoteList');
            if (listEl) listEl.innerHTML = '<div class="text-muted small text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Loading quote...</div>';
            try {
                var result = await loadQuoteFromSupabase(quoteId);
                if (result.error) throw new Error(result.error.message || result.error);
                var q = result.data;
                if (quoteIsPortalLockedForBuilder(q)) {
                    await handlePortalLockedBuilderLoad(q);
                    return;
                }
                var qData = q.data || {};
                qData.supabaseId = q.id;
                qData.clientName = q.client_name || qData.clientName || '';
                qData.quoteNumber = q.quote_number || qData.quoteNumber || '';
                qData.grandTotal = q.total || 0;
                window._supabaseQuoteId = q.id;
                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                applyQuoteData(qData);
                window._loadedQuoteData = qData;
                unsavedChanges = false;
                clearTimeout(_autoSaveTimer);
                updateSaveStatus('saved', 'Quote loaded ?');
                updateDraftWarning();
                var m = bootstrap.Modal.getInstance(document.getElementById('loadQuoteModal'));
                if (m) m.hide();
                // Show client feedback banner if opened from notes review
                if (new URLSearchParams(window.location.search).get('shownotes') === '1') {
                    setTimeout(function() { showClientNotesBanner(window._loadedQuoteData || {}); }, 1200);
                }
            } catch(e) {
                if (listEl) listEl.innerHTML = '<div class="alert alert-danger small py-2">Failed to load: ' + e.message + '</div>';
            }
        }

        function saveSessionQuote() {
            try {
                localStorage.setItem('ald_session_quote', JSON.stringify(collectQuoteData()));
            } catch(e) {}
        }

        function startAutoSave() {
            // No-op: auto-save is handled by markUnsaved() debounce
        }

        function updateDraftWarning() {
            var banner = document.getElementById('draftWarningBanner');
            if (!banner) return;
            // Hide if we have a local file handle OR a cloud save ID
            banner.style.display = (saveFileHandle || window._supabaseQuoteId) ? 'none' : 'block';
        }

        async function doAutoSave() {
            if (!unsavedChanges) return;
            var t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var el = document.getElementById('saveStatus');
            // Always save to localStorage as backup
            try {
                localStorage.setItem('ald_autosave_draft', JSON.stringify(collectQuoteData()));
                localStorage.setItem('ald_session_quote', JSON.stringify(collectQuoteData()));
            } catch(e) {}
            // Also write to file if we have a handle
            if (saveFileHandle) {
                try {
                    await writeToHandle(saveFileHandle);
                } catch(e) {
                    if (el) el.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> Auto-save failed</span>';
                }
            }
            // Cloud save to Supabase - always runs regardless of file handle
            if (typeof saveQuoteToSupabase === 'function') {
                var qData = collectQuoteData();
                if (quoteDataIsPortalLockedForBuilder(qData)) {
                    console.warn('[AutoSave] Skipping cloud save - this quote is locked in a client portal');
                    return;
                }
                // SAFETY GUARD: never overwrite cloud data with empty rooms unless we know the quote is intentionally empty
                // _quoteFullyLoaded is set true only after a successful Supabase load
                if (!window._quoteFullyLoaded && (!qData.rooms || qData.rooms.length === 0)) {
                    console.warn('[AutoSave] Skipping cloud save - rooms empty and quote not confirmed loaded from cloud');
                    return;
                }
                saveQuoteToSupabase(qData).then(function(result) {
                    if (result && result.data) {
                        // result.data may be an array (insert) or object (update)
                        var saved = Array.isArray(result.data) ? result.data[0] : result.data;
                        if (saved && saved.id) {
                            window._supabaseQuoteId = saved.id;
                            localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                        }
                    }
                }).catch(function(){});
            }
            unsavedChanges = false;
            if (el) {
                if (saveFileHandle) {
                    el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> File saved at ' + t + '</span>';
                } else if (window._supabaseQuoteId) {
                    el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-cloud"></i> Cloud saved at ' + t + '</span>';
                } else {
                    el.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-exclamation-triangle"></i> Draft saved locally at ' + t + '</span>';
                }
            }
            updateDraftWarning();
        }

        function downloadQuoteFallback() {
            const blob = new Blob([JSON.stringify(collectQuoteData(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const client = document.getElementById('quoteTitle')?.value.trim() || document.getElementById('clientName')?.value.trim() || 'Quote';
            a.href = url;
            a.download = client + ' - ' + new Date().toISOString().slice(0, 10) + '.qdr';
            a.click();
            URL.revokeObjectURL(url);
            updateSaveStatus('saved');
        }

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveQuote();
            }
        });

        document.addEventListener('DOMContentLoaded', async function() {
            // Auth check - redirect to login if not signed in
            const { data: { session } } = await _supabase.auth.getSession();
            if (!session) { window.location.href = 'login.html'; return; }
            window.currentUser = session.user;

            // Subscription status check - show banner if billing needs attention
            if (typeof refreshSubscriptionBanner === 'function') refreshSubscriptionBanner();

            // Load user's uploaded logo from onboarding/settings
            var savedLogo = localStorage.getItem('ald_company_logo') || localStorage.getItem('ald_logo');
            if (savedLogo) {
                var logoImg = document.getElementById('userLogoImg');
                if (logoImg) { logoImg.src = savedLogo; logoImg.style.display = 'block'; }
            }

            // Load logo from Supabase if available
            if (typeof loadLogoFromSupabase === 'function') {
                try {
                    const logoUrl = await loadLogoFromSupabase();
                    if (logoUrl) {
                        var logoImg = document.getElementById('userLogoImg');
                        if (logoImg) { logoImg.src = logoUrl; logoImg.style.display = 'block'; }
                    }
                } catch (e) {
                    console.warn('Failed to load logo from Supabase:', e);
                }
            }

            // Load business profile from Supabase
            if (typeof loadBusinessProfile === 'function') {
                try {
                    const profile = await loadBusinessProfile();
                    if (profile) {
                        localStorage.setItem('ald_business_profile', JSON.stringify(profile));
                    }
                } catch (e) {
                    console.warn('Failed to load business profile from Supabase:', e);
                }
            }

            // (delegated listeners moved to standalone script block to guarantee they attach)

            // Check for ?load=ID in URL - load quote from Supabase
            const urlParams = new URLSearchParams(window.location.search);
            const loadId = urlParams.get('load');
            if (loadId && typeof loadQuoteFromSupabase === 'function') {
                try {
                    const { data, error } = await loadQuoteFromSupabase(loadId);
                    if (error) {
                        console.warn('Could not load quote from cloud:', error.message);
                    } else if (data) {
                        const q = data;
                        if (quoteIsPortalLockedForBuilder(q)) {
                            await handlePortalLockedBuilderLoad(q);
                            return;
                        }
                        const qData = Object.assign({}, data.data || {});
                        qData.supabaseId = data.id;
                        qData.clientName = data.client_name || qData.clientName || '';
                        qData.quoteNumber = data.quote_number || qData.quoteNumber || '';
                        qData.status = data.status || qData.status || 'draft';
                        qData.type = data.type || qData.type || qData.documentType || 'quote';
                        qData.documentType = qData.type;
                        qData.parentQuoteId = data.parent_quote_id || qData.parentQuoteId || '';
                        qData.changeOrderNumber = data.change_order_number || qData.changeOrderNumber || null;
                        if (!qData.projectAddress) qData.projectAddress = qData.project_address || '';
                        if (!qData.clientEmail) qData.clientEmail = qData.email || '';
                        if (!qData.clientPhone) qData.clientPhone = qData.phone || '';
                        window._supabaseQuoteId = data.id;
                        localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                        applyQuoteData(qData);
                        unsavedChanges = false;
                        window._quoteFullyLoaded = true; // allow autosave now
                        updateSaveStatus('saved', 'Quote loaded ?');
                        updateDraftWarning();
                        if (window.location.hash === "#change-order" && typeof createChangeOrderFromCurrentQuote === "function") {
                            setTimeout(function() {
                                if (window.location.hash === "#change-order") {
                                    createChangeOrderFromCurrentQuote();
                                    history.replaceState(null, "", window.location.pathname + window.location.search);
                                }
                            }, 0);
                        }
                        // Show client notes banner if ?shownotes=1
                        if (urlParams.get('shownotes') === '1') {
                            window._loadedQuoteData = qData;
                            showClientNotesBanner(qData);
                        }
                    }
                } catch(e) {
                    console.warn('Error loading quote from cloud:', e);
                }
            }
        });
        // -- End Save / Load ------------------------------------------------------

        function startupContinueSession() {
            var session = null;
            try { session = JSON.parse(localStorage.getItem('ald_session_quote')); } catch(e) {}
            if (!session) {
                // No saved session - just start fresh, no alert needed
                updateDraftWarning();
                return;
            }
            if (quoteDataIsPortalLockedForBuilder(session)) {
                localStorage.removeItem('ald_session_quote');
                updateDraftWarning();
                if (typeof qdAlert === 'function') {
                    qdAlert('The last opened document is already in a client portal, so it was not restored for editing. Remove it from the portal in the dashboard before editing.', {
                        title: 'Portal Document Locked',
                        type: 'warning'
                    });
                }
                return;
            }
            // Hide startup modal if it's open
            var sm = document.getElementById('startupModal');
            if (sm) { var mi = bootstrap.Modal.getInstance(sm); if (mi) mi.hide(); }
            cleanupModalBackdrop();
            applyQuoteData(session);
            if (session.quoteNumber) document.getElementById('quoteNumber').value = session.quoteNumber;
            renderTermsCheckboxes();
            if (session.terms && Array.isArray(session.terms)) {
                document.querySelectorAll('#termsCheckboxes input[type="checkbox"]').forEach(function(cb) {
                    cb.checked = session.terms.includes(cb.dataset.text);
                });
            }
            // Cancel any autosave triggered during restore - we just loaded, nothing is actually unsaved
            unsavedChanges = false;
            clearTimeout(_autoSaveTimer);
            var el = document.getElementById('saveStatus');
            if (window._supabaseQuoteId) {
                if (el) el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-cloud"></i> Restored - ' + (session.clientName || 'quote') + '</span>';
            } else {
                if (el) el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-history"></i> Session restored</span>';
            }
            updateDraftWarning();
        }

        function startupNewQuote() {
            localStorage.removeItem("ald_active_quote_id");
            window._supabaseQuoteId = null;
            localStorage.removeItem('ald_session_quote');
            var modal = bootstrap.Modal.getInstance(document.getElementById('startupModal'));
            if (modal) modal.hide();
            cleanupModalBackdrop();
            // Ensure quote number is set
            if (!document.getElementById('quoteNumber').value) {
                document.getElementById('quoteNumber').value = nextQuoteNumberValue();
            }
            // On mobile (no File System API), skip the file picker - just start fresh
            if (window.showSaveFilePicker) {
                setTimeout(async function() {
                    try {
                        saveFileHandle = await window.showSaveFilePicker({
                            suggestedName: 'New Quote - ' + new Date().toISOString().slice(0,10) + '.qdr',
                            types: [{ description: 'QuoteDr File', accept: { 'application/json': ['.qdr'] } }]
                        });
                        await writeToHandle(saveFileHandle);
                        startAutoSave();
                    } catch(err) {
                        if (err.name !== 'AbortError') console.warn('Save skipped:', err);
                    }
                }, 400);
            }
            updateDraftWarning();
        }

        function startupRecoverDraft() {
            try {
                var draft = JSON.parse(localStorage.getItem('ald_autosave_draft'));
                if (!draft) { qdAlert('No draft found.'); return; }
                bootstrap.Modal.getInstance(document.getElementById('startupModal')).hide(); cleanupModalBackdrop();
                applyQuoteData(draft);
                if (draft.quoteNumber) document.getElementById('quoteNumber').value = draft.quoteNumber;
                renderTermsCheckboxes();
                if (draft.terms && Array.isArray(draft.terms)) {
                    document.querySelectorAll('#termsCheckboxes input[type="checkbox"]').forEach(function(cb) {
                        cb.checked = draft.terms.includes(cb.dataset.text);
                    });
                }
                var el = document.getElementById('saveStatus');
                if (el) el.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-history"></i> Draft recovered - save to file to keep it safe</span>';
                updateDraftWarning();
            } catch(e) { qdAlert('Could not recover draft.'); }
        }

        async function startupOpenQuote() {
            // Hide modal and clean up backdrop FIRST before any async work
            var modal = bootstrap.Modal.getInstance(document.getElementById('startupModal'));
            if (modal) modal.hide();
            cleanupModalBackdrop();

            // On mobile: use simple file input (no File System API)
            if (!window.showOpenFilePicker) {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = '.qdr,.aldquote,application/json';
                input.onchange = function(e) {
                    var f = e.target.files[0];
                    if (!f) return;
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        try {
                            var d = JSON.parse(ev.target.result);
                            applyQuoteData(d);
                            if (d.supabaseId) {
                                window._supabaseQuoteId = d.supabaseId;
                                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                            }
                            if (d.quoteNumber) document.getElementById('quoteNumber').value = d.quoteNumber;
                            updateSaveStatus('loaded', f.name);
                        } catch(e) { qdAlert('Could not read file.'); }
                    };
                    reader.readAsText(f);
                };
                // Small delay so backdrop is fully removed before input click
                setTimeout(function() { input.click(); }, 400);
                return;
            }

            // Desktop: use File System API
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'QuoteDr File', accept: { 'application/json': ['.qdr', '.aldquote'] } }]
                });
                const file = await handle.getFile();
                const data = JSON.parse(await file.text());
                saveFileHandle = handle;
                applyQuoteData(data);
                if (data.supabaseId) {
                    window._supabaseQuoteId = data.supabaseId;
                    localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                }
                if (data.quoteNumber) document.getElementById('quoteNumber').value = data.quoteNumber;
                updateSaveStatus('loaded', file.name);
                startAutoSave();
            } catch (err) {
                if (err.name !== 'AbortError') console.warn('File open error:', err);
                // Always ensure backdrop is cleaned up
                cleanupModalBackdrop();
            }
        }

        // Runs on load - independent of auth. Handles session restore + startup modal.
        // Global safety net: always clean up backdrop when any modal hides
        document.addEventListener('hidden.bs.modal', function() {
            cleanupModalBackdrop();
        });
        // Hide mobile action bar when quote total is visible on screen
        var _grandTotalEl = document.querySelector('.grand-total');
        if (_grandTotalEl && window.IntersectionObserver) {
            var _totalObserver = new IntersectionObserver(function(entries) {
                var mob = document.getElementById('mobileActionBar');
                if (!mob) return;
                if (entries[0].isIntersecting) {
                    mob.style.setProperty('display', 'none', 'important');
                } else {
                    if (!document.querySelector('.modal.show')) {
                        mob.style.setProperty('display', 'flex', 'important');
                    }
                }
            }, { threshold: 0.1 });
            _totalObserver.observe(_grandTotalEl);
        }

        // Hide/show sticky toolbar, total bar AND mobile action bar when modals open/close
        document.addEventListener('show.bs.modal', function() {
            var tb = document.getElementById('stickyToolbar');
            if (tb) tb.style.setProperty('display', 'none', 'important');
            var bar = document.getElementById('stickyTotalBar');
            if (bar) bar.style.setProperty('display', 'none', 'important');
            var mob = document.getElementById('mobileActionBar');
            if (mob) mob.style.setProperty('display', 'none', 'important');
        });
        document.addEventListener('hidden.bs.modal', function() {
            // Only show if no other modals are open
            if (!document.querySelector('.modal.show')) {
                var tb = document.getElementById('stickyToolbar');
                if (tb) tb.style.removeProperty('display');
                var bar = document.getElementById('stickyTotalBar');
                if (bar && stickyTotalVisible) bar.style.removeProperty('display');
                var mob = document.getElementById('mobileActionBar');
                if (mob) mob.style.setProperty('display', 'flex', 'important');
            }
        });

        window.addEventListener('load', function() {
            var _startupAttempts = 0;
            function tryStartup() {
                _startupAttempts++;
                // Wait for Bootstrap + initDone, but give up after 3 seconds and show modal anyway
                if (typeof bootstrap === 'undefined' || (typeof initDone === 'undefined' || !initDone) && _startupAttempts < 38) {
                    setTimeout(tryStartup, 80);
                    return;
                }

                // NOTE: loadItemsFromSupabase (items table) disabled - conflicts with snapshot backup system
                // Items are managed via backupItemsToCloud/restoreItemsFromCloud (quotes table snapshot)
                if (typeof loadClientsFromSupabase === 'function') {
                    loadClientsFromSupabase().then(function(result) {
                        if (result.data && result.data.length > 0) {
                            // Merge Supabase clients with localStorage (object keyed by name)
                            var existing = {};
                            try { existing = JSON.parse(localStorage.getItem('ald_clients') || '{}'); } catch(e) { existing = {}; }
                            // Fix if corrupted to array
                            if (Array.isArray(existing)) {
                                var obj = {};
                                existing.forEach(function(c) { if (c && c.name) obj[c.name] = c; });
                                existing = obj;
                            }
                            result.data.forEach(function(sc) {
                                if (sc.name && !existing[sc.name]) {
                                    existing[sc.name] = { name: sc.name, phone: sc.phone || '', email: sc.email || '', address: sc.address || '', city: sc.city || '', notes: sc.notes || '', crm: sc.crm || {} };
                                }
                            });
                            localStorage.setItem('ald_clients', JSON.stringify(existing));
                            loadSavedClients(); // refresh in-memory client list
                        }
                    }).catch(function(e){ console.warn('Client load error:', e); });
                }

                // Check if opening a specific cloud quote from dashboard
                var cloudQuoteId = localStorage.getItem('ald_open_cloud_quote');
                if (cloudQuoteId) {
                    localStorage.removeItem('ald_open_cloud_quote');
                    if (typeof loadQuoteFromSupabase === 'function') {
                        loadQuoteFromSupabase(cloudQuoteId).then(async function(result) {
                            if (result && result.data && result.data.data) {
                                if (quoteIsPortalLockedForBuilder(result.data)) {
                                    await handlePortalLockedBuilderLoad(result.data);
                                    return;
                                }
                                var qData = result.data.data;
                                qData.supabaseId = result.data.id;
                                window._supabaseQuoteId = result.data.id;
                                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                                applyQuoteData(qData);
                                if (qData.quoteNumber) document.getElementById('quoteNumber').value = qData.quoteNumber;
                                renderTermsCheckboxes();
                                if (qData.terms && Array.isArray(qData.terms)) {
                                    document.querySelectorAll('#termsCheckboxes input[type="checkbox"]').forEach(function(cb) {
                                        cb.checked = qData.terms.includes(cb.dataset.text);
                                    });
                                }
                                var el = document.getElementById('saveStatus');
                                if (el) el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-cloud"></i> Loaded from cloud</span>';
                                updateDraftWarning();
                            }
                        }).catch(function(e) { console.warn('Failed to load cloud quote:', e); });
                        return; // Don't show modal while loading
                    }
                }

                // Show Continue button if session exists
                var session = null;
                try { session = JSON.parse(localStorage.getItem('ald_session_quote')); } catch(e) {}
                var hasSession = !!(session && (session.clientName || (session.rooms && session.rooms.length > 0)));
                var continueBtn = document.getElementById('continueSessionBtn');
                if (continueBtn) continueBtn.style.display = hasSession ? 'inline-block' : 'none';
                // Show Recover Draft button if draft exists
                var recoverBtn = document.getElementById('recoverDraftBtn');
                if (recoverBtn) recoverBtn.style.display = localStorage.getItem('ald_autosave_draft') ? 'inline-block' : 'none';
                // Startup modal disabled - using draft warning banner instead
                // Skip session restore if loading a specific quote from URL
                var _urlp = new URLSearchParams(window.location.search);
                if (_urlp.get('new') === '1') {
                    clearPortalLockedBuilderRestoreState();
                    localStorage.removeItem('ald_session_quote');
                    window._quoteFullyLoaded = true;
                    if (!document.getElementById('quoteNumber').value) {
                        document.getElementById('quoteNumber').value = nextQuoteNumberValue();
                    }
                    updateDraftWarning();
                } else if (!_urlp.get('load') && !_urlp.get('shownotes')) {
                    var _savedActiveId = localStorage.getItem("ald_active_quote_id");
                    if (_savedActiveId && typeof loadQuoteFromSupabase === "function") {
                        // Reload the last opened quote from Supabase directly
                        window._supabaseQuoteId = _savedActiveId;
                        loadQuoteFromSupabase(_savedActiveId).then(async function(result) {
                            if (result && result.data && result.data.data) {
                                if (quoteIsPortalLockedForBuilder(result.data)) {
                                    await handlePortalLockedBuilderLoad(result.data);
                                    return;
                                }
                                var qData = result.data.data;
                                qData.supabaseId = result.data.id;
                                // Map fields - client_name lives at row level, rest in data JSON
                                var row = result.data;
                                qData.clientName = row.client_name || qData.clientName || '';
                                qData.quoteNumber = row.quote_number || qData.quoteNumber || '';
                                if (!qData.projectAddress) qData.projectAddress = qData.project_address || '';
                                if (!qData.clientEmail) qData.clientEmail = qData.email || '';
                                if (!qData.clientPhone) qData.clientPhone = qData.phone || '';
                                window._supabaseQuoteId = result.data.id;
                                localStorage.setItem("ald_active_quote_id", result.data.id);
                                applyQuoteData(qData);
                                if (qData.quoteNumber) document.getElementById("quoteNumber").value = qData.quoteNumber || "";
                                renderTermsCheckboxes();
                                if (qData.terms && Array.isArray(qData.terms)) {
                                    document.querySelectorAll("#termsCheckboxes input[type=checkbox]").forEach(function(cb) {
                                        cb.checked = qData.terms.includes(cb.dataset.text);
                                    });
                                }
                                unsavedChanges = false;
                                clearTimeout(_autoSaveTimer);
                                var el = document.getElementById("saveStatus");
                                if (el) el.innerHTML = "<span style=\"color:#28a745;\"><i class=\"fas fa-cloud\"></i> Restored - " + (qData.clientName || "quote") + "</span>";
                                updateDraftWarning();
                            } else {
                                // Quote not found - fall back to session restore
                                localStorage.removeItem("ald_active_quote_id");
                                startupContinueSession();
                            }
                        }).catch(function() {
                            startupContinueSession();
                        });
                    } else {
                        startupContinueSession();
                    }
                }
            }
            tryStartup();
            // Auto-open builder modals when navigated from settings.
            function openBuilderHashTarget(attempt) {
                attempt = attempt || 0;
                if (window.location.hash === "#manage-items" && typeof openManageItemsModal === "function") {
                    openManageItemsModal();
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                    return;
                }
                if (window.location.hash === "#send-quote-settings" && typeof openQuoteSendSettingsModal === "function") {
                    openQuoteSendSettingsModal(true);
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                    return;
                }
                var isLoadingSpecificQuote = new URLSearchParams(window.location.search).get("load");
                if (window.location.hash === "#change-order" && isLoadingSpecificQuote && !window._quoteFullyLoaded && attempt < 25) {
                    setTimeout(function() { openBuilderHashTarget(attempt + 1); }, 250);
                    return;
                }
                if (window.location.hash === "#change-order" && typeof createChangeOrderFromCurrentQuote === "function" && window._supabaseQuoteId) {
                    createChangeOrderFromCurrentQuote();
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                    return;
                }
                if ((window.location.hash === "#manage-items" || window.location.hash === "#send-quote-settings" || window.location.hash === "#change-order") && attempt < 25) {
                    setTimeout(function() { openBuilderHashTarget(attempt + 1); }, 250);
                }
            }
            openBuilderHashTarget();
        });
