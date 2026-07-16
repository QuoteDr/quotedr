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
        var quoteStorageInstanceId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : 'quote-tab-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        var quoteStorageTabChannel = null;
        var quoteStorageRealtimeChannel = null;
        var quoteStorageRealtimeQuoteId = '';
        var quoteStorageRemoteUpdate = null;
        var quoteStorageRemotePromptOpen = false;
        var quoteStorageRemoteConflictPromise = null;

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

        function quoteBuilderIsStartingChangeOrder() {
            return window.location.hash === "#change-order";
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

        function cloneQuoteStorageValue(value) {
            try {
                return JSON.parse(JSON.stringify(value || null));
            } catch(e) {
                return value || null;
            }
        }

        function getQuoteStorageCustomItems() {
            try {
                if (typeof customItems === 'object' && customItems) return customItems;
            } catch(e) {}
            try {
                return JSON.parse(localStorage.getItem('ald_custom_items') || '{}');
            } catch(e) {
                return {};
            }
        }

        function quoteStorageSavedItemUpgradeGroups(saved) {
            if (!saved) return [];
            if (typeof normalizeQuoteItemUpgradeGroups === 'function') {
                return normalizeQuoteItemUpgradeGroups(saved);
            }
            return Array.isArray(saved.upgradeGroups) ? cloneQuoteStorageValue(saved.upgradeGroups) : [];
        }

        function quoteStorageUpgradeRuntimeTextKey(value) {
            return String(value || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ');
        }

        function findQuoteStorageUpgradeRuntimeGroup(groups, targetGroup) {
            groups = Array.isArray(groups) ? groups : [];
            targetGroup = targetGroup || {};
            var exact = targetGroup.id ? groups.find(function(group) {
                return group && group.id === targetGroup.id;
            }) : null;
            if (exact) return exact;
            var targetName = quoteStorageUpgradeRuntimeTextKey(targetGroup.name);
            return targetName ? groups.find(function(group) {
                return quoteStorageUpgradeRuntimeTextKey(group && group.name) === targetName;
            }) : null;
        }

        function findQuoteStorageUpgradeRuntimeOption(group, targetOption) {
            var options = group && Array.isArray(group.options) ? group.options : [];
            targetOption = targetOption || {};
            var exact = targetOption.id ? options.find(function(option) {
                return option && option.id === targetOption.id;
            }) : null;
            if (exact) return exact;
            var targetName = quoteStorageUpgradeRuntimeTextKey(targetOption.name || targetOption.sourceItemName || targetOption.description);
            var targetUnit = quoteStorageUpgradeRuntimeTextKey(targetOption.unitType || targetOption.unit);
            return targetName ? options.find(function(option) {
                var optionName = quoteStorageUpgradeRuntimeTextKey(option && (option.name || option.sourceItemName || option.description));
                var optionUnit = quoteStorageUpgradeRuntimeTextKey(option && (option.unitType || option.unit));
                return optionName === targetName && (!targetUnit || !optionUnit || optionUnit === targetUnit);
            }) : null;
        }

        function mergeQuoteStorageUpgradeGroupRuntimeState(targetGroups, previousGroups) {
            targetGroups = Array.isArray(targetGroups) ? cloneQuoteStorageValue(targetGroups) : [];
            previousGroups = Array.isArray(previousGroups) ? cloneQuoteStorageValue(previousGroups) : [];
            if (typeof normalizeQuoteItemUpgradeGroups === 'function') {
                targetGroups = normalizeQuoteItemUpgradeGroups({ upgradeGroups: targetGroups });
                previousGroups = normalizeQuoteItemUpgradeGroups({ upgradeGroups: previousGroups });
            }
            targetGroups.forEach(function(group) {
                if (!group) return;
                var previousGroup = findQuoteStorageUpgradeRuntimeGroup(previousGroups, group);
                if (!previousGroup) return;
                var previousSelectedIds = Array.isArray(previousGroup.selectedOptionIds) ? previousGroup.selectedOptionIds : [];
                var nextSelectedIds = [];
                (group.options || []).forEach(function(option) {
                    if (!option) return;
                    var previousOption = findQuoteStorageUpgradeRuntimeOption(previousGroup, option);
                    if (!previousOption) return;
                    option.manualQuantity = parseFloat(previousOption.manualQuantity || 0) || 0;
                    if (previousSelectedIds.indexOf(previousOption.id) !== -1) nextSelectedIds.push(option.id);
                });
                group.selectedOptionIds = group.type === 'multiple' ? nextSelectedIds : nextSelectedIds.slice(0, 1);
            });
            return targetGroups;
        }

        function findSavedItemForChoiceOption(option, fallbackCategory) {
            if (!option) return null;
            var optionName = qdQuoteStorageTextKey(option.sourceItemName || option.name || option.description || option.serviceName || '');
            var optionCategory = option.category || fallbackCategory || '';
            if (!optionName) return null;
            var sources = [getQuoteStorageCustomItems()];
            try {
                if (typeof pricingDatabase === 'object' && pricingDatabase && sources.indexOf(pricingDatabase) === -1) sources.push(pricingDatabase);
            } catch(e) {}
            for (var s = 0; s < sources.length; s++) {
                var source = sources[s] || {};
                var preferredCategories = optionCategory && Array.isArray(source[optionCategory]) ? [optionCategory] : [];
                var fallbackCategories = Object.keys(source || {}).filter(function(category) {
                    return category.indexOf('__') !== 0 && Array.isArray(source[category]) && preferredCategories.indexOf(category) === -1;
                });
                var categories = preferredCategories.concat(fallbackCategories);
                for (var c = 0; c < categories.length; c++) {
                    var items = Array.isArray(source[categories[c]]) ? source[categories[c]] : [];
                    for (var i = 0; i < items.length; i++) {
                        var saved = items[i] || {};
                        var savedName = qdQuoteStorageTextKey(saved.name || saved.description || saved.serviceName || '');
                        if (savedName && savedName === optionName) return saved;
                    }
                }
            }
            return null;
        }

        function hydrateChoiceGroupOptionsForSave(item) {
            if (!item || !item.choiceGroup || !Array.isArray(item.choiceGroup.options)) return;
            var selectedChoiceOptionIds = Array.isArray(item.choiceGroup.selectedOptionIds) ? item.choiceGroup.selectedOptionIds.filter(Boolean) : [];
            if (!selectedChoiceOptionIds.length && item.choiceGroup.type === 'single' && item.choiceGroup.defaultOptionId) {
                selectedChoiceOptionIds = [item.choiceGroup.defaultOptionId];
            }
            var liveUpgradeGroups = Array.isArray(item.upgradeGroups) ? cloneQuoteStorageValue(item.upgradeGroups) : [];
            item.choiceGroup.options.forEach(function(option) {
                if (!option) return;
                var saved = findSavedItemForChoiceOption(option, item.category);
                if (saved && saved.upgrade && saved.upgrade.name && !(option.upgrade && option.upgrade.name)) {
                    option.upgrade = cloneQuoteStorageValue(saved.upgrade);
                }
                if (saved && saved.photo && !option.photo) {
                    option.photo = saved.photo;
                }
                var savedUpgradeGroups = quoteStorageSavedItemUpgradeGroups(saved);
                var optionRuntimeGroups = Array.isArray(option.upgradeGroups) ? option.upgradeGroups : [];
                var mergedUpgradeGroups = savedUpgradeGroups.length
                    ? mergeQuoteStorageUpgradeGroupRuntimeState(savedUpgradeGroups, optionRuntimeGroups)
                    : cloneQuoteStorageValue(optionRuntimeGroups);
                if (selectedChoiceOptionIds.indexOf(option.id) !== -1 && liveUpgradeGroups.length) {
                    mergedUpgradeGroups = mergeQuoteStorageUpgradeGroupRuntimeState(mergedUpgradeGroups, liveUpgradeGroups);
                }
                if (mergedUpgradeGroups.length) option.upgradeGroups = mergedUpgradeGroups;
            });
        }

        function sanitizeQuoteRoomsForSave(sourceRooms) {
            var clonedRooms = JSON.parse(JSON.stringify(sourceRooms || []));
            clonedRooms.forEach(function(room) {
                (room.items || []).forEach(function(item) {
                    hydrateChoiceGroupOptionsForSave(item);
                    var note = String(item && item.notes || '').trim();
                    var description = String(item && item.itemDescription || '').trim();
                    if (note && description && qdQuoteStorageTextKey(note) === qdQuoteStorageTextKey(description)) {
                        item.notes = '';
                    }
                });
            });
            return clonedRooms;
        }

        function getQuoteCategoryStylesSnapshot() {
            var snapshot = {};
            try {
                var savedStyles = JSON.parse(localStorage.getItem('ald_category_styles') || '{}');
                if (savedStyles && typeof savedStyles === 'object' && !Array.isArray(savedStyles)) {
                    Object.assign(snapshot, savedStyles);
                }
            } catch (e) {}
            if (typeof categoryStyles !== 'undefined' && categoryStyles && typeof categoryStyles === 'object') {
                Object.assign(snapshot, categoryStyles);
            }
            return JSON.parse(JSON.stringify(snapshot));
        }

        function quoteStorageEditTime(data, fallback) {
            data = data && typeof data === 'object' ? data : {};
            var saveMeta = data._saveMeta || {};
            var parsed = Date.parse(String(
                data._clientEditedAt ||
                saveMeta.clientEditedAt ||
                saveMeta.localSavedAt ||
                data.savedAt ||
                fallback || ''
            ));
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function quoteStorageCloudRowData(row) {
            var data = Object.assign({}, row && row.data || {});
            data.supabaseId = row && row.id || data.supabaseId || null;
            data._serverUpdatedAt = row && row.updated_at || data._serverUpdatedAt || null;
            data.clientName = row && row.client_name || data.clientName || '';
            data.quoteNumber = row && row.quote_number || data.quoteNumber || '';
            data.status = row && row.status || data.status || 'draft';
            data.type = row && row.type || data.type || data.documentType || 'quote';
            data.documentType = data.type;
            data.parentQuoteId = row && row.parent_quote_id || data.parentQuoteId || '';
            data.changeOrderNumber = row && row.change_order_number || data.changeOrderNumber || null;
            if (data.grandTotal === undefined || data.grandTotal === null) data.grandTotal = row && row.total || 0;
            if (!data.projectAddress) data.projectAddress = data.project_address || '';
            if (!data.clientEmail) data.clientEmail = data.email || '';
            if (!data.clientPhone) data.clientPhone = data.phone || '';
            if (!data.paymentsReceived && !data.paymentReceived && row && row.total !== undefined && row.total !== null) {
                data._paymentBalanceDueFallback = row.total;
            }
            return data;
        }

        function quoteStorageOperationMatchesRow(operation, row, cloudData) {
            if (!operation || operation.entityType !== 'quote' || operation.action === 'delete') return false;
            var rowId = String(row && row.id || '');
            var payload = operation.payload || {};
            if (rowId && (String(operation.entityId || '') === rowId || String(payload.supabaseId || '') === rowId)) return true;
            var quoteNumber = String(cloudData && cloudData.quoteNumber || row && row.quote_number || '');
            return !!quoteNumber && (
                String(payload.quoteNumber || '') === quoteNumber ||
                String(operation.entityId || '') === 'quote-number:' + quoteNumber
            );
        }

        async function quoteStorageResolveCloudRow(row) {
            var cloudData = quoteStorageCloudRowData(row);
            var best = { data: cloudData, source: 'cloud', time: quoteStorageEditTime(cloudData, row && row.updated_at) };
            var rowId = String(row && row.id || '');

            if (rowId && window.QuoteDrSave && typeof window.QuoteDrSave.getSnapshot === 'function') {
                try {
                    var snapshot = await window.QuoteDrSave.getSnapshot('quote', rowId);
                    if (snapshot && (snapshot.state === 'local_pending' || snapshot.state === 'conflict') && snapshot.payload) {
                        var snapshotTime = quoteStorageEditTime(snapshot.payload, snapshot.clientEditedAt || snapshot.localSavedAt);
                        if (snapshotTime > best.time) best = { data: Object.assign({}, snapshot.payload), source: 'snapshot', time: snapshotTime };
                    }
                } catch (e) {
                    console.warn('Could not inspect the local quote snapshot:', e);
                }
            }

            if (window.QuoteDrSave && typeof window.QuoteDrSave.getStatus === 'function') {
                try {
                    var saveStatus = await window.QuoteDrSave.getStatus();
                    (saveStatus.operations || []).forEach(function(operation) {
                        if (!quoteStorageOperationMatchesRow(operation, row, cloudData)) return;
                        var operationTime = quoteStorageEditTime(operation.payload, operation.clientEditedAt || operation.localSavedAt);
                        if (operationTime > best.time) best = { data: Object.assign({}, operation.payload), source: 'outbox', time: operationTime };
                    });
                } catch (e) {
                    console.warn('Could not inspect pending quote saves:', e);
                }
            }

            try {
                var session = JSON.parse(localStorage.getItem('ald_session_quote') || 'null');
                if (session && String(session.supabaseId || '') === rowId) {
                    var sessionTime = quoteStorageEditTime(session);
                    if (sessionTime > best.time) best = { data: Object.assign({}, session), source: 'session', time: sessionTime };
                }
            } catch (e) {}

            if (best.source !== 'cloud') {
                best.data.supabaseId = row && row.id || best.data.supabaseId || null;
                best.data._serverUpdatedAt = row && row.updated_at || best.data._serverUpdatedAt || null;
                best.data.clientName = best.data.clientName || row && row.client_name || '';
                best.data.quoteNumber = best.data.quoteNumber || row && row.quote_number || '';
                best.data.status = best.data.status || row && row.status || 'draft';
                best.data.type = best.data.type || best.data.documentType || row && row.type || 'quote';
                best.data.documentType = best.data.type;
            }
            return best;
        }

        function quoteStorageFinishResolvedLoad(resolved, cloudDetail) {
            clearTimeout(_autoSaveTimer);
            if (!resolved || resolved.source === 'cloud') {
                quoteStorageRemoteUpdate = null;
                quoteStorageRenderRemoteUpdateBanner();
                unsavedChanges = false;
                updateSaveStatus('saved', cloudDetail || 'Quote loaded');
                return;
            }
            unsavedChanges = resolved.source === 'session';
            updateSaveStatus('pending', resolved.source === 'session'
                ? 'Recovered newer changes from this device - syncing to cloud'
                : 'Restored newer saved changes from this device - syncing to cloud');
            if (resolved.source === 'session') setTimeout(function() { doAutoSave({ force: true }); }, 0);
        }

        var quoteStorageCloudRefreshBusy = false;
        var quoteStorageQueuedRemoteSignal = null;

        function quoteStorageVersionsMatch(left, right) {
            if (!left || !right) return false;
            if (String(left) === String(right)) return true;
            var leftTime = Date.parse(String(left));
            var rightTime = Date.parse(String(right));
            return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
        }

        function quoteStorageRemoteEditorInstance(row) {
            var data = row && row.data || {};
            return String(data._saveMeta && data._saveMeta.sourceInstanceId || data._editorInstanceId || '');
        }

        function quoteStorageUiBusy() {
            return !!document.querySelector('.modal.show:not(#qdDialogModal)');
        }

        async function quoteStorageCurrentHasPending(quoteId) {
            if (!window.QuoteDrSave || typeof window.QuoteDrSave.getStatus !== 'function') return false;
            try {
                var status = await window.QuoteDrSave.getStatus();
                return (status.operations || []).some(function(operation) {
                    var operationInstanceId = String(operation.payload && operation.payload._editorInstanceId || '');
                    if (operationInstanceId && operationInstanceId !== quoteStorageInstanceId) return false;
                    return quoteStorageOperationMatchesRow(operation, { id: quoteId }, window._loadedQuoteData || {});
                });
            } catch (e) {
                return false;
            }
        }

        function quoteStorageEnsureRemoteUpdateBanner() {
            var banner = document.getElementById('quoteRemoteUpdateBanner');
            if (banner) return banner;
            banner = document.createElement('div');
            banner.id = 'quoteRemoteUpdateBanner';
            banner.className = 'alert alert-warning border-top border-bottom mb-0';
            banner.style.cssText = 'display:none;border-left:0;border-right:0;border-radius:0;padding:10px 14px;';
            banner.innerHTML = '<div class="d-flex flex-column flex-lg-row align-items-lg-center gap-2">' +
                '<div class="d-flex align-items-start gap-2 flex-grow-1"><i class="fas fa-cloud-arrow-down mt-1"></i><div><strong>Quote updated elsewhere</strong><div class="small" data-quote-remote-message></div></div></div>' +
                '<div class="d-flex flex-wrap gap-2">' +
                    '<button type="button" class="btn btn-sm btn-primary" data-quote-remote-load><i class="fas fa-cloud-arrow-down me-1"></i>Load Latest</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" data-quote-remote-local><i class="fas fa-laptop me-1"></i>Use My Version</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-secondary" data-quote-remote-export><i class="fas fa-download me-1"></i>Export Backup</button>' +
                '</div></div>';
            var anchor = document.getElementById('draftWarningBanner');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(banner, anchor.nextSibling);
            else document.body.insertBefore(banner, document.body.firstChild);
            banner.querySelector('[data-quote-remote-load]').addEventListener('click', function() { quoteStorageLoadLatestRemote(); });
            banner.querySelector('[data-quote-remote-local]').addEventListener('click', function() { quoteStorageUseLocalVersion(); });
            banner.querySelector('[data-quote-remote-export]').addEventListener('click', function() { quoteStorageExportCurrentConflict(); });
            return banner;
        }

        function quoteStorageRenderRemoteUpdateBanner() {
            var banner = document.getElementById('quoteRemoteUpdateBanner');
            if (!quoteStorageRemoteUpdate) {
                if (banner) banner.style.display = 'none';
                return;
            }
            banner = quoteStorageEnsureRemoteUpdateBanner();
            banner.style.display = '';
            var dirty = quoteStorageRemoteUpdate.hasLocalEdits === true;
            banner.querySelector('[data-quote-remote-message]').textContent = dirty
                ? 'This tab also has changes. Cloud saving is paused until you choose which version to keep.'
                : 'Your unchanged tab will load the newest cloud copy as soon as the open window is closed.';
            banner.querySelector('[data-quote-remote-local]').style.display = dirty ? '' : 'none';
            banner.querySelector('[data-quote-remote-export]').style.display = dirty ? '' : 'none';
        }

        function quoteStoragePersistConflictLocalCopy(qData) {
            qData = qData || collectQuoteData();
            try {
                localStorage.setItem('ald_session_quote', JSON.stringify(qData));
                localStorage.setItem('ald_autosave_draft', JSON.stringify(qData));
                if (window._supabaseQuoteId) {
                    localStorage.setItem('ald_remote_conflict_quote:' + window._supabaseQuoteId, JSON.stringify(qData));
                }
            } catch (e) {}
            return qData;
        }

        function quoteStorageExportCurrentConflict() {
            var qData = quoteStoragePersistConflictLocalCopy();
            var exported = quoteStorageExportRecoveryQuote({
                entityType: 'quote',
                entityId: window._supabaseQuoteId || '',
                entityLabel: qData.quoteTitle || qData.clientName || qData.quoteNumber || 'Quote',
                action: 'update',
                payload: qData,
                state: 'conflict',
                localSavedAt: new Date().toISOString()
            });
            if (exported && typeof qdToast === 'function') qdToast({ title: 'Backup Exported', message: 'Open this .qdr file later from File > Open > Open Local File.', type: 'success' });
            return exported;
        }

        async function quoteStoragePersistRemoteConflict(qData) {
            if (!quoteStorageRemoteUpdate || !quoteStorageRemoteUpdate.hasLocalEdits) return { state: 'unchanged' };
            if (quoteStorageRemoteConflictPromise) return quoteStorageRemoteConflictPromise;
            quoteStorageRemoteConflictPromise = (async function() {
                qData = quoteStoragePersistConflictLocalCopy(qData);
                qData._remoteUpdatePending = true;
                var quoteId = String(window._supabaseQuoteId || '');
                if (!quoteId || !window.QuoteDrSave) return { state: 'local_saved' };

                if (quoteStorageRemoteUpdate.captured && typeof window.QuoteDrSave.updateConflictPayload === 'function') {
                    var refreshed = await window.QuoteDrSave.updateConflictPayload('quote', quoteId, qData);
                    if (refreshed && refreshed.state !== 'missing') return refreshed;
                    quoteStorageRemoteUpdate.captured = false;
                }

                if (typeof window.QuoteDrSave.pauseEntity === 'function') {
                    var paused = await window.QuoteDrSave.pauseEntity('quote', quoteId, {
                        serverVersion: quoteStorageRemoteUpdate.version || null,
                        message: 'This quote was updated in another tab or device while local changes were pending.'
                    });
                    if (paused && paused.state === 'conflict') {
                        quoteStorageRemoteUpdate.captured = true;
                        if (typeof window.QuoteDrSave.updateConflictPayload === 'function') {
                            return window.QuoteDrSave.updateConflictPayload('quote', quoteId, qData);
                        }
                        return paused;
                    }
                }

                if (typeof saveQuoteToSupabase === 'function') {
                    var result = await saveQuoteToSupabase(qData);
                    if (result && result.state === 'conflict') {
                        quoteStorageRemoteUpdate.captured = true;
                        if (result.error && result.error.serverVersion) quoteStorageRemoteUpdate.version = result.error.serverVersion;
                    }
                    return result;
                }
                return { state: 'local_saved' };
            })().finally(function() { quoteStorageRemoteConflictPromise = null; });
            return quoteStorageRemoteConflictPromise;
        }

        async function quoteStorageLoadLatestRemote() {
            var pending = quoteStorageRemoteUpdate;
            var quoteId = String(window._supabaseQuoteId || pending && pending.quoteId || '');
            if (!quoteId || typeof loadQuoteFromSupabase !== 'function') return false;
            if (pending && pending.hasLocalEdits) quoteStoragePersistConflictLocalCopy();
            var latest = await loadQuoteFromSupabase(quoteId);
            if (!latest || latest.error || !latest.data || quoteIsPortalLockedForBuilder(latest.data)) {
                if (typeof qdToast === 'function') qdToast({ title: 'Could Not Load Update', message: 'Your local copy is still retained. Try again shortly.', type: 'danger' });
                return false;
            }
            if (pending && pending.hasLocalEdits && window.QuoteDrSave && typeof window.QuoteDrSave.discardPending === 'function') {
                await window.QuoteDrSave.discardPending('quote', quoteId, { state: 'superseded_by_cloud' });
            }
            quoteStorageRemoteUpdate = null;
            quoteStorageRenderRemoteUpdateBanner();
            var qData = quoteStorageCloudRowData(latest.data);
            applyQuoteData(qData);
            window._quoteFullyLoaded = true;
            quoteStorageFinishResolvedLoad({ data: qData, source: 'cloud' }, 'Updated from another tab or device');
            if (pending && pending.hasLocalEdits) {
                try {
                    localStorage.setItem('ald_session_quote', JSON.stringify(qData));
                    localStorage.setItem('ald_autosave_draft', JSON.stringify(qData));
                } catch (e) {}
            }
            if (typeof qdToast === 'function') qdToast({ title: 'Quote Updated', message: 'Loaded the newest changes from the cloud.', type: 'success' });
            quoteStorageEnsureRealtimeSubscription();
            return true;
        }

        async function quoteStorageUseLocalVersion(options) {
            options = options || {};
            if (!quoteStorageRemoteUpdate || !quoteStorageRemoteUpdate.hasLocalEdits) return false;
            if (!options.confirmed) {
                var confirmed = await qdConfirm('Replace the newer cloud quote with the version currently shown on this device? A local backup will remain available.', {
                    title: 'Use My Version?',
                    okText: 'Use My Version',
                    cancelText: 'Cancel',
                    okClass: 'btn-danger',
                    type: 'warning'
                });
                if (!confirmed) return false;
            }
            var pending = quoteStorageRemoteUpdate;
            var quoteId = String(window._supabaseQuoteId || pending.quoteId || '');
            quoteStoragePersistConflictLocalCopy();
            if (window.QuoteDrSave && typeof window.QuoteDrSave.discardPending === 'function') {
                await window.QuoteDrSave.discardPending('quote', quoteId, { state: 'explicit_overwrite_selected' });
            }
            window._quoteServerUpdatedAt = pending.version || window._quoteServerUpdatedAt || null;
            window._quoteLocalEditAt = new Date().toISOString();
            quoteStorageRemoteUpdate = null;
            quoteStorageRenderRemoteUpdateBanner();
            unsavedChanges = true;
            var result = await doAutoSave({ force: true });
            if (result && result.state === 'cloud_saved' && typeof qdToast === 'function') {
                qdToast({ title: 'Your Version Saved', message: 'The cloud quote now matches this device.', type: 'success' });
            }
            return result;
        }

        async function quoteStorageShowRemoteUpdatePrompt() {
            if (!quoteStorageRemoteUpdate || !quoteStorageRemoteUpdate.hasLocalEdits || quoteStorageRemoteUpdate.promptDismissed || quoteStorageRemotePromptOpen) return;
            quoteStorageRemotePromptOpen = true;
            try {
                var choice = await qdConfirm('This quote changed in another tab or device, and this tab also has edits. Loading latest keeps the cloud changes. Using your version replaces them. Your local copy remains recoverable either way.', {
                    title: 'Quote Updated Elsewhere',
                    okText: 'Load Latest',
                    cancelText: 'Keep Editing',
                    secondaryText: 'Use My Version',
                    secondaryValue: 'use_local',
                    secondaryClass: 'btn-outline-danger',
                    type: 'warning'
                });
                if (choice === true) await quoteStorageLoadLatestRemote();
                else if (choice === 'use_local') await quoteStorageUseLocalVersion({ confirmed: true });
                else if (quoteStorageRemoteUpdate) quoteStorageRemoteUpdate.promptDismissed = true;
            } finally {
                quoteStorageRemotePromptOpen = false;
            }
        }

        async function quoteStorageMaybeApplyDeferredRemote() {
            if (!quoteStorageRemoteUpdate || quoteStorageRemoteUpdate.hasLocalEdits || unsavedChanges || quoteStorageUiBusy()) return;
            await quoteStorageLoadLatestRemote();
        }

        async function quoteStorageHandleRemoteSignal(signal) {
            signal = signal || {};
            var quoteId = String(window._supabaseQuoteId || '');
            if (!quoteId || String(signal.quoteId || quoteId) !== quoteId || !window._quoteFullyLoaded) return;
            if (quoteStorageCloudRefreshBusy) {
                quoteStorageQueuedRemoteSignal = signal;
                return;
            }
            quoteStorageCloudRefreshBusy = true;
            try {
                var latest = await loadQuoteFromSupabase(quoteId);
                if (!latest || latest.error || !latest.data || quoteIsPortalLockedForBuilder(latest.data)) return;
                var remoteVersion = latest.data.updated_at || '';
                var localVersion = window._quoteServerUpdatedAt || '';
                if (quoteStorageVersionsMatch(remoteVersion, localVersion)) return;
                var sourceInstanceId = quoteStorageRemoteEditorInstance(latest.data) || String(signal.sourceInstanceId || '');
                if (sourceInstanceId && sourceInstanceId === quoteStorageInstanceId) {
                    window._quoteServerUpdatedAt = remoteVersion;
                    if (window._loadedQuoteData) window._loadedQuoteData._serverUpdatedAt = remoteVersion;
                    return;
                }

                var hasPending = await quoteStorageCurrentHasPending(quoteId);
                var hasLocalEdits = unsavedChanges || hasPending || quoteStorageRemoteUpdate && quoteStorageRemoteUpdate.hasLocalEdits;
                var previousRemoteUpdate = quoteStorageRemoteUpdate;
                quoteStorageRemoteUpdate = {
                    quoteId: quoteId,
                    version: remoteVersion,
                    source: signal.source || 'cloud',
                    hasLocalEdits: !!hasLocalEdits,
                    captured: previousRemoteUpdate && previousRemoteUpdate.captured === true,
                    promptDismissed: !!(previousRemoteUpdate && quoteStorageVersionsMatch(previousRemoteUpdate.version, remoteVersion) && previousRemoteUpdate.promptDismissed)
                };
                quoteStorageRenderRemoteUpdateBanner();
                if (!hasLocalEdits && !quoteStorageUiBusy()) {
                    await quoteStorageLoadLatestRemote();
                    return;
                }
                if (hasLocalEdits) {
                    clearTimeout(_autoSaveTimer);
                    await quoteStoragePersistRemoteConflict(collectQuoteData());
                    var el = document.getElementById('saveStatus');
                    if (el) el.innerHTML = '<span style="color:#b45309;"><i class="fas fa-triangle-exclamation"></i> Cloud update waiting - choose which version to keep</span>';
                    setTimeout(function() { quoteStorageShowRemoteUpdatePrompt(); }, 0);
                }
            } catch (e) {
                console.warn('Remote quote update check skipped:', e);
            } finally {
                quoteStorageCloudRefreshBusy = false;
                if (quoteStorageQueuedRemoteSignal) {
                    var queued = quoteStorageQueuedRemoteSignal;
                    quoteStorageQueuedRemoteSignal = null;
                    setTimeout(function() { quoteStorageHandleRemoteSignal(queued); }, 0);
                }
            }
        }

        function quoteStorageBroadcastCloudUpdate(quoteId, version, sourceInstanceId) {
            if (!quoteStorageTabChannel || !quoteId || !version) return;
            try {
                quoteStorageTabChannel.postMessage({
                    type: 'quote_cloud_updated',
                    quoteId: String(quoteId),
                    version: version,
                    sourceInstanceId: sourceInstanceId || quoteStorageInstanceId
                });
            } catch (e) {}
        }

        function quoteStorageEnsureRealtimeSubscription() {
            var quoteId = String(window._supabaseQuoteId || '');
            if (quoteStorageRealtimeQuoteId === quoteId && quoteStorageRealtimeChannel) return;
            if (quoteStorageRealtimeChannel && _supabase && typeof _supabase.removeChannel === 'function') {
                _supabase.removeChannel(quoteStorageRealtimeChannel);
            }
            quoteStorageRealtimeChannel = null;
            quoteStorageRealtimeQuoteId = quoteId;
            if (!quoteId || !_supabase || typeof _supabase.channel !== 'function') return;
            try {
                quoteStorageRealtimeChannel = _supabase
                    .channel('quote-builder-' + quoteId + '-' + quoteStorageInstanceId)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'quotes',
                        filter: 'id=eq.' + quoteId
                    }, function(payload) {
                        var row = payload && payload.new || {};
                        quoteStorageHandleRemoteSignal({
                            quoteId: quoteId,
                            version: row.updated_at || '',
                            sourceInstanceId: quoteStorageRemoteEditorInstance(row),
                            source: 'realtime'
                        });
                    })
                    .subscribe();
            } catch (e) {
                console.warn('Realtime quote updates are unavailable; polling remains active.', e);
            }
        }

        async function quoteStorageRefreshFromCloudIfIdle() {
            var quoteId = String(window._supabaseQuoteId || '');
            if (!quoteId || quoteStorageCloudRefreshBusy || document.hidden || !window._quoteFullyLoaded) return;
            try {
                var versionResult = await _supabase.from('quotes').select('updated_at').eq('id', quoteId).maybeSingle();
                if (versionResult.error || !versionResult.data) return;
                var remoteVersion = versionResult.data.updated_at || '';
                var localVersion = window._quoteServerUpdatedAt || '';
                if (!quoteStorageVersionsMatch(remoteVersion, localVersion)) {
                    await quoteStorageHandleRemoteSignal({ quoteId: quoteId, version: remoteVersion, source: 'poll' });
                } else {
                    await quoteStorageMaybeApplyDeferredRemote();
                }
            } catch (e) {
                console.warn('Background quote refresh skipped:', e);
            }
        }

        function quoteStorageStartCloudRefresh() {
            if (window._quoteStorageCloudRefreshStarted) return;
            window._quoteStorageCloudRefreshStarted = true;
            if (typeof BroadcastChannel === 'function') {
                quoteStorageTabChannel = new BroadcastChannel('quotedr-quote-cloud-updates');
                quoteStorageTabChannel.onmessage = function(event) {
                    if (event.data && event.data.type === 'quote_cloud_updated') quoteStorageHandleRemoteSignal(Object.assign({ source: 'tab' }, event.data));
                };
            }
            window.addEventListener('focus', function() {
                quoteStorageMaybeApplyDeferredRemote();
                quoteStorageRefreshFromCloudIfIdle();
            });
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    quoteStorageMaybeApplyDeferredRemote();
                    quoteStorageRefreshFromCloudIfIdle();
                }
            });
            document.addEventListener('hidden.bs.modal', function() { quoteStorageMaybeApplyDeferredRemote(); });
            window.addEventListener('pagehide', function() {
                if (quoteStorageTabChannel) quoteStorageTabChannel.close();
                if (quoteStorageRealtimeChannel && _supabase && typeof _supabase.removeChannel === 'function') _supabase.removeChannel(quoteStorageRealtimeChannel);
            });
            setInterval(quoteStorageRefreshFromCloudIfIdle, 60000);
            quoteStorageEnsureRealtimeSubscription();
        }

        function collectQuoteData() {
            var grandTotal = parseQuoteMoney(document.getElementById('grandTotalDisplay')?.textContent || '0');
            var isChangeOrder = window._quoteDocumentType === 'change_order';
            var statusEl = document.getElementById('quoteStatus');
            var status = statusEl ? statusEl.value : (isChangeOrder ? 'draft' : 'draft');
            var supabaseId = window._supabaseQuoteId || null;
            var loadedData = window._loadedQuoteData || window._currentQuoteData || {};
            var dividerLabels = (typeof getQuoteDividerLabels === 'function') ? getQuoteDividerLabels() : { singular: 'Room', plural: 'Rooms' };
            if (isChangeOrder && supabaseId && window._parentQuoteId && supabaseId === window._parentQuoteId) {
                supabaseId = null;
            }
            return {
                version: 1,
                savedAt: new Date().toISOString(),
                _clientEditedAt: window._quoteLocalEditAt || loadedData._clientEditedAt || loadedData._saveMeta && loadedData._saveMeta.clientEditedAt || null,
                _editorInstanceId: quoteStorageInstanceId,
                _remoteUpdatePending: !!(quoteStorageRemoteUpdate && quoteStorageRemoteUpdate.hasLocalEdits),
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
                termsExplicit: true,
                dividerSingular: dividerLabels.singular,
                dividerPlural: dividerLabels.plural,
                quoteDividerLabels: { singular: dividerLabels.singular, plural: dividerLabels.plural },
                rooms: sanitizeQuoteRoomsForSave(rooms),
                categoryStyles: getQuoteCategoryStylesSnapshot(),
                roomCounter: roomCounter,
                quoteAdjustment: getQuoteClientAdjustment(),
                paymentsReceived: getQuotePaymentsReceived(),
                taxEnabled: (typeof getQuoteTaxEnabled === 'function') ? getQuoteTaxEnabled() : true,
                taxRate: (function(){ try { var p = JSON.parse(localStorage.getItem('ald_quote_prefs')||'{}'); return p.taxRate !== undefined && p.taxRate !== '' ? parseFloat(p.taxRate) / 100 : 0.13; } catch(e){ return 0.13; } })(),
                taxLabel: (function(){ try { return JSON.parse(localStorage.getItem('ald_quote_prefs')||'{}').taxLabel || 'HST'; } catch(e){ return 'HST'; } })(),
                grandTotal: grandTotal,
                total: grandTotal,
                supabaseId: supabaseId,
                _serverUpdatedAt: window._quoteServerUpdatedAt || loadedData._serverUpdatedAt || loadedData.updated_at || null,
                currency: (function(){ try { return JSON.parse(localStorage.getItem('ald_quote_prefs')||'{}').currency||'CAD'; } catch(e){return 'CAD';} })(),
                paymentSettings: (typeof getLocalPaymentSettingsSnapshot === 'function') ? getLocalPaymentSettingsSnapshot() : null,
                businessProfile: (typeof getLocalBusinessProfileSnapshot === 'function') ? getLocalBusinessProfileSnapshot() : {},
                hiddenProfileFields: (typeof getLocalHiddenProfileFieldsSnapshot === 'function') ? getLocalHiddenProfileFieldsSnapshot() : [],
                portal_visible: isChangeOrder ? false : loadedData.portal_visible === true,
                portal_id: isChangeOrder ? '' : loadedData.portal_id || '',
                portal_name: isChangeOrder ? '' : loadedData.portal_name || '',
                portal_client_name: isChangeOrder ? '' : loadedData.portal_client_name || loadedData.clientName || '',
                portal_client_email: isChangeOrder ? '' : loadedData.portal_client_email || loadedData.clientEmail || loadedData.email || '',
                portal_pin: isChangeOrder ? '' : loadedData.portal_pin || '',
                portal_added_at: isChangeOrder ? null : loadedData.portal_added_at || null,
                portal_theme: isChangeOrder ? null : loadedData.portal_theme || null
            };
        }

        function applyQuoteCloudAcknowledgement(event) {
            var detail = event && event.detail || {};
            var operation = detail.operation || {};
            if (operation.entityType !== 'quote' || operation.action === 'delete') return;

            var resultData = detail.result && detail.result.data;
            var saved = Array.isArray(resultData) ? resultData[0] : resultData;
            var currentId = String(window._supabaseQuoteId || '');
            var operationId = String(operation.entityId || '');
            var savedId = String(saved && saved.id || '');
            var currentQuoteNumber = String(document.getElementById('quoteNumber')?.value || '');
            var operationQuoteNumber = String(operation.payload && operation.payload.quoteNumber || '');
            var belongsToCurrentQuote = currentId
                ? operationId === currentId || savedId === currentId
                : operationQuoteNumber && operationQuoteNumber === currentQuoteNumber;
            if (!belongsToCurrentQuote) return;

            var sourceInstanceId = String(operation.payload && operation.payload._editorInstanceId || '');
            var cloudVersion = detail.version || saved && saved.updated_at ||
                operation.target && operation.target.verifyVersionValue || null;
            quoteStorageBroadcastCloudUpdate(savedId || operationId || currentId, cloudVersion, sourceInstanceId);
            if (sourceInstanceId && sourceInstanceId !== quoteStorageInstanceId) {
                quoteStorageHandleRemoteSignal({
                    quoteId: savedId || operationId || currentId,
                    version: cloudVersion,
                    sourceInstanceId: sourceInstanceId,
                    source: 'tab'
                });
                return;
            }

            if (savedId) {
                window._supabaseQuoteId = savedId;
                localStorage.setItem('ald_active_quote_id', savedId);
            }
            if (!cloudVersion) return;
            window._quoteServerUpdatedAt = cloudVersion;
            if (window._loadedQuoteData) {
                window._loadedQuoteData._serverUpdatedAt = cloudVersion;
                window._loadedQuoteData.updated_at = cloudVersion;
            }
            quoteStorageEnsureRealtimeSubscription();
        }

        window.addEventListener('quotedr-save-acknowledged', applyQuoteCloudAcknowledgement);
        window.addEventListener('quotedr-quote-conflict-resolved', function(event) {
            var detail = event && event.detail || {};
            if (detail.strategy !== 'use_local' || String(detail.entityId || '') !== String(window._supabaseQuoteId || '')) return;
            quoteStorageRemoteUpdate = null;
            quoteStorageRenderRemoteUpdateBanner();
            unsavedChanges = false;
        });

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
            renderTermsCheckboxes(getQuoteTermsForRender(data));
            rooms = data.rooms || [];
            if (data.categoryStyles && typeof categoryStyles !== 'undefined') {
                Object.assign(categoryStyles, data.categoryStyles || {});
                try { localStorage.setItem('ald_category_styles', JSON.stringify(categoryStyles)); } catch(e) {}
            }
            roomCounter = data.roomCounter || rooms.length;
            setQuoteClientAdjustment(data.quoteAdjustment || data.clientAdjustment || null);
            setQuotePaymentsReceived(data.paymentsReceived || data.paymentReceived || null);
            if (typeof setQuoteTaxEnabled === 'function') setQuoteTaxEnabled(data.taxEnabled !== false);
            window._quotePaymentFallbackBalanceDue = null;
            if (!data.paymentsReceived && !data.paymentReceived && data._paymentBalanceDueFallback !== undefined && data._paymentBalanceDueFallback !== null && data._paymentBalanceDueFallback !== '') {
                window._quotePaymentFallbackBalanceDue = parseQuoteMoney(data._paymentBalanceDueFallback);
            }
            window._quoteDocumentType = data.type || data.documentType || 'quote';
            window._parentQuoteId = data.parentQuoteId || data.parent_quote_id || '';
            window._parentQuoteNumber = data.parentQuoteNumber || '';
            window._parentQuoteTotal = parseFloat(data.parentQuoteTotal || 0) || 0;
            window._changeOrderBaseRooms = data.changeOrderBaseRooms || [];
            window._changeOrderPreviousApprovedTotal = parseFloat(data.changeOrderPreviousApprovedTotal || data.previousApprovedChangeOrderTotal || 0) || 0;
            window._previousApprovedChangeOrderTotal = window._changeOrderPreviousApprovedTotal;
            window._changeOrderPriceSummary = data.changeOrderPriceSummary || null;
            window._changeOrderNumber = parseInt(data.changeOrderNumber || data.change_order_number || 0, 10) || 0;
            window._quoteServerUpdatedAt = data._serverUpdatedAt || data.serverUpdatedAt || data.updated_at || null;
            window._quoteLocalEditAt = data._clientEditedAt || data._saveMeta && data._saveMeta.clientEditedAt || data.savedAt || null;
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
            setTimeout(function() { quoteStorageEnsureRealtimeSubscription(); }, 0);
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
            } else if (state === 'pending') {
                el.innerHTML = '<span style="color:#9a6700;"><i class="fas fa-cloud-arrow-up"></i> ' + (detail || 'Saved on this device - syncing to cloud') + '</span>';
                unsavedChanges = false;
            } else if (state === 'loaded') {
                el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-folder-open"></i> Opened at ' + t + (detail ? ' \u2014 ' + detail : '') + '</span>';
                unsavedChanges = false;
            } else if (state === 'error') {
                el.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> ' + (detail || 'Save failed') + '</span>';
            }
        }

        function markUnsaved() {
            unsavedChanges = true;
            window._quoteLocalEditAt = new Date().toISOString();
            if (quoteStorageRemoteUpdate) {
                quoteStorageRemoteUpdate.hasLocalEdits = true;
                quoteStorageRenderRemoteUpdateBanner();
                setTimeout(function() { quoteStorageShowRemoteUpdatePrompt(); }, 0);
            }
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
            if (typeof listQuoteSummariesFromSupabase === 'function' || typeof listQuotesFromSupabase === 'function') {
                var listSavedQuotes = typeof listQuoteSummariesFromSupabase === 'function' ? listQuoteSummariesFromSupabase : listQuotesFromSupabase;
                var result = await listSavedQuotes();
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
                if (result && !result.error && result.state === 'cloud_saved' && result.data) {
                    var saved = Array.isArray(result.data) ? result.data[0] : result.data;
                    if (saved && saved.id) {
                        window._supabaseQuoteId = saved.id;
                        window._quoteServerUpdatedAt = saved.updated_at || null;
                        localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                    }
                    unsavedChanges = false;
                    updateSaveStatus('saved', 'Confirmed in cloud');
                } else if (result && result.state !== 'local_failed') {
                    unsavedChanges = false;
                    updateSaveStatus('pending', 'Saved on this device - syncing to cloud');
                } else {
                    throw new Error((result && result.error && result.error.message) || 'The quote could not be stored safely.');
                }
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
                if (result && !result.error && result.state === 'cloud_saved') {
                    var saved = Array.isArray(result.data) ? result.data[0] : result.data;
                    if (saved && saved.id) {
                        window._supabaseQuoteId = saved.id;
                        window._quoteServerUpdatedAt = saved.updated_at || null;
                        localStorage.setItem("ald_active_quote_id", saved.id);
                    }
                    updateSaveStatus('saved', 'Confirmed in cloud');
                } else if (result && result.state !== 'local_failed') {
                    updateSaveStatus('pending', 'Saved on this device - syncing to cloud');
                } else {
                    throw new Error((result && result.error && result.error.message) || 'The quote could not be stored safely.');
                }
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

        function quoteStorageRecoveryQuoteFromOperation(operation) {
            if (!operation || operation.entityType !== 'quote' || operation.action === 'delete') return null;
            var payload = operation.payload;
            if (!payload || typeof payload !== 'object' || !Array.isArray(payload.rooms)) return null;
            var quote = JSON.parse(JSON.stringify(payload));
            var entityId = String(operation.entityId || '');
            if (!quote.supabaseId && entityId && entityId.indexOf('quote-number:') !== 0) quote.supabaseId = entityId;
            if (!quote._serverUpdatedAt && operation.baseVersion) quote._serverUpdatedAt = operation.baseVersion;
            quote._quoteDrBackup = {
                format: 'quotedr-quote-backup-v1',
                exportedAt: new Date().toISOString(),
                operationId: operation.operationId || '',
                revision: operation.revision || '',
                state: operation.state || 'local_pending',
                localSavedAt: operation.localSavedAt || ''
            };
            return quote;
        }

        function quoteStorageRecoveryCandidates(data) {
            if (!data || data.format !== 'quotedr-recovery-v1' || !Array.isArray(data.operations)) return [];
            return data.operations.map(function(operation) {
                var quote = quoteStorageRecoveryQuoteFromOperation(operation);
                return quote ? { operation: operation, quote: quote } : null;
            }).filter(Boolean).sort(function(a, b) {
                return String(b.operation.localSavedAt || '').localeCompare(String(a.operation.localSavedAt || ''));
            });
        }

        function quoteStorageSafeBackupName(data) {
            var title = String(data && (data.quoteTitle || data.clientName || data.quoteNumber) || 'Quote').trim() || 'Quote';
            title = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Quote';
            return title + ' - Recovery - ' + new Date().toISOString().slice(0, 10) + '.qdr';
        }

        function quoteStorageDownloadJson(data, fileName) {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function() { URL.revokeObjectURL(url); }, 0);
        }

        function quoteStorageExportRecoveryQuote(operation) {
            var quote = quoteStorageRecoveryQuoteFromOperation(operation);
            if (!quote) return false;
            quoteStorageDownloadJson(quote, quoteStorageSafeBackupName(quote));
            return true;
        }

        window.qdExportQuoteRecovery = quoteStorageExportRecoveryQuote;

        function quoteStorageChooseRecoveryQuote(candidates) {
            if (!candidates.length) return Promise.resolve(null);
            if (candidates.length === 1 || typeof bootstrap === 'undefined') return Promise.resolve(candidates[0]);
            return new Promise(function(resolve) {
                var existing = document.getElementById('qdRecoveryQuotePicker');
                if (existing) existing.remove();
                var modalEl = document.createElement('div');
                modalEl.className = 'modal fade';
                modalEl.id = 'qdRecoveryQuotePicker';
                modalEl.tabIndex = -1;
                modalEl.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
                    '<div class="modal-header"><h5 class="modal-title"><i class="fas fa-file-arrow-up me-2"></i>Choose Quote Backup</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
                    '<div class="modal-body"><div class="list-group">' + candidates.map(function(candidate, index) {
                        var quote = candidate.quote;
                        var title = quote.quoteTitle || quote.clientName || quote.quoteNumber || 'Quote';
                        var details = [];
                        if (quote.quoteNumber) details.push('#' + quote.quoteNumber);
                        if (candidate.operation.localSavedAt) details.push(new Date(candidate.operation.localSavedAt).toLocaleString());
                        return '<button type="button" class="list-group-item list-group-item-action" data-qd-recovery-index="' + index + '"><span class="d-block fw-semibold">' + quoteStorageEscapeHtml(title) + '</span><span class="small text-muted">' + quoteStorageEscapeHtml(details.join(' | ') || 'Local recovery copy') + '</span></button>';
                    }).join('') + '</div></div>' +
                    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button></div>' +
                    '</div></div>';
                document.body.appendChild(modalEl);
                var modal = new bootstrap.Modal(modalEl);
                var settled = false;
                modalEl.querySelectorAll('[data-qd-recovery-index]').forEach(function(button) {
                    button.addEventListener('click', function() {
                        settled = true;
                        var selected = candidates[parseInt(button.getAttribute('data-qd-recovery-index'), 10)] || null;
                        modal.hide();
                        resolve(selected);
                    });
                });
                modalEl.addEventListener('hidden.bs.modal', function() {
                    modalEl.remove();
                    if (!settled) resolve(null);
                }, { once: true });
                modal.show();
            });
        }

        async function quoteStorageResolveOpenedData(parsed) {
            if (parsed && parsed.format === 'quotedr-recovery-v1') {
                var candidates = quoteStorageRecoveryCandidates(parsed);
                if (!candidates.length) throw new Error('This recovery file does not contain a quote backup.');
                var selected = await quoteStorageChooseRecoveryQuote(candidates);
                if (!selected) return null;
                return { data: selected.quote, fromRecovery: true };
            }
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rooms)) {
                throw new Error('This file is not a valid QuoteDr quote or recovery backup.');
            }
            return {
                data: parsed,
                fromRecovery: !!(parsed._quoteDrBackup && parsed._quoteDrBackup.format === 'quotedr-quote-backup-v1')
            };
        }

        function quoteStoragePickLocalFile() {
            if (window.showOpenFilePicker) {
                return window.showOpenFilePicker({
                    types: [{ description: 'QuoteDr Quote or Recovery File', accept: { 'application/json': ['.qdr', '.aldquote', '.json'] } }]
                }).then(async function(handles) {
                    var handle = handles && handles[0];
                    if (!handle) return null;
                    return { handle: handle, file: await handle.getFile() };
                });
            }
            return new Promise(function(resolve) {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = '.qdr,.aldquote,.json,application/json';
                input.style.display = 'none';
                input.onchange = function(event) {
                    var file = event.target.files && event.target.files[0];
                    input.remove();
                    resolve(file ? { handle: null, file: file } : null);
                };
                input.oncancel = function() {
                    input.remove();
                    resolve(null);
                };
                document.body.appendChild(input);
                input.click();
            });
        }

        async function quoteStorageOpenLocalSelection() {
            var selectedFile = await quoteStoragePickLocalFile();
            if (!selectedFile) return null;
            var parsed = JSON.parse(await selectedFile.file.text());
            if (parsed && parsed.format === 'quotedr-recovery-v1') {
                var loadModal = bootstrap.Modal.getInstance(document.getElementById('loadQuoteModal'));
                if (loadModal) loadModal.hide();
            }
            var resolved = await quoteStorageResolveOpenedData(parsed);
            if (!resolved) return null;
            var data = resolved.data;
            if (!data.supabaseId) {
                window._supabaseQuoteId = null;
                localStorage.removeItem('ald_active_quote_id');
            }
            saveFileHandle = resolved.fromRecovery ? null : selectedFile.handle;
            applyQuoteData(data);
            startAutoSave();
            updateSaveStatus('loaded', selectedFile.file.name);
            if (resolved.fromRecovery) {
                window._quoteLocalEditAt = new Date().toISOString();
                unsavedChanges = true;
                updateSaveStatus('pending', 'Backup opened on this device - syncing to cloud');
                setTimeout(function() { doAutoSave(); }, 0);
            }
            return { data: data, fileName: selectedFile.file.name, fromRecovery: resolved.fromRecovery };
        }

        async function loadQuoteFromLocalFile() {
            if (unsavedChanges && !await qdConfirm('You have unsaved changes. Open a different quote anyway?', {
                title: 'Unsaved Changes',
                okText: 'Open Anyway',
                okClass: 'btn-warning',
                type: 'warning'
            })) return;
            try {
                var opened = await quoteStorageOpenLocalSelection();
                if (!opened) return;
                var m = bootstrap.Modal.getInstance(document.getElementById('loadQuoteModal'));
                if (m) m.hide();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    updateSaveStatus('error', err.message || 'Could not open file');
                    if (typeof qdAlert === 'function') qdAlert(err.message || 'Could not open file.', { title: 'Could Not Open Backup', type: 'error' });
                }
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
                            <button type="button" class="btn btn-outline-secondary" onclick="loadQuoteFromLocalFile()" id="openLocalFileBtn"><i class="fas fa-folder me-1"></i>Open Local File</button>
                        </div>
                    </div>
                </div>`;
                document.body.appendChild(modalEl);
            }

            var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modal.show();

            // Fetch cloud quotes
            var listEl = document.getElementById('loadQuoteList');
            if (typeof listQuoteSummariesFromSupabase === 'function' || typeof listQuotesFromSupabase === 'function') {
                var listCloudQuotes = typeof listQuoteSummariesFromSupabase === 'function' ? listQuoteSummariesFromSupabase : listQuotesFromSupabase;
                var result = await listCloudQuotes();
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
                if (quoteIsPortalLockedForBuilder(q) && !quoteBuilderIsStartingChangeOrder()) {
                    await handlePortalLockedBuilderLoad(q);
                    return;
                }
                var resolved = await quoteStorageResolveCloudRow(q);
                var qData = resolved.data;
                window._supabaseQuoteId = q.id;
                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                applyQuoteData(qData);
                window._loadedQuoteData = qData;
                quoteStorageFinishResolvedLoad(resolved, 'Quote loaded');
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

        async function doAutoSave(options) {
            options = options || {};
            if (!unsavedChanges && options.force !== true) return { state: 'unchanged' };
            var t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var el = document.getElementById('saveStatus');
            var qData = collectQuoteData();
            // Always save to localStorage as backup
            try {
                localStorage.setItem('ald_autosave_draft', JSON.stringify(qData));
                localStorage.setItem('ald_session_quote', JSON.stringify(qData));
            } catch(e) {}
            // Also write to file if we have a handle
            if (saveFileHandle) {
                try {
                    await writeToHandle(saveFileHandle);
                } catch(e) {
                    if (el) el.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> Auto-save failed</span>';
                }
            }
            if (quoteStorageRemoteUpdate && quoteStorageRemoteUpdate.hasLocalEdits) {
                qData._remoteUpdatePending = true;
                var heldResult = await quoteStoragePersistRemoteConflict(qData);
                unsavedChanges = true;
                quoteStorageRenderRemoteUpdateBanner();
                if (el) el.innerHTML = '<span style="color:#b45309;"><i class="fas fa-triangle-exclamation"></i> Cloud update waiting - choose which version to keep</span>';
                setTimeout(function() { quoteStorageShowRemoteUpdatePrompt(); }, 0);
                updateDraftWarning();
                return heldResult && heldResult.state ? heldResult : { state: 'conflict' };
            }
            // Cloud save to Supabase - always runs regardless of file handle
            var cloudState = null;
            var cloudResult = null;
            if (typeof saveQuoteToSupabase === 'function') {
                if (quoteDataIsPortalLockedForBuilder(qData)) {
                    console.warn('[AutoSave] Skipping cloud save - this quote is locked in a client portal');
                    return { state: 'skipped', reason: 'portal_locked' };
                }
                // SAFETY GUARD: never overwrite cloud data with empty rooms unless we know the quote is intentionally empty
                // _quoteFullyLoaded is set true only after a successful Supabase load
                if (!window._quoteFullyLoaded && (!qData.rooms || qData.rooms.length === 0)) {
                    console.warn('[AutoSave] Skipping cloud save - rooms empty and quote not confirmed loaded from cloud');
                    return { state: 'skipped', reason: 'quote_not_loaded' };
                }
                try {
                    cloudResult = await saveQuoteToSupabase(qData);
                    cloudState = cloudResult && cloudResult.state;
                    if (cloudState === 'conflict') {
                        quoteStorageRemoteUpdate = {
                            quoteId: String(window._supabaseQuoteId || qData.supabaseId || ''),
                            version: cloudResult.error && cloudResult.error.serverVersion || null,
                            source: 'save_check',
                            hasLocalEdits: true,
                            captured: true
                        };
                        quoteStoragePersistConflictLocalCopy(qData);
                        quoteStorageRenderRemoteUpdateBanner();
                        unsavedChanges = true;
                        if (el) el.innerHTML = '<span style="color:#b45309;"><i class="fas fa-triangle-exclamation"></i> Cloud update waiting - choose which version to keep</span>';
                        setTimeout(function() { quoteStorageShowRemoteUpdatePrompt(); }, 0);
                        updateDraftWarning();
                        return cloudResult;
                    }
                    if (cloudResult && !cloudResult.error && cloudResult.state === 'cloud_saved' && cloudResult.data) {
                        var saved = Array.isArray(cloudResult.data) ? cloudResult.data[0] : cloudResult.data;
                        if (saved && saved.id) {
                            window._supabaseQuoteId = saved.id;
                            window._quoteServerUpdatedAt = saved.updated_at || null;
                            localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                        }
                    } else if (!cloudResult || cloudResult.state === 'local_failed') {
                        throw new Error((cloudResult && cloudResult.error && cloudResult.error.message) || 'Auto-save could not store a durable copy.');
                    }
                } catch (error) {
                    unsavedChanges = true;
                    updateSaveStatus('error', error.message || 'Auto-save failed');
                    return { state: 'local_failed', error: error };
                }
            }
            unsavedChanges = false;
            if (el) {
                if (cloudState === 'cloud_saved') {
                    el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-cloud-check"></i> Cloud saved at ' + t + '</span>';
                } else if (cloudState === 'superseded') {
                    el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-cloud"></i> Newer cloud copy kept at ' + t + '</span>';
                } else if (cloudState === 'local_pending') {
                    el.innerHTML = '<span style="color:#9a6700;"><i class="fas fa-cloud-arrow-up"></i> Saved on this device at ' + t + ' - syncing</span>';
                } else if (saveFileHandle) {
                    el.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> File saved at ' + t + '</span>';
                } else {
                    el.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-exclamation-triangle"></i> Draft saved locally at ' + t + '</span>';
                }
            }
            updateDraftWarning();
            return cloudResult || { state: saveFileHandle ? 'file_saved' : 'local_saved' };
        }

        window.qdSaveBeforeNavigation = async function() {
            clearTimeout(_autoSaveTimer);
            saveSessionQuote();
            if (quoteStorageRemoteUpdate && quoteStorageRemoteUpdate.hasLocalEdits) {
                await quoteStoragePersistRemoteConflict(collectQuoteData());
                await quoteStorageShowRemoteUpdatePrompt();
                return false;
            }
            if (!unsavedChanges) return true;
            updateSaveStatus('saving', 'Finishing save before leaving');
            var result = await doAutoSave({ force: true });
            if (result && result.state !== 'local_failed' && result.state !== 'conflict') return true;
            if (window.QuoteDrSave && typeof window.QuoteDrSave.openRecoveryCenter === 'function') window.QuoteDrSave.openRecoveryCenter();
            await qdAlert('QuoteDr could not safely retain your latest changes, so this page will stay open. Export a backup from Save Status before leaving.', {
                title: 'Save Needs Attention',
                type: 'error'
            });
            return false;
        };

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
            quoteStorageStartCloudRefresh();

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
                        if (quoteIsPortalLockedForBuilder(q) && !quoteBuilderIsStartingChangeOrder()) {
                            await handlePortalLockedBuilderLoad(q);
                            return;
                        }
                        const resolved = await quoteStorageResolveCloudRow(data);
                        const qData = resolved.data;
                        window._supabaseQuoteId = data.id;
                        localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                        applyQuoteData(qData);
                        quoteStorageFinishResolvedLoad(resolved, 'Quote loaded');
                        window._quoteFullyLoaded = true; // allow autosave now
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
            renderTermsCheckboxes(getQuoteTermsForRender(session));
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
                renderTermsCheckboxes(getQuoteTermsForRender(draft));
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
            try {
                await quoteStorageOpenLocalSelection();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.warn('File open error:', err);
                    if (typeof qdAlert === 'function') qdAlert(err.message || 'Could not open file.', { title: 'Could Not Open Backup', type: 'error' });
                }
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
                                var resolved = await quoteStorageResolveCloudRow(result.data);
                                var qData = resolved.data;
                                window._supabaseQuoteId = result.data.id;
                                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);
                                applyQuoteData(qData);
                                quoteStorageFinishResolvedLoad(resolved, 'Loaded from cloud');
                                if (qData.quoteNumber) document.getElementById('quoteNumber').value = qData.quoteNumber;
                                renderTermsCheckboxes(getQuoteTermsForRender(qData));
                                var el = document.getElementById('saveStatus');
                                if (el && resolved.source === 'cloud') el.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-cloud"></i> Loaded from cloud</span>';
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
                                var resolved = await quoteStorageResolveCloudRow(result.data);
                                var qData = resolved.data;
                                window._supabaseQuoteId = result.data.id;
                                localStorage.setItem("ald_active_quote_id", result.data.id);
                                applyQuoteData(qData);
                                if (qData.quoteNumber) document.getElementById("quoteNumber").value = qData.quoteNumber || "";
                                renderTermsCheckboxes(getQuoteTermsForRender(qData));
                                quoteStorageFinishResolvedLoad(resolved, 'Restored from cloud');
                                var el = document.getElementById("saveStatus");
                                if (el && resolved.source === 'cloud') el.innerHTML = "<span style=\"color:#28a745;\"><i class=\"fas fa-cloud\"></i> Restored - " + (qData.clientName || "quote") + "</span>";
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
