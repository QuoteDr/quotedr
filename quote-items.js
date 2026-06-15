// Manage Items module extracted from quote-builder.html.
// Owns custom pricing items, manage-items modal rendering, cloud item backup, and row edit actions.
(function() {
    'use strict';

        var CREATE_NEW_CATEGORY_VALUE = '__quote_dr_create_new_category__';
        var MANAGE_CATEGORY_STATE_KEY = 'ald_manage_items_category_state';
        var manageItemsFilter = 'all';
        var manageItemsCategoryState = {};
        var dirtyPricingRows = new Set();
        var pricingOtherDirty = false;

        function manageItemsEscape(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
                return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
            });
        }

        function manageItemsAttr(value) {
            return manageItemsEscape(value).replace(/`/g, '&#96;');
        }

        function manageItemsRowKey(cat, name) {
            return String(cat || '') + '||' + String(name || '');
        }

        function manageItemsSafeId(cat, name) {
            return (String(cat || '') + '_' + String(name || '')).replace(/[^a-z0-9]/gi,'_');
        }

        function loadManageItemsCategoryState() {
            try {
                manageItemsCategoryState = JSON.parse(localStorage.getItem(MANAGE_CATEGORY_STATE_KEY) || '{}') || {};
            } catch(e) {
                manageItemsCategoryState = {};
            }
        }

        function saveManageItemsCategoryState() {
            localStorage.setItem(MANAGE_CATEGORY_STATE_KEY, JSON.stringify(manageItemsCategoryState || {}));
        }

        function getManageItemsCategoryOpen(cat) {
            if (Object.prototype.hasOwnProperty.call(manageItemsCategoryState, cat)) {
                return manageItemsCategoryState[cat] === true;
            }
            return false;
        }

                function _injectItemsIntoPricingDB(itemsObj) {
            for (var cat in itemsObj) {
                if (cat === '__choiceGroupTemplates') continue;
                if (!Array.isArray(itemsObj[cat])) continue; // skip corrupted entries
                if (!pricingDatabase[cat]) pricingDatabase[cat] = [];
                itemsObj[cat].forEach(function(item) {
                    if (!pricingDatabase[cat].find(function(e) { return e._custom && e.name === item.name; })) {
                        pricingDatabase[cat].push(Object.assign({}, item, { _custom: true }));
                    }
                });
            }
        }

        function loadCustomItems() {
            try {
                customItems = JSON.parse(localStorage.getItem('ald_custom_items') || '{}');
            } catch (e) {
                customItems = {};
            }

            var localIsEmpty = Object.keys(customItems).length === 0;

            // Always sync from cloud on load - cloud is source of truth
            _doRestoreItemsFromCloud().then(function(result) {
                if (!result.error && result.data && Object.keys(result.data).length > 0) {
                    var cloudItems = result.data;
                    var changed = false;
                    // Merge: cloud categories win, but keep any local-only categories
                    Object.keys(cloudItems).forEach(function(cat) {
                        if (!customItems[cat] || JSON.stringify(customItems[cat]) !== JSON.stringify(cloudItems[cat])) {
                            customItems[cat] = cloudItems[cat];
                            changed = true;
                        }
                    });
                    if (changed) {
                        console.log('[Restore] Synced from cloud:', Object.keys(cloudItems).length, 'categories');
                        localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
                        Object.keys(pricingDatabase).forEach(function(k) { delete pricingDatabase[k]; });
                        _injectItemsIntoPricingDB(customItems);
                        if (localIsEmpty) {
                            var toast = document.createElement('div');
                            toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#198754;color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                            toast.innerHTML = '<i class="fas fa-cloud-download-alt me-2"></i>Items restored from cloud!';
                            document.body.appendChild(toast);
                            setTimeout(function(){ toast.remove(); }, 4000);
                        }
                    }
                }
            }).catch(function(){});

            // Restore templates from cloud (merge with local, cloud fills in missing ones)
            _restoreTemplatesFromCloud().catch(function(){});

            // Sync used quote numbers from cloud (prevents duplicates across devices)
            _syncUsedQuoteNumbersFromCloud().catch(function(){});

            // NOTE: items table sync removed - snapshot backup (quotes table) is the source of truth
            try {
                categoryStyles = JSON.parse(localStorage.getItem('ald_category_styles') || '{}');
            } catch (e) {
                categoryStyles = {};
            }
            // Restore from cloud (fire and forget)
            _restoreCategoryStylesFromCloud().catch(function(){});
            _restoreHiddenCategoriesFromCloud().catch(function(){});
            for (const [category, items] of Object.entries(customItems)) {
                if (category === '__choiceGroupTemplates') continue;
                if (!Array.isArray(items)) continue; // skip corrupted entries
                if (!pricingDatabase[category]) pricingDatabase[category] = [];
                items.forEach(item => {
                    if (!pricingDatabase[category].find(e => e._custom && e.name === item.name)) {
                        pricingDatabase[category].push({ ...item, _custom: true });
                    }
                });
            }
            loadItemOverrides();
        }

        function saveCustomItems(showToast) {
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
            localStorage.setItem('ald_category_styles', JSON.stringify(categoryStyles));
            _saveCategoryStylesToCloud().catch(function(){});
            // Backup using inline function (guaranteed available)
            _doBackupItemsToCloud(customItems).then(function(result) {
                    if (showToast) {
                        var msg = result && result.error ? '❌ Cloud save failed - saved locally only' : '✅ Items saved to cloud!';
                        var color = result && result.error ? '#dc3545' : '#198754';
                        var toast = document.createElement('div');
                        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + color + ';color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                        toast.innerHTML = msg;
                        document.body.appendChild(toast);
                        setTimeout(function(){ toast.remove(); }, 3000);
                    }
                });
        }

        function populateNewItemCategorySelect(selectedCat) {
            const catSelect = document.getElementById('newItemCategory');
            if (!catSelect) return;
            const categories = Object.keys(pricingDatabase || {}).sort(function(a, b) {
                return a.localeCompare(b);
            });
            catSelect.innerHTML = '';
            categories.forEach(function(cat) {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSelect.appendChild(opt);
            });
            const createOpt = document.createElement('option');
            createOpt.value = CREATE_NEW_CATEGORY_VALUE;
            createOpt.textContent = '+ Create new category...';
            catSelect.appendChild(createOpt);
            if (selectedCat && categories.indexOf(selectedCat) >= 0) {
                catSelect.value = selectedCat;
            } else if (categories.length) {
                catSelect.value = categories[0];
            }
            catSelect.dataset.previousCategory = catSelect.value !== CREATE_NEW_CATEGORY_VALUE ? catSelect.value : '';
        }

        async function addNewCategory() {
            const newCat = (await qdPrompt('Enter new category name:', '', {
                title: 'New Category'
            }) || '').trim();
            if (!newCat || newCat.length === 0) return null;
            const existing = Object.keys(pricingDatabase || {}).find(function(cat) {
                return cat.toLowerCase() === newCat.toLowerCase();
            });
            if (existing) {
                qdAlert('Category already exists!');
                populateNewItemCategorySelect(existing);
                return existing;
            }
            pricingDatabase[newCat] = [];
            populateNewItemCategorySelect(newCat);
            return newCat;
        }

        async function addNewUnitType() {
            const newUnit = (await qdPrompt('Enter new unit type (e.g., "bundle", "bag", "gallon"):', '', {
                title: 'New Unit Type'
            }) || '').trim();
            if (!newUnit || newUnit.length === 0) return;
            const datalist = document.getElementById('unitTypeOptions');
            if ([...datalist.children].find(opt => opt.value === newUnit)) { qdAlert('Unit type already exists!'); return; }
            const opt = document.createElement('option');
            opt.value = newUnit;
            datalist.appendChild(opt);
            // Also set it in the input
            document.getElementById('newItemUnit').value = newUnit;
        }

        async function handleCategoryChange() {
            const catSelect = document.getElementById('newItemCategory');
            if (!catSelect) return;
            if (catSelect.value === CREATE_NEW_CATEGORY_VALUE) {
                const previous = catSelect.dataset.previousCategory || '';
                const created = await addNewCategory();
                if (!created) populateNewItemCategorySelect(previous);
                return;
            }
            catSelect.dataset.previousCategory = catSelect.value;
        }

        function handleItemPhotoUpload(input) {
            var file = input.files[0];
            if (!file) return;
            var cat = input.dataset.cat, name = input.dataset.name, field = input.dataset.field || 'photo';
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var maxDim = 600;
                    var w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                        else { w = Math.round(w * maxDim / h); h = maxDim; }
                    }
                    var canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    // Find item in customItems and pricingDatabase
                    var targets = [customItems, pricingDatabase];
                    targets.forEach(function(db) {
                        if (!db[cat]) return;
                        var item = db[cat].find(function(it) { return it && it.name === name; });
                        if (!item) return;
                        if (field === 'upgradePhoto') {
                            if (!item.upgrade) item.upgrade = {};
                            item.upgrade.photo = dataUrl;
                        } else {
                            item.photo = dataUrl;
                        }
                    });
                    markPricingDirty();
                    renderAllItemsList();
                    var t = document.createElement('div');
                    t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#198754;color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                    t.innerHTML = '<i class="fas fa-camera me-2"></i>Photo added! Don\'t forget to save.';
                    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 3000);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function openManageItemsModal() {
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('manage_items_opened', { source: 'quote_builder' });
            }
            // Always re-inject customItems into pricingDatabase before rendering
            if (typeof customItems === 'object' && typeof _injectItemsIntoPricingDB === 'function') {
                _injectItemsIntoPricingDB(customItems);
            }
            const catSelect = document.getElementById('newItemCategory');
            if (!catSelect) { console.error('newItemCategory not found'); return; }
            loadManageItemsCategoryState();
            populateNewItemCategorySelect(catSelect.value);
            document.getElementById('newItemName').value = '';
            document.getElementById('newItemUnit').value = '';
            document.getElementById('newItemRate').value = '';
            document.getElementById('newItemMaterialCost').value = '';
            document.getElementById('newItemSupplierUrl').value = '';
            const addPanel = document.getElementById('manageNewItemPanel');
            const addIcon = document.getElementById('toggleAddItemPanelIcon');
            if (addPanel) addPanel.style.display = 'none';
            if (addIcon) addIcon.className = 'fas fa-chevron-down';
            clearPricingDirty();
            const searchEl = document.getElementById('itemSearchFilter');
            if (searchEl) searchEl.value = '';
            setManageItemsFilter('all', { skipFilter: true });
            renderAllItemsList();
            toggleManageItemsTopBar(false);
            toggleManageItemsBottomBar(false);
            initManageItemsFooterSwipe();
            bindManageItemsFooterButtons();
            syncManageItemsUndoButtons();
(bootstrap.Modal.getInstance(document.getElementById('manageItemsModal')) || new bootstrap.Modal(document.getElementById('manageItemsModal'))).show();
        }

        function toggleManageNewItemPanel(forceOpen) {
            const panel = document.getElementById('manageNewItemPanel');
            const icon = document.getElementById('toggleAddItemPanelIcon');
            if (!panel) return;
            const open = forceOpen === true || (forceOpen !== false && panel.style.display === 'none');
            panel.style.display = open ? 'block' : 'none';
            if (icon) icon.className = open ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            if (open) {
                setTimeout(function() {
                    document.getElementById('newItemName')?.focus();
                }, 0);
                if (typeof window.notifyBuilderGuideNewItemPanelOpened === 'function') {
                    window.notifyBuilderGuideNewItemPanelOpened();
                }
            }
        }

        function hideManageItemsModal() {
            const modalEl = document.getElementById('manageItemsModal');
            if (!modalEl) return;
            try {
                if (window.bootstrap && bootstrap.Modal) {
                    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
                    return;
                }
            } catch(e) {
                console.warn('Bootstrap could not close Manage Items modal:', e);
            }
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
            modalEl.removeAttribute('aria-modal');
            document.querySelectorAll('.modal-backdrop').forEach(function(backdrop) { backdrop.remove(); });
            if (!document.querySelector('.modal.show')) {
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
            }
        }

        async function closeManageItemsModal() {
            if (pricingDirty) {
                const choice = await qdConfirm('You have unsaved pricing changes. Save all changes before closing?', {
                    title: 'Unsaved Pricing Changes',
                    okText: 'Save & Close',
                    cancelText: 'Close Without Saving',
                    okClass: 'btn-warning',
                    type: 'warning'
                });
                if (choice) {
                    saveAllPricingRows();
                }
            }
            clearPricingDirty();
            hideManageItemsModal();
        }

        let pricingDirty = false; // tracks unsaved changes in Manage Items modal
        let lastDeletedItem = null; // for undo functionality
        var undoStack = [];
        let manageItemsFooterSwipeInitialized = false;
        function syncManageItemsUndoButtons() {
            const hasUndo = undoStack.length > 0;
            const buttonConfigs = [
                {
                    id: 'undoManageItemsBtn',
                    enabledClass: 'btn btn-sm btn-danger ms-auto me-2',
                    disabledClass: 'btn btn-sm btn-outline-secondary ms-auto me-2'
                },
                {
                    id: 'undoManageItemsFooterBtn',
                    enabledClass: 'btn btn-sm btn-warning text-nowrap qd-manage-footer-btn',
                    disabledClass: 'btn btn-sm btn-outline-secondary text-nowrap qd-manage-footer-btn'
                }
            ];
            buttonConfigs.forEach(config => {
                const btn = document.getElementById(config.id);
                if (!btn) return;
                btn.disabled = !hasUndo;
                btn.className = hasUndo ? config.enabledClass : config.disabledClass;
                if (config.id === 'undoManageItemsFooterBtn') {
                    btn.style.padding = '2px 8px';
                    btn.style.lineHeight = '1.2';
                }
            });
        }
        function toggleManageItemsTopBar(hidden) {
            const topBar = document.getElementById('manageItemsTopBar');
            const addShell = document.querySelector('#manageItemsModal .manage-items-add-shell');
            const itemToolbar = document.getElementById('itemListTopAnchor');
            const itemList = document.getElementById('customItemsList');
            const footerUndo = document.getElementById('undoManageItemsFooterBtn');
            const showTopBarBtn = document.getElementById('showManageItemsTopBarBtn');
            const modal = document.getElementById('manageItemsModal');
            if (topBar) topBar.style.display = hidden ? 'none' : '';
            if (addShell) addShell.style.display = hidden ? 'none' : '';
            if (itemToolbar) itemToolbar.style.display = hidden ? 'none' : '';
            if (itemList) itemList.style.maxHeight = hidden ? 'calc(80vh - 110px)' : '460px';
            if (footerUndo) footerUndo.style.display = hidden ? '' : 'none';
            if (showTopBarBtn) showTopBarBtn.style.display = hidden ? '' : 'none';
            if (modal) modal.classList.toggle('manage-items-top-hidden', hidden);
            syncManageItemsUndoButtons();
        }
        function toggleManageItemsBottomBar(hidden) {
            const footer = document.getElementById('manageItemsFooterBar');
            const pullTab = document.getElementById('manageItemsFooterPullTab');
            const modal = document.getElementById('manageItemsModal');
            if (footer) {
                if (hidden) {
                    footer.style.setProperty('display', 'none', 'important');
                } else {
                    footer.style.removeProperty('display');
                }
            }
            if (pullTab) pullTab.style.display = hidden ? 'flex' : 'none';
            if (modal) modal.classList.toggle('manage-items-footer-hidden', hidden);
        }
        function initManageItemsFooterSwipe() {
            if (manageItemsFooterSwipeInitialized) return;
            const footer = document.getElementById('manageItemsFooterBar');
            const pullTab = document.getElementById('manageItemsFooterPullTab');
            if (!footer || !pullTab) return;
            manageItemsFooterSwipeInitialized = true;

            let footerStartY = null;
            let pullStartY = null;

            footer.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' || e.target.closest('button,input,select,textarea,a')) return;
                footerStartY = e.clientY;
                footer.setPointerCapture?.(e.pointerId);
            });
            footer.addEventListener('pointerup', function(e) {
                if (footerStartY === null) return;
                const dragDistance = e.clientY - footerStartY;
                footerStartY = null;
                if (dragDistance > 28) {
                    e.preventDefault();
                    toggleManageItemsBottomBar(true);
                }
            });
            footer.addEventListener('pointercancel', function() {
                footerStartY = null;
            });

            pullTab.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                pullStartY = e.clientY;
                pullTab.setPointerCapture?.(e.pointerId);
            });
            pullTab.addEventListener('pointerup', function(e) {
                if (pullStartY === null) return;
                const dragDistance = pullStartY - e.clientY;
                pullStartY = null;
                if (dragDistance > 18) {
                    e.preventDefault();
                    toggleManageItemsBottomBar(false);
                }
            });
            pullTab.addEventListener('pointercancel', function() {
                pullStartY = null;
            });
        }
        function bindManageItemsFooterButtons() {
            const saveBtn = document.getElementById('saveAllPricingFooterBtn');
            const saveChangedBtn = document.getElementById('saveChangedPricingFooterBtn');
            const closeBtn = document.getElementById('closeManageItemsFooterBtn');
            if (saveChangedBtn && !saveChangedBtn.dataset.boundManageFooter) {
                saveChangedBtn.dataset.boundManageFooter = '1';
                saveChangedBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveChangedPricingRows();
                });
            }
            if (saveBtn && !saveBtn.dataset.boundManageFooter) {
                saveBtn.dataset.boundManageFooter = '1';
                saveBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveAllPricingRows();
                });
            }
            if (closeBtn && !closeBtn.dataset.boundManageFooter) {
                closeBtn.dataset.boundManageFooter = '1';
                closeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeManageItemsModal();
                });
            }
        }
        function pushUndoState() {
            if (undoStack.length >= 20) undoStack.shift();
            undoStack.push(JSON.parse(JSON.stringify(customItems)));
            syncManageItemsUndoButtons();
        }
        function undoManageItems() {
            if (undoStack.length > 0) {
                customItems = undoStack.pop();
                _injectItemsIntoPricingDB(customItems);
                renderAllItemsList();
                saveCustomItems();
                syncManageItemsUndoButtons();
            }
        }

        function getManageRowByKey(rowKey) {
            if (!rowKey) return null;
            const container = document.getElementById('customItemsList');
            if (!container) return null;
            return Array.from(container.querySelectorAll('tr.manage-items-row')).find(function(row) {
                return row.dataset.rowKey === rowKey;
            }) || null;
        }

        function updatePricingDirtyIndicator() {
            pricingDirty = pricingOtherDirty || dirtyPricingRows.size > 0;
            const indicator = document.getElementById('pricingUnsavedIndicator');
            if (indicator) {
                if (pricingDirty) {
                    indicator.style.display = 'inline';
                    indicator.textContent = dirtyPricingRows.size > 0
                        ? dirtyPricingRows.size + ' unsaved row' + (dirtyPricingRows.size === 1 ? '' : 's')
                        : 'Unsaved changes';
                } else {
                    indicator.style.display = 'none';
                    indicator.textContent = 'Unsaved changes';
                }
            }
            document.querySelectorAll('.manage-items-filter-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.dataset.itemFilter === manageItemsFilter);
            });
        }

        function setRowDirtyState(rowKey, isDirty) {
            const row = getManageRowByKey(rowKey);
            const details = row ? document.getElementById(row.dataset.detailsId || '') : null;
            [row, details].forEach(function(el) {
                if (el) el.classList.toggle('manage-item-dirty', !!isDirty);
            });
        }

        function markPricingDirty(source) {
            let rowKey = '';
            if (source && source.closest) {
                const row = source.closest('tr[data-row-key]');
                if (row) rowKey = row.dataset.rowKey || '';
            }
            if (rowKey) {
                dirtyPricingRows.add(rowKey);
                setRowDirtyState(rowKey, true);
            } else {
                pricingOtherDirty = true;
            }
            updatePricingDirtyIndicator();
            if (manageItemsFilter === 'unsaved') filterItemsList();
        }

        function markRowDirty(rowKey) {
            if (!rowKey) return;
            dirtyPricingRows.add(rowKey);
            setRowDirtyState(rowKey, true);
            updatePricingDirtyIndicator();
            if (manageItemsFilter === 'unsaved') filterItemsList();
        }

        function clearRowDirty(rowKey) {
            if (!rowKey) return;
            dirtyPricingRows.delete(rowKey);
            setRowDirtyState(rowKey, false);
            updatePricingDirtyIndicator();
        }

        function clearPricingDirty() {
            dirtyPricingRows.forEach(function(rowKey) { setRowDirtyState(rowKey, false); });
            dirtyPricingRows.clear();
            pricingOtherDirty = false;
            updatePricingDirtyIndicator();
        }

        function saveItemRow(cat, name) {
            pushUndoState();
            return saveItemRowCore(cat, name, { backup: true, flash: true });
        }

        function saveItemRowCore(cat, name, options) {
            options = options || {};
            const rowKey = manageItemsRowKey(cat, name);
            const safeId = manageItemsSafeId(cat, name);
            const row = document.getElementById('row_' + safeId);
            if (!row) return false;

            // Read all field values from the row
            const newName     = row.querySelector('input.item-name-input')?.value.trim() || name;
            const inputs      = row.querySelectorAll('input.item-input');
            const unitType    = inputs[0]?.value.trim() || '';
            const rate        = parseFloat(inputs[1]?.value) || 0;
            const detailsRow  = document.getElementById('details_' + safeId);
            const detailMaterialInput = detailsRow?.querySelector('.item-detail-material-cost');
            const detailSupplierInput = detailsRow?.querySelector('.item-detail-supplier-url');
            const matCost     = parseFloat(detailMaterialInput?.value || inputs[2]?.value) || 0;
            const supplierUrl = (detailSupplierInput?.value || inputs[3]?.value || '').trim();
            const itemDescription = detailsRow?.querySelector('.item-description-textarea')?.value.trim() || '';
            const laborMode = detailsRow?.querySelector('.item-labor-mode')?.value || '';
            const laborTime = {
                mode: laborMode,
                unitsPerHour: parseFloat(detailsRow?.querySelector('.item-units-per-hour')?.value || 0) || 0,
                fixedHours: parseFloat(detailsRow?.querySelector('.item-fixed-hours')?.value || 0) || 0,
                crewSize: Math.max(1, parseFloat(detailsRow?.querySelector('.item-crew-size')?.value || 1) || 1)
            };
            const collapseRow = detailsRow;
            let upgrade = null;
            let hasUpgradeEditor = false;
            if (collapseRow) {
                hasUpgradeEditor = true;
                const upgName = collapseRow.querySelector('.upgrade-name')?.value.trim() || '';
                const upgUnitType = collapseRow.querySelector('.upgrade-unit-type')?.value.trim() || '';
                const upgRate = parseFloat(collapseRow.querySelector('.upgrade-rate')?.value) || 0;
                const upgMaterialCost = parseFloat(collapseRow.querySelector('.upgrade-material-cost')?.value) || 0;
                const upgSupplierUrl = collapseRow.querySelector('.upgrade-supplier-url')?.value.trim() || '';
                const upgDesc = collapseRow.querySelector('.upgrade-desc')?.value.trim() || '';
                if (upgName) upgrade = { name: upgName, unitType: upgUnitType, rate: upgRate, materialCost: upgMaterialCost, supplierUrl: upgSupplierUrl, description: upgDesc };
            }

            // Ensure category exists in customItems
            if (!customItems[cat]) customItems[cat] = [];

            // Find existing item by original name
            let ci = customItems[cat].find(i => i.name === name);
            let hadSavedItemForQuoteSync = !!ci;
            if (!ci) {
                // Not in customItems yet - check pricingDatabase and adopt it
                const pi = pricingDatabase[cat]?.find(i => i.name === name);
                if (pi) {
                    hadSavedItemForQuoteSync = true;
                    ci = { name: pi.name, unitType: pi.unitType || '', rate: pi.rate || 0, materialCost: pi.materialCost || 0, supplierUrl: pi.supplierUrl || '', itemDescription: pi.itemDescription || '', laborTime: normalizeManageLaborTime(pi.laborTime) };
                    customItems[cat].push(ci);
                } else {
                    // Brand new item
                    ci = { name, unitType: '', rate: 0, materialCost: 0, supplierUrl: '', itemDescription: '', laborTime: normalizeManageLaborTime() };
                    customItems[cat].push(ci);
                }
            }
            const beforeQuoteSyncItem = hadSavedItemForQuoteSync ? ((typeof cloneSavedItemForQuoteSync === 'function') ? cloneSavedItemForQuoteSync(ci) : JSON.parse(JSON.stringify(ci || {}))) : null;

            // Overwrite all fields in place
            ci.name            = newName;
            ci.unitType        = unitType;
            ci.rate            = rate;
            ci.materialCost    = matCost;
            ci.supplierUrl     = supplierUrl;
            ci.itemDescription = itemDescription;
            ci.laborTime       = normalizeManageLaborTime(laborTime);
            if (upgrade !== null) {
                // Preserve upgrade photo from previous state
                var oldUpgPhoto = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.upgrade?.photo;
                if (!upgrade.photo && oldUpgPhoto) upgrade.photo = oldUpgPhoto;
                ci.upgrade = upgrade;
            } else if (hasUpgradeEditor) {
                delete ci.upgrade;
            }
            // Preserve item photo from previous state
            if (!ci.photo) {
                var oldPhoto = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.photo;
                if (oldPhoto) ci.photo = oldPhoto;
            }
            if (beforeQuoteSyncItem && typeof recordSavedItemQuoteChange === 'function' && typeof getSavedItemFingerprintForQuoteSync === 'function') {
                recordSavedItemQuoteChange(cat, name, beforeQuoteSyncItem, ci);
            }

            // Mirror into pricingDatabase
            if (!pricingDatabase[cat]) pricingDatabase[cat] = [];
            const pi = pricingDatabase[cat].find(i => i.name === name);
            if (pi) {
                Object.assign(pi, ci, { _custom: true });
                if (hasUpgradeEditor && upgrade === null) delete pi.upgrade;
            }

            // Save to localStorage
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));

            // Flash row green
            if (options.flash !== false) {
                row.style.transition = 'background 0.3s';
                row.style.background = '#d1e7dd';
                setTimeout(() => { row.style.background = ''; }, 900);
            }
            if (options.clearDirty !== false) {
                clearRowDirty(rowKey);
                if (dirtyPricingRows.size === 0 && !pricingOtherDirty) updatePricingDirtyIndicator();
            }

            // Save to cloud and show result
            if (options.backup !== false) _doBackupItemsToCloud(customItems).then(function(r) {
                var ok = r && !r.error;
                var toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + (ok ? '#198754' : '#dc3545') + ';color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                toast.innerHTML = ok ? '\u2705 Saved to cloud!' : '\u274c Cloud save failed';
                document.body.appendChild(toast);
                setTimeout(function(){ toast.remove(); }, 2500);
            }).catch(function() {});
            return true;
        }

        // Inline restore function
        async function _doRestoreItemsFromCloud() {
            const { data: { user }, error: authErr } = await _supabase.auth.getUser();
            if (authErr || !user) return { error: 'Not authenticated' };
            const { data, error } = await _supabase.from('quotes').select('data,updated_at').eq('user_id', user.id).eq('quote_number', '__ITEMS_BACKUP__').single();
            if (!error && data) {
                try {
                    const snapshot = JSON.parse(data.data.items_snapshot || '{}');
                    if (Object.keys(snapshot).length > 0) return { data: snapshot };
                } catch(e) {}
            }
            return { error: 'No backup found' };
        }

        // Inline backup function - guaranteed available regardless of supabase-v2.js load order
        async function _doBackupItemsToCloud(itemsObj) {
            const { data: { user }, error: authErr } = await _supabase.auth.getUser();
            if (authErr || !user) return { error: 'Not authenticated' };
            const snapshot = JSON.stringify(itemsObj || {});
            const payload = { user_id: user.id, client_name: '__ITEMS_BACKUP__', quote_number: '__ITEMS_BACKUP__', status: 'backup', data: { items_snapshot: snapshot, backed_up_at: new Date().toISOString() }, updated_at: new Date().toISOString() };
            const { data, error } = await _supabase.from('quotes').upsert(payload, { onConflict: 'user_id,quote_number' }).select();
            if (error) { console.error('[Backup] error:', error); return { error }; }
            console.log('[Backup] saved:', Object.keys(itemsObj || {}).length, 'categories');
            return { data };
        }

        function saveAllPricingRows() {
            // Show spinner toast immediately
            const spinnerToast = document.createElement('div');
            spinnerToast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1a2940;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;';
            spinnerToast.innerHTML = '\u23f3 Saving... <span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite;"></span>';
            document.body.appendChild(spinnerToast);
            if (!document.getElementById('qd-spin-style')) {
                const style = document.createElement('style');
                style.id = 'qd-spin-style';
                style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }
            const container = document.getElementById('customItemsList');
            if (container) {
                pushUndoState();
                container.querySelectorAll('tr[id^="row_"]').forEach(row => {
                    const saveBtn = row.querySelector('.item-save-btn');
                    if (!saveBtn) return;
                    const cat = saveBtn.dataset.cat;
                    const name = saveBtn.dataset.name;
                    if (cat && name) saveItemRowCore(cat, name, { backup: false, flash: false });
                });
            }
            clearPricingDirty();
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
            // Start cloud save — clear spinner on success, only show failure if it actually errors
            var failureShown = false;
            const failureTimeout = setTimeout(function() {
                if (!failureShown) {
                    failureShown = true;
                    spinnerToast.remove();
                    var toast = document.createElement('div');
                    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#dc3545;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                    toast.innerHTML = '\u274c Saved locally - cloud sync timed out';
                    document.body.appendChild(toast);
                    setTimeout(function(){ toast.remove(); }, 3500);
                }
            }, 17000);
            _doBackupItemsToCloud(customItems).then(function(result) {
                clearTimeout(failureTimeout);
                if (failureShown) return; // timeout already showed failure, don't double-toast
                spinnerToast.remove();
                var ok = result && !result.error;
                var toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + (ok ? '#198754' : '#dc3545') + ';color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                toast.innerHTML = ok ? '\u2705 All items saved to cloud!' : '\u274c Saved locally - cloud sync failed';
                document.body.appendChild(toast);
                setTimeout(function(){ toast.remove(); }, 3500);
            }).catch(function() {
                clearTimeout(failureTimeout);
                if (!failureShown) {
                    spinnerToast.remove();
                    var toast = document.createElement('div');
                    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#dc3545;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                    toast.innerHTML = '\u274c Saved locally - cloud sync failed';
                    document.body.appendChild(toast);
                    setTimeout(function(){ toast.remove(); }, 3500);
                }
            });
        }

        function whizzScroll(containerId, direction) {
            const el = document.getElementById(containerId);
            if (!el) return;
            const start = el.scrollTop;
            const end = direction === 'top' ? 0 : el.scrollHeight;
            const distance = end - start;
            if (distance === 0) return;
            const duration = 380; // ms - fast enough to "whizz", slow enough to see it fly
            const startTime = performance.now();
            // Ease-in-out cubic for a satisfying whizz
            function easeInOutCubic(t) {
                return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
            }
            function step(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                el.scrollTop = start + distance * easeInOutCubic(progress);
                if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        function setManageItemsFilter(filter, options) {
            manageItemsFilter = filter || 'all';
            document.querySelectorAll('.manage-items-filter-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.dataset.itemFilter === manageItemsFilter);
            });
            if (!options || !options.skipFilter) filterItemsList();
        }

        function rowMatchesManageFilter(row, q) {
            if (!row) return false;
            const rowKey = row.dataset.rowKey || '';
            const blob = (row.dataset.search || '').toLowerCase();
            const matchesSearch = !q || blob.includes(q);
            if (!matchesSearch) return false;
            if (manageItemsFilter === 'unsaved') return dirtyPricingRows.has(rowKey);
            if (manageItemsFilter === 'custom') return row.dataset.custom === '1';
            if (manageItemsFilter === 'has-upgrade') return row.dataset.hasUpgrade === '1';
            if (manageItemsFilter === 'missing-material') return row.dataset.missingMaterial === '1';
            if (manageItemsFilter === 'no-description') return row.dataset.noDescription === '1';
            return true;
        }

        function filterItemsList() {
            const q = (document.getElementById('itemSearchFilter')?.value || '').toLowerCase().trim();
            const container = document.getElementById('customItemsList');
            if (!container) return;
            let visibleRows = 0;

            container.querySelectorAll('.manage-items-category').forEach(function(section) {
                let anyVisible = false;
                const body = section.querySelector('.manage-items-category-body');
                const hasActiveSearchOrFilter = !!q || manageItemsFilter !== 'all';
                section.querySelectorAll('tr.manage-items-row').forEach(function(row) {
                    const show = rowMatchesManageFilter(row, q);
                    const details = document.getElementById(row.dataset.detailsId || '');
                    row.style.display = show ? '' : 'none';
                    if (details && !show) details.style.display = 'none';
                    if (show) {
                        anyVisible = true;
                        visibleRows++;
                    }
                });
                section.style.display = anyVisible ? '' : 'none';
                if (body && anyVisible) {
                    body.style.display = (hasActiveSearchOrFilter || getManageItemsCategoryOpen(section.dataset.category)) ? '' : 'none';
                }
            });

            let empty = document.getElementById('manageItemsEmptyFilter');
            if (!empty) {
                empty = document.createElement('div');
                empty.id = 'manageItemsEmptyFilter';
                empty.className = 'manage-empty-filter';
                empty.textContent = 'No items match this search or filter.';
                container.appendChild(empty);
            }
            empty.style.display = visibleRows === 0 ? '' : 'none';
            updatePricingDirtyIndicator();
        }

        function renderAllItemsList() {
            const container = document.getElementById('customItemsList');
            let html = '';
            var choiceGroupTemplates = (customItems && Array.isArray(customItems.__choiceGroupTemplates)) ? customItems.__choiceGroupTemplates : [];
            if (choiceGroupTemplates.length) {
                html += '<div class="alert alert-primary py-2 mb-2"><div class="fw-bold mb-1"><i class="fas fa-layer-group me-1"></i>Reusable Choice Groups</div>';
                choiceGroupTemplates.forEach(function(group) {
                    html += '<div class="small d-flex justify-content-between border-top pt-1 mt-1"><span><strong>' + (group.name || 'Choice Group') + '</strong> <span class="text-muted">(' + (group.type === 'multiple' ? 'Pick Multiple' : 'Pick One') + ', ' + ((group.options || []).length) + ' options)</span></span><span>' + (group.options || []).map(function(option) { return option.name; }).join(' / ') + '</span></div>';
                });
                html += '</div>';
            }

            Object.entries(pricingDatabase).forEach(([cat, items]) => {
                if (!items.length) return;
                const catSty = categoryStyles[cat] || {};
                const cIcon = catSty.icon || 'fa-tag';
                const cColor = catSty.color || '#f0f4ff';
                const catEsc = cat.replace(/'/g, "\\'");
                const catIconMarkup = typeof renderCategoryIconMarkup === 'function'
                    ? renderCategoryIconMarkup(cIcon, '', 'color:#495057;')
                    : `<i class="fas ${cIcon}" style="color:#495057;"></i>`;
                html += `<div class="d-flex align-items-center gap-2 mt-3 mb-1 px-2 py-1 rounded" style="background:${cColor};">
                  ${catIconMarkup}
                  <h6 class="fw-bold mb-0 text-primary" style="flex:1;">${cat}</h6>
                  <button class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem; padding:1px 8px;" onclick="openCategoryStylePicker('${catEsc}', this)" title="Customize icon &amp; colour">
                    <i class="fas fa-palette me-1"></i>Style
                  </button>
                </div>`;
                html += '<table class="table table-sm table-bordered mb-2"><thead class="table-light"><tr><th>Name</th><th style="width:80px">Unit</th><th style="width:90px">Rate ($)</th><th style="width:100px">Mat. Cost ($)</th><th>Supplier URL <button type="button" class="qd-inline-help-btn" title="Help with supplier URLs" aria-label="Help with supplier URLs" onclick="if(window.QuoteDrModalHelp){QuoteDrModalHelp.openInline(&quot;supplierUrl&quot;);} return false;"><i class="fas fa-question"></i></button></th><th style="width:110px"></th></tr></thead><tbody>';
                items.forEach(item => {
                    if (!item || !item.name) return; // skip malformed items
                    const safeId = (cat + '_' + item.name).replace(/[^a-z0-9]/gi,'_');
                    const isCustom = !!item._custom;
                    const rate = parseFloat(item.rate || 0).toFixed(2);
                    const matCost = parseFloat(item.materialCost || 0).toFixed(2);
                    const supplier = (item.supplierUrl || '').replace(/"/g,'&quot;');
                    const catE = cat.replace(/"/g,'&quot;');
                    const nameE = item.name.replace(/"/g,'&quot;');
                    const upg = item.upgrade || {};
                    const upgName = (upg.name || '').replace(/"/g,'&quot;');
                    const upgUnitType = (upg.unitType || upg.unit || '').replace(/"/g,'&quot;');
                    const upgRate = parseFloat(upg.rate || 0).toFixed(2);
                    const upgMaterialCost = parseFloat(upg.materialCost || 0).toFixed(2);
                    const upgSupplierUrl = (upg.supplierUrl || '').replace(/"/g,'&quot;');
                    const upgDesc = (upg.description || '').replace(/"/g,'&quot;');
                    const hasUpgrade = !!upg.name;
                    const collapseId = 'upg_' + safeId;
                    html += `<tr id="row_${safeId}">
                        <td>
                            <input type="text" class="form-control form-control-sm item-name-input" style="margin-bottom:6px;" value="${item.name.replace(/"/g,'&quot;')}" placeholder="Item name" oninput="markPricingDirty()">
                            <button class="btn btn-xs btn-sm btn-outline-warning upgrade-toggle-btn" data-target="${collapseId}" title="${hasUpgrade ? 'Edit upgrade option' : 'Add upgrade option'}" style="font-size:0.65em; padding:1px 6px; touch-action:manipulation;">
                                ${hasUpgrade ? '⬆ Edit Upgrade' : '+ Add Upgrade'}
                            </button>
                        </td>
                        <td><input type="text" class="form-control form-control-sm item-input" value="${item.unitType}" oninput="markPricingDirty()"></td>
                        <td><input type="number" class="form-control form-control-sm item-input" value="${rate}" step="0.01" min="0" oninput="markPricingDirty()"></td>
                        <td><input type="number" class="form-control form-control-sm item-input" value="${matCost}" step="0.01" min="0" oninput="markPricingDirty()"></td>
                        <td>
                            <div class="input-group input-group-sm">
                                <input type="url" class="form-control item-input" value="${supplier}" placeholder="https://..." oninput="markPricingDirty()">
                                <button type="button" class="btn btn-outline-secondary" title="Help with supplier URLs" aria-label="Help with supplier URLs" onclick="if(window.QuoteDrModalHelp){QuoteDrModalHelp.openInline('supplierUrl');} return false;"><i class="fas fa-question"></i></button>
                            </div>
                        </td>
                        <td>
                            <div class="d-flex gap-1 flex-wrap">
                                <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="photo" title="Add photo" style="touch-action:manipulation;font-size:0.75em;"><i class="fas fa-camera"></i></button>
                                <button class="btn btn-sm btn-info description-toggle-btn" data-target="desc_${safeId}" title="Show/edit description" style="touch-action:manipulation"><i class="fas fa-align-left"></i> Desc</button>
                                <button class="btn btn-sm btn-success item-save-btn" data-cat="${catE}" data-name="${nameE}" title="Save this row" style="touch-action:manipulation"><i class="fas fa-save"></i></button>
                                ${isCustom ? `<button class="btn btn-sm btn-danger item-delete-btn" data-cat="${catE}" data-name="${nameE}" title="Delete" style="touch-action:manipulation"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                            ${item.photo ? `<img src="${item.photo}" class="mt-1 rounded" style="max-width:60px;max-height:40px;cursor:pointer;" onclick="openPhotoLightbox(this.src)" title="Click to enlarge">` : ''}
                        </td>
                    </tr>
                    <tr id="desc_${safeId}" style="display:none; background:#e7f3ff;" data-cat="${catE}" data-name="${nameE}">
                        <td colspan="6">
                            <div class="p-2">
                                <div class="d-flex justify-content-between align-items-center gap-2">
                                    <small class="text-info fw-bold"><i class="fas fa-align-left"></i> Item Description (shown to clients on interactive quote)</small>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-secondary undo-refine-desc-btn" onclick="toggleRefinedDescription(this)" title="Undo AI refined description" style="display:none;font-size:0.75rem;padding:2px 7px;"><i class="fas fa-undo"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI Refine</button>
                                    </div>
                                </div>
                                <textarea class="form-control form-control-sm item-description-textarea mt-2" rows="3" placeholder="e.g., Complete drywall installation including hanging, mudding, taping, sanding and priming. Professional finish ready for paint." spellcheck="true" oninput="markPricingDirty()">${item.itemDescription || ''}</textarea>
                            </div>
                        </td>
                    </tr>
                    <tr id="${collapseId}" style="display:none; background:#fffbea;">
                        <td colspan="6">
                            <div class="p-2">
                                <small class="text-warning fw-bold"><i class="fas fa-arrow-up"></i> Upgrade Option</small>
                                <div class="row g-2 mt-1 align-items-end">
                                    <div class="col-md-3">
                                        <label class="form-label" style="font-size:0.75em">Upgrade Name</label>
                                        <input type="text" class="form-control form-control-sm upgrade-name" value="${upgName}" placeholder="e.g., Tall Baseboard 5.5&quot;" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label" style="font-size:0.75em">Unit</label>
                                        <input type="text" class="form-control form-control-sm upgrade-unit-type" value="${upgUnitType}" list="unitTypeOptions" placeholder="LF, sq ft, each, Flatrate" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label" style="font-size:0.75em">Rate ($)</label>
                                        <input type="number" class="form-control form-control-sm upgrade-rate" value="${upgRate}" step="0.01" min="0" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label" style="font-size:0.75em">Mat. Cost ($)</label>
                                        <input type="number" class="form-control form-control-sm upgrade-material-cost" value="${upgMaterialCost}" step="0.01" min="0" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label" style="font-size:0.75em">Supplier URL</label>
                                        <input type="url" class="form-control form-control-sm upgrade-supplier-url" value="${upgSupplierUrl}" placeholder="https://..." oninput="markPricingDirty()">
                                    </div>
                                </div>
                                <div class="row g-2 mt-2">
                                    <div class="col-12">
                                        <div class="d-flex justify-content-between align-items-center gap-2">
                                            <label class="form-label mb-0" style="font-size:0.75em">Description (shown to client)</label>
                                            <div class="d-flex align-items-center gap-1">
                                                <button type="button" class="btn btn-sm btn-outline-secondary undo-refine-desc-btn" onclick="toggleRefinedDescription(this)" title="Undo AI refined description" style="display:none;font-size:0.75rem;padding:2px 7px;"><i class="fas fa-undo"></i></button>
                                                <button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI Refine</button>
                                            </div>
                                        </div>
                                        <input type="text" class="form-control form-control-sm upgrade-desc item-description-textarea mt-1" value="${upgDesc}" placeholder="e.g., Premium 5.5&quot; tall baseboard - a luxurious finishing touch" oninput="markPricingDirty()">
                                    </div>
                                </div>
                                <div class="mt-2">
                                    <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="upgradePhoto" title="Add upgrade photo" style="font-size:0.75em;"><i class="fas fa-camera me-1"></i>Upgrade Photo</button>
                                    ${upg.photo ? `<img src="${upg.photo}" class="ms-2 rounded" style="max-width:80px;max-height:50px;cursor:pointer;vertical-align:middle;" onclick="openPhotoLightbox(this.src)" title="Click to enlarge">` : ''}
                                </div>
                                <small class="text-muted">Leave name blank to remove upgrade option. Save the row above to save upgrade too.</small>
                            </div>
                        </td>
                    </tr>`;
                });
                html += '</tbody></table>';
            });

            container.innerHTML = html || '<p class="text-muted">No items found.</p>';

            // Event listeners handled via delegation on #customItemsList (see DOMContentLoaded)
        }

        function renderManageMarginPill(rateValue, materialValue) {
            const rate = parseFloat(rateValue || 0) || 0;
            const material = parseFloat(materialValue || 0) || 0;
            if (rate <= 0) return '<span class="manage-margin-pill manage-margin-warn"><i class="fas fa-exclamation-circle"></i> No rate</span>';
            if (material <= 0) return '<span class="manage-margin-pill manage-margin-warn"><i class="fas fa-box-open"></i> Cost missing</span>';
            const profit = rate - material;
            const pct = Math.round((profit / rate) * 100);
            if (profit < 0) return '<span class="manage-margin-pill manage-margin-bad"><i class="fas fa-triangle-exclamation"></i> Cost above rate</span>';
            return '<span class="manage-margin-pill manage-margin-good"><i class="fas fa-chart-line"></i> ' + pct + '% margin</span>';
        }

        function normalizeManageLaborTime(laborTime) {
            const source = laborTime || {};
            const mode = source.mode === 'fixed_hours' ? 'fixed_hours' : (source.mode === 'units_per_hour' ? 'units_per_hour' : '');
            return {
                mode,
                unitsPerHour: parseFloat(source.unitsPerHour || source.units_per_hour || 0) || 0,
                fixedHours: parseFloat(source.fixedHours || source.fixed_hours || 0) || 0,
                crewSize: Math.max(1, parseFloat(source.crewSize || source.crew_size || 1) || 1)
            };
        }

        function renderManageLaborPill(laborTime, unitType) {
            const labor = normalizeManageLaborTime(laborTime);
            if (!labor.mode) return '<span class="manage-margin-pill manage-margin-warn"><i class="fas fa-clock"></i> Time missing</span>';
            if (labor.mode === 'units_per_hour') {
                if (labor.unitsPerHour <= 0) return '<span class="manage-margin-pill manage-margin-warn"><i class="fas fa-clock"></i> Time missing</span>';
                return '<span class="manage-margin-pill manage-margin-good"><i class="fas fa-stopwatch"></i> ' + labor.unitsPerHour + ' ' + (unitType || 'units') + '/hr</span>';
            }
            if (labor.fixedHours <= 0) return '<span class="manage-margin-pill manage-margin-warn"><i class="fas fa-clock"></i> Time missing</span>';
            return '<span class="manage-margin-pill manage-margin-good"><i class="fas fa-clock"></i> ' + labor.fixedHours + ' hr/item</span>';
        }

        function syncManageDetailBaseField(inputEl) {
            const detailsRow = inputEl ? inputEl.closest('.item-details-row') : null;
            const rowKey = detailsRow ? detailsRow.getAttribute('data-row-key') : '';
            const row = rowKey ? getManageRowByKey(rowKey) : null;
            if (!row) return;
            const rowInputs = row.querySelectorAll('input.item-input');
            if (inputEl.classList.contains('item-detail-material-cost') && rowInputs[2]) {
                rowInputs[2].value = inputEl.value;
            }
            if (inputEl.classList.contains('item-detail-supplier-url') && rowInputs[3]) {
                rowInputs[3].value = inputEl.value;
            }
        }

        function renderAllItemsList() {
            const container = document.getElementById('customItemsList');
            let html = '';

            Object.entries(pricingDatabase).forEach(([cat, items]) => {
                if (!items.length) return;
                const catSty = categoryStyles[cat] || {};
                const cIcon = catSty.icon || 'fa-tag';
                const cColor = catSty.color || '#f0f4ff';
                const catJs = manageItemsAttr(JSON.stringify(cat));
                const catSafeId = manageItemsSafeId(cat, 'category');
                const isOpen = getManageItemsCategoryOpen(cat);
                const catIconMarkup = typeof renderCategoryIconMarkup === 'function'
                    ? renderCategoryIconMarkup(cIcon, '', 'color:#495057;')
                    : `<i class="fas ${manageItemsAttr(cIcon)}" style="color:#495057;"></i>`;

                html += `<section class="manage-items-category" data-category="${manageItemsAttr(cat)}">
                    <div class="manage-items-category-header" style="background:${manageItemsAttr(cColor)};">
                        <button type="button" class="manage-items-category-toggle" onclick="toggleManageItemsCategory(${catJs})" title="Collapse or expand ${manageItemsAttr(cat)}">
                            <i class="fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
                        </button>
                        ${catIconMarkup}
                        <h6 class="fw-bold mb-0 text-primary" style="flex:1;">${manageItemsEscape(cat)}</h6>
                        <span class="manage-items-category-count">${items.length}</span>
                        <button class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem; padding:1px 8px;" onclick="openCategoryStylePicker(${catJs}, this)" title="Customize icon and colour">
                            <i class="fas fa-palette me-1"></i>Style
                        </button>
                    </div>
                    <div class="manage-items-category-body" id="cat_body_${catSafeId}" style="${isOpen ? '' : 'display:none;'}">
                    <table class="table table-sm table-bordered mb-2 manage-items-table"><thead class="table-light"><tr><th>Name</th><th style="width:90px">Unit</th><th style="width:100px">Rate ($)</th><th style="width:115px">Mat. Cost ($)</th><th>Supplier URL <button type="button" class="qd-inline-help-btn" title="Help with supplier URLs" aria-label="Help with supplier URLs" onclick="if(window.QuoteDrModalHelp){QuoteDrModalHelp.openInline(&quot;supplierUrl&quot;);} return false;"><i class="fas fa-question"></i></button></th><th style="width:138px"></th></tr></thead><tbody>`;

                items.forEach(item => {
                    if (!item || !item.name) return;
                    const safeId = manageItemsSafeId(cat, item.name);
                    const rowKey = manageItemsRowKey(cat, item.name);
                    const isCustom = !!item._custom;
                    const rate = parseFloat(item.rate || 0).toFixed(2);
                    const matCost = parseFloat(item.materialCost || 0).toFixed(2);
                    const laborTime = normalizeManageLaborTime(item.laborTime);
                    const supplier = manageItemsAttr(item.supplierUrl || '');
                    const catE = manageItemsAttr(cat);
                    const nameE = manageItemsAttr(item.name);
                    const upg = item.upgrade || {};
                    const upgName = manageItemsAttr(upg.name || '');
                    const upgUnitType = manageItemsAttr(upg.unitType || upg.unit || '');
                    const upgRate = parseFloat(upg.rate || 0).toFixed(2);
                    const upgMaterialCost = parseFloat(upg.materialCost || 0).toFixed(2);
                    const upgSupplierUrl = manageItemsAttr(upg.supplierUrl || '');
                    const hasUpgrade = !!upg.name;
                    const noDescription = !(item.itemDescription || '').trim();
                    const missingMaterial = parseFloat(item.materialCost || 0) <= 0;
                    const detailsId = 'details_' + safeId;
                    const isDirty = dirtyPricingRows.has(rowKey);
                    const searchBlob = [
                        cat, item.name, item.unitType, item.supplierUrl, item.itemDescription,
                        laborTime.mode, laborTime.unitsPerHour, laborTime.fixedHours,
                        upg.name, upg.unitType || upg.unit, upg.supplierUrl, upg.description
                    ].filter(Boolean).join(' ').toLowerCase();
                    const rowMeta = `data-row-key="${manageItemsAttr(rowKey)}" data-details-id="${detailsId}" data-search="${manageItemsAttr(searchBlob)}" data-custom="${isCustom ? '1' : '0'}" data-has-upgrade="${hasUpgrade ? '1' : '0'}" data-missing-material="${missingMaterial ? '1' : '0'}" data-no-description="${noDescription ? '1' : '0'}"`;

                    html += `<tr id="row_${safeId}" class="manage-items-row ${isDirty ? 'manage-item-dirty' : ''}" ${rowMeta}>
                        <td data-label="Name">
                            <div class="d-flex align-items-center">
                                <span class="manage-dirty-dot" title="Unsaved row"></span>
                                <input type="text" class="form-control form-control-sm item-name-input" value="${manageItemsAttr(item.name)}" placeholder="Item name" oninput="markPricingDirty(this)">
                            </div>
                            <div class="mt-1 d-flex flex-wrap gap-1">${renderManageMarginPill(rate, matCost)} ${renderManageLaborPill(laborTime, item.unitType || '')}</div>
                        </td>
                        <td data-label="Unit"><input type="text" class="form-control form-control-sm item-input" value="${manageItemsAttr(item.unitType || '')}" oninput="markPricingDirty(this)"></td>
                        <td data-label="Rate"><input type="number" class="form-control form-control-sm item-input" value="${rate}" step="0.01" min="0" oninput="markPricingDirty(this)"></td>
                        <td data-label="Mat. Cost"><input type="number" class="form-control form-control-sm item-input" value="${matCost}" step="0.01" min="0" oninput="markPricingDirty(this)"></td>
                        <td data-label="Supplier">
                            <div class="input-group input-group-sm">
                                <input type="url" class="form-control item-input" value="${supplier}" placeholder="https://..." oninput="markPricingDirty(this)">
                                <button type="button" class="btn btn-outline-secondary" title="Help with supplier URLs" aria-label="Help with supplier URLs" onclick="if(window.QuoteDrModalHelp){QuoteDrModalHelp.openInline('supplierUrl');} return false;"><i class="fas fa-question"></i></button>
                            </div>
                        </td>
                        <td data-label="Actions">
                            <div class="manage-item-actions">
                                <div class="btn-group details-section-menu" data-target="${detailsId}">
                                    <button class="btn btn-sm btn-info dropdown-toggle details-menu-btn" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Choose item details to display"><i class="fas fa-sliders-h"></i> Details</button>
                                    <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:210px;">
                                        <div class="small text-muted fw-bold px-1 mb-1">Show for this item</div>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="description"> Description</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="upgrade"> Upgrade Option ${hasUpgrade ? '<span class="badge text-bg-warning ms-auto">set</span>' : ''}</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="labor"> Labor Time ${laborTime.mode ? '<span class="badge text-bg-success ms-auto">set</span>' : ''}</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="supplier-cost"> Supplier / Cost</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="photos"> Photos ${(item.photo || upg.photo) ? '<span class="badge text-bg-secondary ms-auto">set</span>' : ''}</label>
                                    </div>
                                </div>
                                <button class="btn btn-sm btn-success item-save-btn" data-cat="${catE}" data-name="${nameE}" title="Save this row"><i class="fas fa-save"></i></button>
                                ${isCustom ? `<button class="btn btn-sm btn-danger item-delete-btn" data-cat="${catE}" data-name="${nameE}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                        </td>
                    </tr>
                    <tr id="${detailsId}" class="item-details-row ${isDirty ? 'manage-item-dirty' : ''}" data-row-key="${manageItemsAttr(rowKey)}" style="display:none;">
                        <td colspan="6">
                            <div class="p-3">
                                <div class="row g-3">
                                    <div class="col-12 manage-detail-section description-refine-scope" data-detail-section="description" style="display:none;">
                                        <div class="d-flex justify-content-between align-items-center gap-2">
                                            <small class="text-info fw-bold"><i class="fas fa-align-left"></i> Description shown to clients</small>
                                            <div class="d-flex align-items-center gap-1">
                                                <button type="button" class="btn btn-sm btn-outline-secondary undo-refine-desc-btn" onclick="toggleRefinedDescription(this)" title="Undo AI refined description" style="display:none;font-size:0.75rem;padding:2px 7px;"><i class="fas fa-undo"></i></button>
                                                <button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI Refine</button>
                                            </div>
                                        </div>
                                        <textarea class="form-control form-control-sm item-description-textarea mt-2" rows="4" placeholder="e.g., Complete drywall installation including hanging, mudding, taping, sanding and priming." spellcheck="true" oninput="markPricingDirty(this)">${manageItemsEscape(item.itemDescription || '')}</textarea>
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="labor" style="display:none;">
                                        <div class="border rounded p-2 mt-2 bg-light">
                                            <small class="text-primary fw-bold"><i class="fas fa-clock"></i> Labor Time</small>
                                            <div class="row g-2 mt-1 align-items-end">
                                                <div class="col-md-4">
                                                    <label class="form-label" style="font-size:0.75em">Time Mode</label>
                                                    <select class="form-select form-select-sm item-labor-mode" oninput="markPricingDirty(this)">
                                                        <option value="" ${!laborTime.mode ? 'selected' : ''}>Not set</option>
                                                        <option value="units_per_hour" ${laborTime.mode === 'units_per_hour' ? 'selected' : ''}>Units per hour</option>
                                                        <option value="fixed_hours" ${laborTime.mode === 'fixed_hours' ? 'selected' : ''}>Fixed hours per item</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label" style="font-size:0.75em">Units/hr</label>
                                                    <input type="number" class="form-control form-control-sm item-units-per-hour" value="${manageItemsAttr(laborTime.unitsPerHour || '')}" step="0.01" min="0" placeholder="120" oninput="markPricingDirty(this)">
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label" style="font-size:0.75em">Hours/item</label>
                                                    <input type="number" class="form-control form-control-sm item-fixed-hours" value="${manageItemsAttr(laborTime.fixedHours || '')}" step="0.01" min="0" placeholder="2" oninput="markPricingDirty(this)">
                                                </div>
                                                <div class="col-md-2">
                                                    <label class="form-label" style="font-size:0.75em">Crew</label>
                                                    <input type="number" class="form-control form-control-sm item-crew-size" value="${manageItemsAttr(laborTime.crewSize || 1)}" step="1" min="1" oninput="markPricingDirty(this)">
                                                </div>
                                            </div>
                                            <small class="text-muted d-block mt-1">Used by Timeline Report. Example: 120 sq ft/hr, or 2 fixed hours per item.</small>
                                        </div>
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="supplier-cost" style="display:none;">
                                        <div class="border rounded p-2 bg-light">
                                            <small class="text-success fw-bold"><i class="fas fa-dollar-sign"></i> Base Item Supplier / Cost</small>
                                            <div class="row g-2 mt-1 align-items-end">
                                                <div class="col-md-3">
                                                    <label class="form-label" style="font-size:0.75em">Material Cost</label>
                                                    <input type="number" class="form-control form-control-sm item-detail-material-cost" value="${matCost}" step="0.01" min="0" oninput="syncManageDetailBaseField(this); markPricingDirty(this)">
                                                </div>
                                                <div class="col-md-9">
                                                    <label class="form-label" style="font-size:0.75em">Supplier URL</label>
                                                    <input type="url" class="form-control form-control-sm item-detail-supplier-url" value="${supplier}" placeholder="https://..." oninput="syncManageDetailBaseField(this); markPricingDirty(this)">
                                                </div>
                                            </div>
                                            <div class="mt-2">${renderManageMarginPill(rate, matCost)}</div>
                                        </div>
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="upgrade" style="display:none;">
                                        <small class="text-warning fw-bold"><i class="fas fa-arrow-up"></i> Upgrade Option</small>
                                        <div class="row g-2 mt-1 align-items-end">
                                            <div class="col-md-5">
                                                <label class="form-label" style="font-size:0.75em">Upgrade Name</label>
                                                <input type="text" class="form-control form-control-sm upgrade-name" value="${upgName}" placeholder="e.g., Tall Baseboard 5.5&quot;" oninput="markPricingDirty(this)">
                                            </div>
                                            <div class="col-md-3">
                                                <label class="form-label" style="font-size:0.75em">Unit</label>
                                                <input type="text" class="form-control form-control-sm upgrade-unit-type" value="${upgUnitType}" list="unitTypeOptions" placeholder="LF" oninput="markPricingDirty(this)">
                                            </div>
                                            <div class="col-md-2">
                                                <label class="form-label" style="font-size:0.75em">Rate</label>
                                                <input type="number" class="form-control form-control-sm upgrade-rate" value="${upgRate}" step="0.01" min="0" oninput="markPricingDirty(this)">
                                            </div>
                                            <div class="col-md-2">
                                                <label class="form-label" style="font-size:0.75em">Cost</label>
                                                <input type="number" class="form-control form-control-sm upgrade-material-cost" value="${upgMaterialCost}" step="0.01" min="0" oninput="markPricingDirty(this)">
                                            </div>
                                            <div class="col-12">
                                                <label class="form-label" style="font-size:0.75em">Supplier URL</label>
                                                <input type="url" class="form-control form-control-sm upgrade-supplier-url" value="${upgSupplierUrl}" placeholder="https://..." oninput="markPricingDirty(this)">
                                            </div>
                                            <div class="col-12 description-refine-scope">
                                                <div class="d-flex justify-content-between align-items-center gap-2">
                                                    <label class="form-label mb-0" style="font-size:0.75em">Upgrade Description</label>
                                                    <div class="d-flex align-items-center gap-1">
                                                        <button type="button" class="btn btn-sm btn-outline-secondary undo-refine-desc-btn" onclick="toggleRefinedDescription(this)" title="Undo AI refined description" style="display:none;font-size:0.75rem;padding:2px 7px;"><i class="fas fa-undo"></i></button>
                                                        <button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI Refine</button>
                                                    </div>
                                                </div>
                                                <input type="text" class="form-control form-control-sm upgrade-desc item-description-textarea mt-1" value="${manageItemsAttr(upg.description || '')}" placeholder="e.g., Premium finishing upgrade" oninput="markPricingDirty(this)">
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
                                            <span>${renderManageMarginPill(upgRate, upgMaterialCost)}</span>
                                        </div>
                                        <small class="text-muted d-block mt-2">Leave upgrade name blank to remove the upgrade when this row is saved.</small>
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="photos" style="display:none;">
                                        <div class="border rounded p-2 bg-light">
                                            <small class="text-secondary fw-bold"><i class="fas fa-camera"></i> Photos</small>
                                            <div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
                                                <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="photo" title="Add item photo"><i class="fas fa-camera me-1"></i>Item Photo</button>
                                                ${item.photo ? `<img src="${manageItemsAttr(item.photo)}" class="rounded" style="max-width:80px;max-height:52px;cursor:pointer;" onclick="openPhotoLightbox(this.src)" title="Click to enlarge">` : ''}
                                            </div>
                                            <div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
                                            <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="upgradePhoto" title="Add upgrade photo"><i class="fas fa-camera me-1"></i>Upgrade Photo</button>
                                            ${upg.photo ? `<img src="${manageItemsAttr(upg.photo)}" class="rounded" style="max-width:80px;max-height:52px;cursor:pointer;" onclick="openPhotoLightbox(this.src)" title="Click to enlarge">` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>`;
                });
                html += '</tbody></table></div></section>';
            });

            container.innerHTML = html || '<p class="text-muted">No items found.</p>';
            filterItemsList();
        }

        function toggleManageItemsCategory(cat) {
            const current = getManageItemsCategoryOpen(cat);
            manageItemsCategoryState[cat] = !current;
            saveManageItemsCategoryState();
            const section = Array.from(document.querySelectorAll('.manage-items-category')).find(function(el) {
                return el.dataset.category === cat;
            });
            if (!section) return;
            const body = section.querySelector('.manage-items-category-body');
            const icon = section.querySelector('.manage-items-category-toggle i');
            if (body) body.style.display = manageItemsCategoryState[cat] === false ? 'none' : '';
            if (icon) icon.className = manageItemsCategoryState[cat] === false ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
        }

        function showManageItemsToast(message, ok) {
            var toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + (ok ? '#198754' : '#dc3545') + ';color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.95rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(function(){ toast.remove(); }, 3200);
        }

        function saveChangedPricingRows() {
            const changedKeys = Array.from(dirtyPricingRows);
            if (changedKeys.length === 0 && !pricingOtherDirty) {
                showManageItemsToast('No changed rows to save.', true);
                return;
            }
            pushUndoState();
            changedKeys.forEach(function(rowKey) {
                const row = getManageRowByKey(rowKey);
                const saveBtn = row ? row.querySelector('.item-save-btn') : null;
                if (saveBtn?.dataset.cat && saveBtn?.dataset.name) {
                    saveItemRowCore(saveBtn.dataset.cat, saveBtn.dataset.name, { backup: false, flash: false });
                }
            });
            pricingOtherDirty = false;
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
            _doBackupItemsToCloud(customItems).then(function(result) {
                const ok = result && !result.error;
                clearPricingDirty();
                showManageItemsToast(ok ? 'Changed rows saved to cloud.' : 'Saved locally - cloud sync failed.', ok);
                filterItemsList();
            }).catch(function() {
                clearPricingDirty();
                showManageItemsToast('Saved locally - cloud sync failed.', false);
                filterItemsList();
            });
        }

        function saveItemFieldEdit(category, name, field, value) {
            // For custom items: update customItems store
            if (!customItems[category]) customItems[category] = [];
            let ci = customItems[category].find(i => i.name === name);
            // If not in customItems yet but exists in pricingDatabase as custom, adopt it
            if (!ci) {
                const pi = pricingDatabase[category]?.find(i => i.name === name);
                if (pi) {
                    ci = { name: pi.name, unitType: pi.unitType || '', rate: pi.rate || 0, materialCost: pi.materialCost || 0, supplierUrl: pi.supplierUrl || '', itemDescription: pi.itemDescription || '' };
                    customItems[category].push(ci);
                }
            }
            if (ci) {
                ci[field] = value;
                saveCustomItems();
                // Also update live pricingDatabase
                const pi = pricingDatabase[category]?.find(i => i.name === name);
                if (pi) pi[field] = value;
                return;
            }
            // For truly built-in items: use overrides
            saveItemOverride(category, name, { [field]: value });
        }

        function addCustomItem() {
            const category = document.getElementById('newItemCategory').value;
            const name = document.getElementById('newItemName').value.trim();
            const unitType = document.getElementById('newItemUnit').value.trim();
            const rate = parseFloat(document.getElementById('newItemRate').value) || 0;
            const materialCost = parseFloat(document.getElementById('newItemMaterialCost').value) || 0;
            const supplierUrl = document.getElementById('newItemSupplierUrl').value.trim();
            const itemDescription = document.getElementById('newItemDescription')?.value.trim() || '';
            const laborTime = normalizeManageLaborTime({
                mode: document.getElementById('newItemLaborMode')?.value || '',
                unitsPerHour: parseFloat(document.getElementById('newItemUnitsPerHour')?.value || 0) || 0,
                fixedHours: parseFloat(document.getElementById('newItemFixedHours')?.value || 0) || 0,
                crewSize: parseFloat(document.getElementById('newItemCrewSize')?.value || 1) || 1
            });

            if (category === CREATE_NEW_CATEGORY_VALUE) {
                qdAlert('Please create or choose a category first.');
                return;
            }

            if (!name || !unitType) {
                qdAlert('Please fill in item name and unit type.');
                return;
            }

            if (!customItems[category]) customItems[category] = [];
            if (customItems[category].find(i => i.name === name) ||
                pricingDatabase[category]?.find(i => i.name === name)) {
                qdAlert('An item with this name already exists in this category.');
                return;
            }

            const newItem = { name, unitType, rate, materialCost, supplierUrl, itemDescription, laborTime };
            customItems[category].push(newItem);
            saveCustomItems();

            if (!pricingDatabase[category]) pricingDatabase[category] = [];
            pricingDatabase[category].push({ ...newItem, _custom: true });

            document.getElementById('newItemName').value = '';
            document.getElementById('newItemUnit').value = '';
            document.getElementById('newItemRate').value = '';
            document.getElementById('newItemMaterialCost').value = '';
            document.getElementById('newItemSupplierUrl').value = '';
            if (document.getElementById('newItemLaborMode')) document.getElementById('newItemLaborMode').value = '';
            if (document.getElementById('newItemUnitsPerHour')) document.getElementById('newItemUnitsPerHour').value = '';
            if (document.getElementById('newItemFixedHours')) document.getElementById('newItemFixedHours').value = '';
            if (document.getElementById('newItemCrewSize')) document.getElementById('newItemCrewSize').value = '1';
            if (document.getElementById('newItemDescription')) document.getElementById('newItemDescription').value = '';
            const newItemUndoBtn = document.getElementById('newItemDescription')?.closest('.description-refine-scope')?.querySelector('.undo-refine-desc-btn');
            if (newItemUndoBtn) {
                newItemUndoBtn.style.display = 'none';
                delete newItemUndoBtn._previousDescription;
                delete newItemUndoBtn._refinedDescription;
                delete newItemUndoBtn._showingRefined;
            }

            renderAllItemsList();
        }

        function getChoiceGroupTemplateStore() {
            if (!customItems || typeof customItems !== 'object') customItems = {};
            if (!Array.isArray(customItems.__choiceGroupTemplates)) customItems.__choiceGroupTemplates = [];
            return customItems.__choiceGroupTemplates;
        }

        function flattenChoiceGroupCandidateItems() {
            var out = [];
            Object.keys(pricingDatabase || {}).forEach(function(cat) {
                var items = Array.isArray(pricingDatabase[cat]) ? pricingDatabase[cat] : [];
                items.forEach(function(item) {
                    if (!item || !item.name) return;
                    out.push({
                        category: cat,
                        id: 'cgt_' + cat.replace(/[^a-z0-9]/gi, '_') + '_' + item.name.replace(/[^a-z0-9]/gi, '_'),
                        name: item.name,
                        description: item.name,
                        unitType: item.unitType || item.unit || '',
                        rate: parseFloat(item.rate) || 0,
                        materialCost: parseFloat(item.materialCost) || 0,
                        supplierUrl: item.supplierUrl || '',
                        photo: item.photo || '',
                        itemDescription: item.itemDescription || item.description || '',
                        laborTime: normalizeManageLaborTime(item.laborTime),
                        quantityMode: 'inherit',
                        quantityOverride: ''
                    });
                });
            });
            return out;
        }

        function itemHtmlEscape(value) {
            return String(value === undefined || value === null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function choiceGroupItemSearchText(item) {
            return [
                item.name,
                item.category,
                item.unitType,
                item.supplierUrl,
                item.itemDescription,
                item.description
            ].join(' ').toLowerCase();
        }

        function openChoiceGroupItemPicker(candidates, initialQuery, initialSelectedIds, initialAutoGroup) {
            return new Promise(function(resolve) {
                var existing = document.getElementById('choiceGroupItemPickerModal');
                if (existing) existing.remove();

                var modalHtml = '' +
                    '<div class="modal fade" id="choiceGroupItemPickerModal" tabindex="-1" aria-hidden="true">' +
                    '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header bg-primary text-white">' +
                    '<h5 class="modal-title"><i class="fas fa-layer-group me-2"></i>Choose Saved Items</h5>' +
                    '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<label class="form-label fw-bold" for="choiceGroupItemSearch">Search saved items</label>' +
                    '<input type="text" id="choiceGroupItemSearch" class="form-control mb-2" placeholder="Search by item, category, description, supplier, or unit...">' +
                    '<div class="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">' +
                    '<div class="small text-muted">Click saved items below to include them in this choice group.</div>' +
                    '<span id="choiceGroupSelectedCount" class="badge bg-secondary">0 selected</span>' +
                    '</div>' +
                    '<div class="form-check form-switch border rounded bg-light px-5 py-2 mb-2">' +
                    '<input class="form-check-input" type="checkbox" id="choiceGroupAutoGroupCheckbox" checked>' +
                    '<label class="form-check-label fw-semibold" for="choiceGroupAutoGroupCheckbox">Always use grouping when any of these items are added to a quote</label>' +
                    '<div class="small text-muted">When this is on, QuoteDr automatically shows the full option group if one of these saved items lands on a quote.</div>' +
                    '</div>' +
                    '<div id="choiceGroupItemPickerList" style="max-height:55vh;overflow:auto;"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                    '<button type="button" class="btn btn-primary" id="choiceGroupUseSelectedBtn" disabled><i class="fas fa-check me-1"></i>Use Selected Items</button>' +
                    '</div>' +
                    '</div></div></div>';

                document.body.insertAdjacentHTML('beforeend', modalHtml);
                var modalEl = document.getElementById('choiceGroupItemPickerModal');
                var searchEl = document.getElementById('choiceGroupItemSearch');
                var listEl = document.getElementById('choiceGroupItemPickerList');
                var countEl = document.getElementById('choiceGroupSelectedCount');
                var useBtn = document.getElementById('choiceGroupUseSelectedBtn');
                var autoGroupEl = document.getElementById('choiceGroupAutoGroupCheckbox');
                var selected = new Set();
                var initialIds = Array.isArray(initialSelectedIds) ? initialSelectedIds : [];
                if (autoGroupEl) autoGroupEl.checked = initialAutoGroup !== false;
                candidates.forEach(function(item, index) {
                    if (initialIds.indexOf(item.id) >= 0) selected.add(index);
                });
                var accepted = false;

                function getFilteredItems() {
                    var q = (searchEl.value || '').trim().toLowerCase();
                    return candidates.filter(function(item) {
                        return !q || choiceGroupItemSearchText(item).indexOf(q) !== -1;
                    });
                }

                function renderPicker() {
                    var filtered = getFilteredItems();
                    var grouped = {};
                    filtered.forEach(function(item) {
                        var cat = item.category || 'Saved Items';
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(item);
                    });

                    var html = '';
                    Object.keys(grouped).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(cat) {
                        html += '<section class="border rounded mb-2 overflow-hidden">' +
                            '<div class="d-flex align-items-center justify-content-between gap-2 px-3 py-2" style="background:#eef4ff;">' +
                            '<strong><i class="fas fa-tag me-1 text-primary"></i>' + itemHtmlEscape(cat) + '</strong>' +
                            '<span class="badge bg-light text-dark border">' + grouped[cat].length + '</span>' +
                            '</div>' +
                            '<div class="list-group list-group-flush">';
                        grouped[cat].forEach(function(item) {
                            var index = candidates.indexOf(item);
                            var checked = selected.has(index);
                            html += '<div class="list-group-item list-group-item-action d-flex align-items-start gap-2" data-choice-group-item="' + index + '" style="cursor:pointer;">' +
                                '<input class="form-check-input mt-1 flex-shrink-0" type="checkbox" data-choice-group-check="' + index + '"' + (checked ? ' checked' : '') + '>' +
                                '<span class="flex-grow-1">' +
                                '<span class="d-flex justify-content-between gap-2">' +
                                '<strong>' + itemHtmlEscape(item.name) + '</strong>' +
                                '<span class="text-primary fw-bold text-nowrap">$' + (parseFloat(item.rate) || 0).toFixed(2) + '</span>' +
                                '</span>' +
                                '<span class="small text-muted d-block">' + itemHtmlEscape(item.unitType || 'unit') + (item.itemDescription ? ' - ' + itemHtmlEscape(item.itemDescription) : '') + '</span>' +
                                '</span>' +
                                '</div>';
                        });
                        html += '</div></section>';
                    });
                    if (!html) {
                        html = '<div class="alert alert-warning mb-0">No saved items match that search. Try a broader word or clear the search.</div>';
                    }
                    listEl.innerHTML = html;
                    countEl.textContent = selected.size + ' selected';
                    countEl.className = 'badge ' + (selected.size >= 2 ? 'bg-success' : 'bg-secondary');
                    useBtn.disabled = selected.size < 2;
                }

                searchEl.value = initialQuery || '';
                searchEl.addEventListener('input', renderPicker);
                listEl.addEventListener('change', function(e) {
                    var box = e.target.closest('[data-choice-group-check]');
                    if (!box) return;
                    var index = parseInt(box.getAttribute('data-choice-group-check'), 10);
                    if (box.checked) selected.add(index);
                    else selected.delete(index);
                    renderPicker();
                });
                listEl.addEventListener('click', function(e) {
                    if (e.target.matches('input[type="checkbox"]')) return;
                    var row = e.target.closest('[data-choice-group-item]');
                    if (!row) return;
                    var index = parseInt(row.getAttribute('data-choice-group-item'), 10);
                    if (selected.has(index)) selected.delete(index);
                    else selected.add(index);
                    renderPicker();
                });
                useBtn.addEventListener('click', function() {
                    if (selected.size < 2) return;
                    accepted = true;
                    bootstrap.Modal.getInstance(modalEl).hide();
                });
                modalEl.addEventListener('shown.bs.modal', function() {
                    searchEl.focus();
                    searchEl.select();
                }, { once: true });
                modalEl.addEventListener('hidden.bs.modal', function() {
                    var picked = accepted ? Array.from(selected).sort(function(a, b) { return a - b; }).map(function(index) {
                        return candidates[index];
                    }).filter(Boolean) : null;
                    if (picked) picked.autoGroup = !autoGroupEl || autoGroupEl.checked;
                    modalEl.remove();
                    resolve(picked);
                }, { once: true });
                renderPicker();
                new bootstrap.Modal(modalEl).show();
            });
        }

        function openChoiceGroupDefaultOptionPicker(options, initialDefaultOptionId) {
            return new Promise(function(resolve) {
                var existing = document.getElementById('choiceGroupDefaultOptionModal');
                if (existing) existing.remove();

                var initialIndex = Math.max(0, options.findIndex(function(item) { return item.id === initialDefaultOptionId; }));
                var rowsHtml = options.map(function(item, idx) {
                    var checked = idx === initialIndex;
                    return '<div class="list-group-item list-group-item-action d-flex align-items-start gap-2' + (checked ? ' active' : '') + '" data-choice-group-default-option="' + idx + '" style="cursor:pointer;">' +
                        '<input class="form-check-input mt-1 flex-shrink-0" type="radio" name="choiceGroupDefaultOption" data-choice-group-default-radio="' + idx + '"' + (checked ? ' checked' : '') + '>' +
                        '<span class="flex-grow-1">' +
                        '<span class="d-flex justify-content-between gap-2">' +
                        '<strong>' + itemHtmlEscape(item.name) + '</strong>' +
                        '<span class="fw-bold text-nowrap">$' + (parseFloat(item.rate) || 0).toFixed(2) + '</span>' +
                        '</span>' +
                        '<span class="small ' + (checked ? 'text-white-50' : 'text-muted') + ' d-block">' + itemHtmlEscape(item.category || 'Saved Item') + ' - ' + itemHtmlEscape(item.unitType || 'unit') + '</span>' +
                        (item.itemDescription ? '<span class="small ' + (checked ? 'text-white-50' : 'text-muted') + ' d-block">' + itemHtmlEscape(item.itemDescription) + '</span>' : '') +
                        '</span>' +
                        '</div>';
                }).join('');

                var modalHtml = '' +
                    '<div class="modal fade" id="choiceGroupDefaultOptionModal" tabindex="-1" aria-hidden="true">' +
                    '<div class="modal-dialog modal-lg modal-dialog-centered">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header bg-primary text-white">' +
                    '<h5 class="modal-title"><i class="fas fa-check-circle me-2"></i>Default Option</h5>' +
                    '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<p class="mb-3">Choose the base option clients will see selected first.</p>' +
                    '<div id="choiceGroupDefaultOptionList" class="list-group">' + rowsHtml + '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                    '<button type="button" class="btn btn-primary" id="choiceGroupUseDefaultBtn"><i class="fas fa-check me-1"></i>Use This Default</button>' +
                    '</div>' +
                    '</div></div></div>';

                document.body.insertAdjacentHTML('beforeend', modalHtml);
                var modalEl = document.getElementById('choiceGroupDefaultOptionModal');
                var listEl = document.getElementById('choiceGroupDefaultOptionList');
                var accepted = false;
                var selectedIndex = initialIndex;

                function renderSelected() {
                    listEl.querySelectorAll('[data-choice-group-default-option]').forEach(function(row) {
                        var index = parseInt(row.getAttribute('data-choice-group-default-option'), 10);
                        var active = index === selectedIndex;
                        row.classList.toggle('active', active);
                        var radio = row.querySelector('[data-choice-group-default-radio]');
                        if (radio) radio.checked = active;
                        row.querySelectorAll('.small').forEach(function(el) {
                            el.classList.toggle('text-muted', !active);
                            el.classList.toggle('text-white-50', active);
                        });
                    });
                }

                listEl.addEventListener('click', function(e) {
                    var row = e.target.closest('[data-choice-group-default-option]');
                    if (!row) return;
                    selectedIndex = parseInt(row.getAttribute('data-choice-group-default-option'), 10) || 0;
                    renderSelected();
                });
                document.getElementById('choiceGroupUseDefaultBtn').addEventListener('click', function() {
                    accepted = true;
                    bootstrap.Modal.getInstance(modalEl).hide();
                });
                modalEl.addEventListener('hidden.bs.modal', function() {
                    var selected = accepted ? options[selectedIndex] : null;
                    modalEl.remove();
                    resolve(selected || null);
                }, { once: true });

                renderSelected();
                new bootstrap.Modal(modalEl).show();
            });
        }

        function openChoiceGroupTypePicker(initialType) {
            return new Promise(function(resolve) {
                var existing = document.getElementById('choiceGroupTypePickerModal');
                if (existing) existing.remove();

                var selectedType = initialType === 'multiple' ? 'multiple' : 'single';
                var accepted = false;
                var modalHtml = '' +
                    '<div class="modal fade" id="choiceGroupTypePickerModal" tabindex="-1" aria-hidden="true">' +
                    '<div class="modal-dialog modal-lg modal-dialog-centered">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header bg-primary text-white">' +
                    '<h5 class="modal-title"><i class="fas fa-layer-group me-2"></i>Choice Group Type</h5>' +
                    '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<p class="mb-3 fw-semibold">Can the client pick more than one of these items at the same time?</p>' +
                    '<div id="choiceGroupTypeList" class="row g-3">' +
                    '<div class="col-md-6">' +
                    '<button type="button" class="choice-group-type-card btn w-100 text-start border rounded p-3 h-100" data-choice-group-type-option="single">' +
                    '<div class="d-flex align-items-start gap-2">' +
                    '<span class="choice-group-type-check mt-1"><i class="far fa-circle"></i></span>' +
                    '<span><span class="d-block fw-bold">Pick One</span>' +
                    '<span class="d-block small text-muted">Use this when choices replace each other and only one can be selected.</span>' +
                    '<span class="d-block small mt-2"><strong>Example:</strong> vinyl plank or hardwood flooring.</span>' +
                    '</span></div>' +
                    '</button>' +
                    '</div>' +
                    '<div class="col-md-6">' +
                    '<button type="button" class="choice-group-type-card btn w-100 text-start border rounded p-3 h-100" data-choice-group-type-option="multiple">' +
                    '<div class="d-flex align-items-start gap-2">' +
                    '<span class="choice-group-type-check mt-1"><i class="far fa-circle"></i></span>' +
                    '<span><span class="d-block fw-bold">Pick Multiple</span>' +
                    '<span class="d-block small text-muted">Use this when several add-ons can be selected together.</span>' +
                    '<span class="d-block small mt-2"><strong>Example:</strong> baseboards, shoe moulding, and crown moulding.</span>' +
                    '</span></div>' +
                    '</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                    '<button type="button" class="btn btn-primary" id="choiceGroupUseTypeBtn"><i class="fas fa-check me-1"></i>Continue</button>' +
                    '</div>' +
                    '</div></div></div>';

                document.body.insertAdjacentHTML('beforeend', modalHtml);
                var modalEl = document.getElementById('choiceGroupTypePickerModal');
                var listEl = document.getElementById('choiceGroupTypeList');

                function renderSelectedType() {
                    listEl.querySelectorAll('[data-choice-group-type-option]').forEach(function(card) {
                        var active = card.getAttribute('data-choice-group-type-option') === selectedType;
                        card.classList.toggle('btn-primary', active);
                        card.classList.toggle('btn-outline-primary', !active);
                        card.classList.toggle('text-white', active);
                        card.querySelectorAll('.small').forEach(function(el) {
                            el.classList.toggle('text-muted', !active);
                            el.classList.toggle('text-white-50', active);
                        });
                        var icon = card.querySelector('.choice-group-type-check i');
                        if (icon) icon.className = active ? 'fas fa-check-circle' : 'far fa-circle';
                    });
                }

                listEl.addEventListener('click', function(e) {
                    var card = e.target.closest('[data-choice-group-type-option]');
                    if (!card) return;
                    selectedType = card.getAttribute('data-choice-group-type-option') === 'multiple' ? 'multiple' : 'single';
                    renderSelectedType();
                });
                document.getElementById('choiceGroupUseTypeBtn').addEventListener('click', function() {
                    accepted = true;
                    bootstrap.Modal.getInstance(modalEl).hide();
                });
                modalEl.addEventListener('hidden.bs.modal', function() {
                    modalEl.remove();
                    resolve(accepted ? selectedType : null);
                }, { once: true });

                renderSelectedType();
                new bootstrap.Modal(modalEl).show();
            });
        }

        async function createChoiceGroupTemplateFlow() {
            var name = (await qdPrompt('Name this reusable choice group:', 'Deck Material Options', { title: 'Choice Group' }) || '').trim();
            if (!name) return;
            var type = await openChoiceGroupTypePicker('single');
            if (!type) return;
            var candidates = flattenChoiceGroupCandidateItems();
            if (candidates.length < 2) {
                qdAlert('You need at least two saved items before creating a reusable choice group.');
                return;
            }
            var picked = await openChoiceGroupItemPicker(candidates, name.split(' ')[0] || '', [], true);
            if (!picked) return;
            if (picked.length < 2) {
                qdAlert('A choice group needs at least two options.');
                return;
            }
            var defaultOption = picked[0];
            if (type === 'single') {
                defaultOption = await openChoiceGroupDefaultOptionPicker(picked);
                if (!defaultOption) return;
            }
            var template = {
                id: 'cgt_' + Date.now().toString(36),
                name: name,
                type: type,
                required: type === 'single',
                defaultOptionId: defaultOption.id,
                selectedOptionIds: type === 'single' ? [defaultOption.id] : [],
                autoGroup: picked.autoGroup !== false,
                options: picked
            };
            pushUndoState();
            getChoiceGroupTemplateStore().push(template);
            saveCustomItems(true);
            renderAllItemsList();
            qdAlert('Saved "' + name + '" as a reusable client choice group.');
        }

        async function renameChoiceGroupTemplate(index) {
            var store = getChoiceGroupTemplateStore();
            var group = store[index];
            if (!group) return;
            var name = (await qdPrompt('Rename this choice group:', group.name || 'Choice Group', { title: 'Rename Choice Group' }) || '').trim();
            if (!name) return;
            pushUndoState();
            group.name = name;
            saveCustomItems(true);
            renderAllItemsList();
        }

        async function deleteChoiceGroupTemplate(index) {
            var store = getChoiceGroupTemplateStore();
            var group = store[index];
            if (!group) return;
            if (!await qdConfirm('Delete "' + (group.name || 'Choice Group') + '"?', {
                title: 'Delete Choice Group',
                okText: 'Delete',
                okClass: 'btn-danger',
                type: 'danger'
            })) {
                return;
            }
            pushUndoState();
            store.splice(index, 1);
            saveCustomItems(true);
            renderAllItemsList();
        }

        async function editChoiceGroupTemplate(index) {
            var store = getChoiceGroupTemplateStore();
            var group = store[index];
            if (!group) return;
            var type = await openChoiceGroupTypePicker(group.type === 'multiple' ? 'multiple' : 'single');
            if (!type) return;
            var candidates = flattenChoiceGroupCandidateItems();
            if (candidates.length < 2) {
                qdAlert('You need at least two saved items before editing a reusable choice group.');
                return;
            }
            var currentIds = Array.isArray(group.options) ? group.options.map(function(option) { return option.id; }) : [];
            var picked = await openChoiceGroupItemPicker(candidates, (group.name || '').split(' ')[0] || '', currentIds, group.autoGroup !== false);
            if (!picked) return;
            if (picked.length < 2) {
                qdAlert('A choice group needs at least two options.');
                return;
            }
            var defaultOption = picked[0];
            if (type === 'single') {
                defaultOption = await openChoiceGroupDefaultOptionPicker(picked, group.defaultOptionId);
                if (!defaultOption) return;
            }
            pushUndoState();
            store[index] = {
                id: group.id || ('cgt_' + Date.now().toString(36)),
                name: group.name || 'Choice Group',
                type: type,
                required: type === 'single',
                defaultOptionId: defaultOption.id,
                selectedOptionIds: type === 'single' ? [defaultOption.id] : [],
                autoGroup: picked.autoGroup !== false,
                options: picked
            };
            saveCustomItems(true);
            renderAllItemsList();
        }

        function renderChoiceGroupTemplateManagerList(container) {
            var store = getChoiceGroupTemplateStore();
            if (!store.length) {
                container.innerHTML = '<div class="alert alert-info mb-0">No reusable choice groups yet. Click <strong>New Choice Group</strong> to create one from your saved items.</div>';
                return;
            }
            container.innerHTML = store.map(function(group, index) {
                var options = Array.isArray(group.options) ? group.options : [];
                var optionNames = options.map(function(option) { return option.name; }).filter(Boolean).join(' / ');
                return '<div class="border rounded p-3 mb-2 bg-white" data-choice-group-template="' + index + '">' +
                    '<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">' +
                    '<div class="flex-grow-1">' +
                    '<div class="fw-bold"><i class="fas fa-layer-group me-1 text-primary"></i>' + itemHtmlEscape(group.name || 'Choice Group') + '</div>' +
                    '<div class="small text-muted">' + itemHtmlEscape(group.type === 'multiple' ? 'Pick Multiple' : 'Pick One') + ' - ' + options.length + ' options</div>' +
                    '<div class="small mt-1">' + itemHtmlEscape(optionNames || 'No options') + '</div>' +
                    '</div>' +
                    '<div class="d-flex gap-1 flex-wrap">' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" data-choice-group-template-action="edit" data-choice-group-template-index="' + index + '"><i class="fas fa-pen me-1"></i>Edit</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-secondary" data-choice-group-template-action="rename" data-choice-group-template-index="' + index + '"><i class="fas fa-i-cursor me-1"></i>Rename</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" data-choice-group-template-action="delete" data-choice-group-template-index="' + index + '"><i class="fas fa-trash me-1"></i>Delete</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        function runChoiceGroupManagerAction(modalEl, action) {
            modalEl.addEventListener('hidden.bs.modal', async function() {
                modalEl.remove();
                await action();
                openChoiceGroupTemplateModal();
            }, { once: true });
            bootstrap.Modal.getInstance(modalEl).hide();
        }

        function openChoiceGroupTemplateModal() {
            var existing = document.getElementById('choiceGroupTemplateManagerModal');
            if (existing) existing.remove();
            var modalHtml = '' +
                '<div class="modal fade" id="choiceGroupTemplateManagerModal" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                '<div class="modal-header bg-primary text-white">' +
                '<h5 class="modal-title"><i class="fas fa-layer-group me-2"></i>Choice Groups</h5>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' +
                '<div class="d-flex justify-content-between align-items-center gap-2 mb-3 flex-wrap">' +
                '<div class="text-muted">Manage reusable client option groups for your saved line items.</div>' +
                '<button type="button" class="btn btn-primary" id="newChoiceGroupTemplateBtn"><i class="fas fa-plus me-1"></i>New Choice Group</button>' +
                '</div>' +
                '<div id="choiceGroupTemplateManagerList"></div>' +
                '</div>' +
                '<div class="modal-footer">' +
                '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>' +
                '</div>' +
                '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            var modalEl = document.getElementById('choiceGroupTemplateManagerModal');
            var listEl = document.getElementById('choiceGroupTemplateManagerList');
            renderChoiceGroupTemplateManagerList(listEl);
            document.getElementById('newChoiceGroupTemplateBtn').addEventListener('click', function() {
                runChoiceGroupManagerAction(modalEl, createChoiceGroupTemplateFlow);
            });
            listEl.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-choice-group-template-action]');
                if (!btn) return;
                var action = btn.getAttribute('data-choice-group-template-action');
                var index = parseInt(btn.getAttribute('data-choice-group-template-index'), 10);
                if (action === 'edit') runChoiceGroupManagerAction(modalEl, function() { return editChoiceGroupTemplate(index); });
                if (action === 'rename') runChoiceGroupManagerAction(modalEl, function() { return renameChoiceGroupTemplate(index); });
                if (action === 'delete') runChoiceGroupManagerAction(modalEl, function() { return deleteChoiceGroupTemplate(index); });
            });
            modalEl.addEventListener('hidden.bs.modal', function() {
                if (document.body.contains(modalEl)) modalEl.remove();
            }, { once: true });
            new bootstrap.Modal(modalEl).show();
        }

        async function suggestChoiceGroupTemplates() {
            var candidates = flattenChoiceGroupCandidateItems();
            var buckets = {};
            candidates.forEach(function(item) {
                var words = item.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(word) {
                    return word.length >= 4 && ['with','from','complete','standard','install','installation','service'].indexOf(word) === -1;
                });
                words.slice(0, 3).forEach(function(word) {
                    if (!buckets[word]) buckets[word] = [];
                    if (!buckets[word].some(function(existing) { return existing.name === item.name; })) buckets[word].push(item);
                });
            });
            var suggestions = Object.keys(buckets).filter(function(key) { return buckets[key].length >= 2; })
                .sort(function(a, b) { return buckets[b].length - buckets[a].length; })
                .slice(0, 8);
            if (!suggestions.length) {
                qdAlert('No obvious groups found yet. Add a few related saved items first, then try suggestions again.');
                return;
            }
            var key = await openChoiceGroupSuggestionPicker(suggestions, buckets);
            if (!key) return;
            var options = buckets[key].map(function(item, idx) {
                return Object.assign({}, item, { id: item.id || ('cgt_opt_' + idx) });
            });
            getChoiceGroupTemplateStore().push({
                id: 'cgt_' + Date.now().toString(36),
                name: key.replace(/^\w/, function(ch) { return ch.toUpperCase(); }) + ' Options',
                type: 'single',
                required: true,
                defaultOptionId: options[0].id,
                selectedOptionIds: [options[0].id],
                autoGroup: true,
                options: options
            });
            saveCustomItems(true);
            renderAllItemsList();
        }

        function openChoiceGroupSuggestionPicker(suggestions, buckets) {
            return new Promise(function(resolve) {
                var existing = document.getElementById('choiceGroupSuggestionPickerModal');
                if (existing) existing.remove();
                var optionsHtml = suggestions.map(function(key) {
                    var label = key.replace(/^\w/, function(ch) { return ch.toUpperCase(); }) + ' Options';
                    return '<option value="' + itemHtmlEscape(key) + '">' + itemHtmlEscape(label) + ' (' + buckets[key].length + ' items)</option>';
                }).join('');
                var modalHtml = '' +
                    '<div class="modal fade" id="choiceGroupSuggestionPickerModal" tabindex="-1" aria-hidden="true">' +
                    '<div class="modal-dialog modal-lg modal-dialog-centered">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header bg-primary text-white">' +
                    '<h5 class="modal-title"><i class="fas fa-layer-group me-2"></i>Suggested Choice Groups</h5>' +
                    '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<label class="form-label fw-bold" for="choiceGroupSuggestionSelect">Pick a suggested group</label>' +
                    '<select id="choiceGroupSuggestionSelect" class="form-select mb-3">' + optionsHtml + '</select>' +
                    '<div class="small text-muted mb-2">Review the items below, then create the group if it looks right. Nothing is saved until you click Create Group.</div>' +
                    '<div id="choiceGroupSuggestionPreview" class="list-group" style="max-height:320px;overflow:auto;"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                    '<button type="button" class="btn btn-primary" id="createSuggestedChoiceGroupBtn"><i class="fas fa-plus me-1"></i>Create Group</button>' +
                    '</div>' +
                    '</div></div></div>';
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                var modalEl = document.getElementById('choiceGroupSuggestionPickerModal');
                var selectEl = document.getElementById('choiceGroupSuggestionSelect');
                var previewEl = document.getElementById('choiceGroupSuggestionPreview');
                var chosen = null;
                function renderPreview() {
                    var key = selectEl.value;
                    var items = buckets[key] || [];
                    previewEl.innerHTML = items.map(function(item) {
                        return '<div class="list-group-item">' +
                            '<div class="d-flex justify-content-between gap-2">' +
                            '<strong>' + itemHtmlEscape(item.name) + '</strong>' +
                            '<span class="text-primary fw-bold">$' + (parseFloat(item.rate) || 0).toFixed(2) + '</span>' +
                            '</div>' +
                            '<div class="small text-muted">' + itemHtmlEscape(item.category || 'Saved Item') + ' - ' + itemHtmlEscape(item.unitType || 'unit') + '</div>' +
                            '</div>';
                    }).join('');
                }
                selectEl.addEventListener('change', renderPreview);
                document.getElementById('createSuggestedChoiceGroupBtn').addEventListener('click', function() {
                    chosen = selectEl.value;
                    bootstrap.Modal.getInstance(modalEl).hide();
                });
                modalEl.addEventListener('hidden.bs.modal', function() {
                    modalEl.remove();
                    resolve(chosen);
                }, { once: true });
                renderPreview();
                new bootstrap.Modal(modalEl).show();
            });
        }

        async function refineDescription(textareaEl, btnEl) {
            if (!textareaEl || !btnEl) return;
            const currentText = textareaEl.value || '';
            if (!currentText.trim()) { qdAlert('Please enter a description first.'); return; }
            if (typeof requireProFeature === 'function') {
                var allowed = await requireProFeature('ai_refine', 'AI Refine');
                if (!allowed) return;
            }
            const originalBtnHTML = btnEl.innerHTML;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btnEl.disabled = true;
            try {
                const prompt = 'Improve this renovation line item description so it is clear, professional, client-friendly, and concise. Return only the improved description, no heading or quotes.\n\nDescription: ' + currentText;
                if (typeof getSupabaseFunctionAuthHeaders !== 'function') throw new Error('Please sign in again before using AI Refine.');
                const response = await fetch('https://axmoffknvblluibuitrq.supabase.co/functions/v1/ai-assistant', {
                    method: 'POST',
                    headers: await getSupabaseFunctionAuthHeaders(),
                    body: JSON.stringify({ feature: 'ai_refine', messages: [{ role: 'user', content: prompt }] })
                });
                const data = await response.json();
                if (!response.ok || data.error) throw new Error(data.error || 'AI refine failed');
                if (data.reply) {
                    const refinedText = data.reply.replace(/^["']|["']$/g, '').trim();
                    if (refinedText && refinedText !== currentText) {
                        const undoBtn = btnEl.parentElement ? btnEl.parentElement.querySelector('.undo-refine-desc-btn') : null;
                        if (undoBtn) {
                            undoBtn._previousDescription = currentText;
                            undoBtn._refinedDescription = refinedText;
                            undoBtn._showingRefined = true;
                            undoBtn.innerHTML = '<i class="fas fa-undo"></i>';
                            undoBtn.title = 'Undo AI refined description';
                            undoBtn.style.display = '';
                        }
                    }
                    textareaEl.value = refinedText;
                    textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
                    markPricingDirty();
                    if (typeof completeProTrialFeature === 'function') completeProTrialFeature('ai_refine', 'AI Refine');
                    if (typeof qdMaybeShowProUpgradePrompt === 'function') {
                        qdMaybeShowProUpgradePrompt('ai_refine_success', {
                            featureKey: 'ai_refine',
                            featureLabel: 'AI Refine',
                            message: 'AI made this easier. Keep it with Pro access.'
                        });
                    }
                }
            } catch (error) {
                console.error('AI refine failed:', error);
                var toast = document.createElement('div');
                toast.textContent = 'AI refine failed - try again';
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:white;padding:10px 15px;border-radius:4px;font-size:14px;z-index:9999;';
                document.body.appendChild(toast);
                setTimeout(function(){ toast.remove(); }, 3000);
            } finally {
                btnEl.innerHTML = originalBtnHTML;
                btnEl.disabled = false;
            }
        }

        function toggleRefinedDescription(btnEl) {
            if (!btnEl || typeof btnEl._previousDescription !== 'string' || typeof btnEl._refinedDescription !== 'string') return;
            const descScope = btnEl.closest('.description-refine-scope') || btnEl.closest('tr');
            const textarea = descScope ? descScope.querySelector('.item-description-textarea') : null;
            if (!textarea) return;
            if (btnEl._showingRefined) {
                textarea.value = btnEl._previousDescription;
                btnEl._showingRefined = false;
                btnEl.innerHTML = '<i class="fas fa-redo"></i>';
                btnEl.title = 'Redo AI refined description';
            } else {
                textarea.value = btnEl._refinedDescription;
                btnEl._showingRefined = true;
                btnEl.innerHTML = '<i class="fas fa-undo"></i>';
                btnEl.title = 'Undo AI refined description';
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            markPricingDirty();
        }

        async function deleteCustomItem(category, name) {
            if (!await qdConfirm('Delete "' + name + '" from your item database?', {
                title: 'Delete Item',
                okText: 'Delete',
                okClass: 'btn-danger',
                type: 'danger'
            })) {
                return;
            }
            pushUndoState();
            if (!customItems[category]) return;
            customItems[category] = customItems[category].filter(i => i.name !== name);
            if (customItems[category].length === 0) delete customItems[category];
            saveCustomItems();
            if (pricingDatabase[category]) {
                pricingDatabase[category] = pricingDatabase[category].filter(i => !(i._custom && i.name === name));
            }
            renderAllItemsList();
        }

        // ── End Custom Line Items ─────────────────────────────────────────────────

        window._injectItemsIntoPricingDB = _injectItemsIntoPricingDB;
        window.loadCustomItems = loadCustomItems;
        window.saveCustomItems = saveCustomItems;
        window.addNewCategory = addNewCategory;
        window.addNewUnitType = addNewUnitType;
        window.handleCategoryChange = handleCategoryChange;
        window.handleItemPhotoUpload = handleItemPhotoUpload;
        window.openManageItemsModal = openManageItemsModal;
        window.closeManageItemsModal = closeManageItemsModal;
        window.pushUndoState = pushUndoState;
        window.undoManageItems = undoManageItems;
        window.syncManageItemsUndoButtons = syncManageItemsUndoButtons;
        window.toggleManageItemsTopBar = toggleManageItemsTopBar;
        window.toggleManageItemsBottomBar = toggleManageItemsBottomBar;
        window.toggleManageNewItemPanel = toggleManageNewItemPanel;
        window.toggleManageItemsCategory = toggleManageItemsCategory;
        window.initManageItemsFooterSwipe = initManageItemsFooterSwipe;
        window.markPricingDirty = markPricingDirty;
        window.markRowDirty = markRowDirty;
        window.clearPricingDirty = clearPricingDirty;
        window.saveItemRow = saveItemRow;
        window.saveItemRowCore = saveItemRowCore;
        window._doRestoreItemsFromCloud = _doRestoreItemsFromCloud;
        window._doBackupItemsToCloud = _doBackupItemsToCloud;
        window.saveAllPricingRows = saveAllPricingRows;
        window.saveChangedPricingRows = saveChangedPricingRows;
        window.whizzScroll = whizzScroll;
        window.setManageItemsFilter = setManageItemsFilter;
        window.filterItemsList = filterItemsList;
        window.renderAllItemsList = renderAllItemsList;
        window.saveItemFieldEdit = saveItemFieldEdit;
        window.syncManageDetailBaseField = syncManageDetailBaseField;
        window.addCustomItem = addCustomItem;
        window.openChoiceGroupTemplateModal = openChoiceGroupTemplateModal;
        window.openChoiceGroupDefaultOptionPicker = openChoiceGroupDefaultOptionPicker;
        window.openChoiceGroupTypePicker = openChoiceGroupTypePicker;
        window.suggestChoiceGroupTemplates = suggestChoiceGroupTemplates;
        window.refineDescription = refineDescription;
        window.toggleRefinedDescription = toggleRefinedDescription;
        window.deleteCustomItem = deleteCustomItem;
})();
