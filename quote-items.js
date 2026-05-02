// Manage Items module extracted from quote-builder.html.
// Owns custom pricing items, manage-items modal rendering, cloud item backup, and row edit actions.
(function() {
    'use strict';

                function _injectItemsIntoPricingDB(itemsObj) {
            for (var cat in itemsObj) {
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

        function addNewCategory() {
            const newCat = prompt('Enter new category name:').trim();
            if (!newCat || newCat.length === 0) return;
            if (pricingDatabase[newCat]) { alert('Category already exists!'); return; }
            pricingDatabase[newCat] = [];
            // Repopulate dropdown
            const catSelect = document.getElementById('newItemCategory');
            const opt = document.createElement('option');
            opt.value = newCat;
            opt.textContent = newCat;
            opt.selected = true;
            catSelect.appendChild(opt);
        }

        function addNewUnitType() {
            const newUnit = prompt('Enter new unit type (e.g., "bundle", "bag", "gallon"):').trim();
            if (!newUnit || newUnit.length === 0) return;
            const datalist = document.getElementById('unitTypeOptions');
            if ([...datalist.children].find(opt => opt.value === newUnit)) { alert('Unit type already exists!'); return; }
            const opt = document.createElement('option');
            opt.value = newUnit;
            datalist.appendChild(opt);
            // Also set it in the input
            document.getElementById('newItemUnit').value = newUnit;
        }

        function handleCategoryChange() {
            // Just a placeholder - can be used for future logic
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
            // Always re-inject customItems into pricingDatabase before rendering
            if (typeof customItems === 'object' && typeof _injectItemsIntoPricingDB === 'function') {
                _injectItemsIntoPricingDB(customItems);
            }
            const catSelect = document.getElementById('newItemCategory');
            if (!catSelect) { console.error('newItemCategory not found'); return; }
            catSelect.innerHTML = '';
            Object.keys(pricingDatabase).forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSelect.appendChild(opt);
            });
            document.getElementById('newItemName').value = '';
            document.getElementById('newItemUnit').value = '';
            document.getElementById('newItemRate').value = '';
            document.getElementById('newItemMaterialCost').value = '';
            document.getElementById('newItemSupplierUrl').value = '';
            clearPricingDirty();
            const searchEl = document.getElementById('itemSearchFilter');
            if (searchEl) searchEl.value = '';
            renderAllItemsList();
(bootstrap.Modal.getInstance(document.getElementById('manageItemsModal')) || new bootstrap.Modal(document.getElementById('manageItemsModal'))).show();
        }

        function closeManageItemsModal() {
            if (pricingDirty) {
                const choice = confirm('You have unsaved pricing changes.\n\nClick OK to save all changes before closing, or Cancel to close without saving.');
                if (choice) {
                    saveAllPricingRows();
                }
            }
            clearPricingDirty();
            const modal = bootstrap.Modal.getInstance(document.getElementById('manageItemsModal'));
            if (modal) modal.hide();
        }

        let pricingDirty = false; // tracks unsaved changes in Manage Items modal
        let lastDeletedItem = null; // for undo functionality
        var undoStack = [];
        function pushUndoState() {
            if (undoStack.length >= 20) undoStack.shift();
            undoStack.push(JSON.parse(JSON.stringify(customItems)));
            var btn = document.getElementById('undoManageItemsBtn');
            if (btn) { btn.disabled = false; btn.className = 'btn btn-sm btn-danger ms-auto me-2'; }
        }
        function undoManageItems() {
            if (undoStack.length > 0) {
                customItems = undoStack.pop();
                _injectItemsIntoPricingDB(customItems);
                renderAllItemsList();
                saveCustomItems();
                var btn = document.getElementById('undoManageItemsBtn');
                if (btn) {
                    btn.disabled = undoStack.length === 0;
                    btn.className = undoStack.length === 0 ? 'btn btn-sm btn-outline-secondary ms-auto me-2' : 'btn btn-sm btn-danger ms-auto me-2';
                }
            }
        }

        function markPricingDirty() {
            pricingDirty = true;
            const indicator = document.getElementById('pricingUnsavedIndicator');
            if (indicator) indicator.style.display = 'inline';
        }

        function clearPricingDirty() {
            pricingDirty = false;
            const indicator = document.getElementById('pricingUnsavedIndicator');
            if (indicator) indicator.style.display = 'none';
        }

        function saveItemRow(cat, name) {
            pushUndoState();
            return saveItemRowCore(cat, name, { backup: true, flash: true });
        }

        function saveItemRowCore(cat, name, options) {
            options = options || {};
            const safeId = (cat + '_' + name).replace(/[^a-z0-9]/gi,'_');
            const row = document.getElementById('row_' + safeId);
            if (!row) return false;

            // Read all field values from the row
            const newName     = row.querySelector('input.item-name-input')?.value.trim() || name;
            const inputs      = row.querySelectorAll('input.item-input');
            const unitType    = inputs[0]?.value.trim() || '';
            const rate        = parseFloat(inputs[1]?.value) || 0;
            const matCost     = parseFloat(inputs[2]?.value) || 0;
            const supplierUrl = inputs[3]?.value.trim() || '';
            const descRow     = document.getElementById('desc_' + safeId);
            const itemDescription = descRow?.querySelector('.item-description-textarea')?.value.trim() || '';
            const collapseRow = document.getElementById('upg_' + safeId);
            let upgrade = null;
            if (collapseRow) {
                const upgName = collapseRow.querySelector('.upgrade-name')?.value.trim() || '';
                const upgRate = parseFloat(collapseRow.querySelector('.upgrade-rate')?.value) || 0;
                const upgDesc = collapseRow.querySelector('.upgrade-desc')?.value.trim() || '';
                if (upgName) upgrade = { name: upgName, rate: upgRate, description: upgDesc };
            }

            // Ensure category exists in customItems
            if (!customItems[cat]) customItems[cat] = [];

            // Find existing item by original name
            let ci = customItems[cat].find(i => i.name === name);
            if (!ci) {
                // Not in customItems yet - check pricingDatabase and adopt it
                const pi = pricingDatabase[cat]?.find(i => i.name === name);
                if (pi) {
                    ci = { name: pi.name, unitType: pi.unitType || '', rate: pi.rate || 0, materialCost: pi.materialCost || 0, supplierUrl: pi.supplierUrl || '', itemDescription: pi.itemDescription || '' };
                    customItems[cat].push(ci);
                } else {
                    // Brand new item
                    ci = { name, unitType: '', rate: 0, materialCost: 0, supplierUrl: '', itemDescription: '' };
                    customItems[cat].push(ci);
                }
            }

            // Overwrite all fields in place
            ci.name            = newName;
            ci.unitType        = unitType;
            ci.rate            = rate;
            ci.materialCost    = matCost;
            ci.supplierUrl     = supplierUrl;
            ci.itemDescription = itemDescription;
            if (upgrade !== null) {
                // Preserve upgrade photo from previous state
                var oldUpgPhoto = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.upgrade?.photo;
                if (!upgrade.photo && oldUpgPhoto) upgrade.photo = oldUpgPhoto;
                ci.upgrade = upgrade;
            }
            // Preserve item photo from previous state
            if (!ci.photo) {
                var oldPhoto = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.photo;
                if (oldPhoto) ci.photo = oldPhoto;
            }

            // Mirror into pricingDatabase
            if (!pricingDatabase[cat]) pricingDatabase[cat] = [];
            const pi = pricingDatabase[cat].find(i => i.name === name);
            if (pi) { Object.assign(pi, ci, { _custom: true }); }

            // Save to localStorage
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));

            // Flash row green
            if (options.flash !== false) {
                row.style.transition = 'background 0.3s';
                row.style.background = '#d1e7dd';
                setTimeout(() => { row.style.background = ''; }, 900);
            }
            clearPricingDirty();

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

        function filterItemsList() {
            const q = (document.getElementById('itemSearchFilter')?.value || '').toLowerCase().trim();
            const container = document.getElementById('customItemsList');

            container.querySelectorAll('table').forEach(table => {
                let anyVisible = false;
                table.querySelectorAll('tbody tr').forEach(row => {
                    // Skip hidden desc/upgrade collapse rows - never touch them
                    const isCollapse = row.id && (row.id.startsWith('desc_') || row.id.startsWith('upg_'));
                    if (isCollapse) return;

                    if (!q) {
                        row.style.display = '';
                        anyVisible = true;
                        return;
                    }
                    // Name is now in an input field, not a <strong>
                    const nameInput = row.querySelector('input.item-name-input');
                    const name = (nameInput?.value || '').toLowerCase();
                    const show = name.includes(q);
                    row.style.display = show ? '' : 'none';
                    if (show) anyVisible = true;
                });
                table.style.display = (!q || anyVisible) ? '' : 'none';
                const prev = table.previousElementSibling;
                if (prev && prev.tagName === 'H6') prev.style.display = (!q || anyVisible) ? '' : 'none';
            });
        }

        function renderAllItemsList() {
            const container = document.getElementById('customItemsList');
            let html = '';

            Object.entries(pricingDatabase).forEach(([cat, items]) => {
                if (!items.length) return;
                const catSty = categoryStyles[cat] || {};
                const cIcon = catSty.icon || 'fa-tag';
                const cColor = catSty.color || '#f0f4ff';
                const catEsc = cat.replace(/'/g, "\\'");
                html += `<div class="d-flex align-items-center gap-2 mt-3 mb-1 px-2 py-1 rounded" style="background:${cColor};">
                  <i class="fas ${cIcon}" style="color:#495057;"></i>
                  <h6 class="fw-bold mb-0 text-primary" style="flex:1;">${cat}</h6>
                  <button class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem; padding:1px 8px;" onclick="openCategoryStylePicker('${catEsc}', this)" title="Customize icon &amp; colour">
                    <i class="fas fa-palette me-1"></i>Style
                  </button>
                </div>`;
                html += '<table class="table table-sm table-bordered mb-2"><thead class="table-light"><tr><th>Name</th><th style="width:80px">Unit</th><th style="width:90px">Rate ($)</th><th style="width:100px">Mat. Cost ($)</th><th>Supplier URL</th><th style="width:110px"></th></tr></thead><tbody>';
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
                    const upgRate = parseFloat(upg.rate || 0).toFixed(2);
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
                        <td><input type="url" class="form-control form-control-sm item-input" value="${supplier}" placeholder="https://..." oninput="markPricingDirty()"></td>
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
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-info fw-bold"><i class="fas fa-align-left"></i> Item Description (shown to clients on interactive quote)</small>
                                    <button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI ✨ Refine</button>
                                </div>
                                <textarea class="form-control form-control-sm item-description-textarea mt-2" rows="3" placeholder="e.g., Complete drywall installation including hanging, mudding, taping, sanding and priming. Professional finish ready for paint." spellcheck="true" oninput="markPricingDirty()">${item.itemDescription || ''}</textarea>
                            </div>
                        </td>
                    </tr>
                    <tr id="${collapseId}" style="display:none; background:#fffbea;">
                        <td colspan="6">
                            <div class="p-2">
                                <small class="text-warning fw-bold"><i class="fas fa-arrow-up"></i> Upgrade Option</small>
                                <div class="row g-2 mt-1">
                                    <div class="col-md-4">
                                        <label class="form-label" style="font-size:0.75em">Upgrade Name</label>
                                        <input type="text" class="form-control form-control-sm upgrade-name" value="${upgName}" placeholder="e.g., Tall Baseboard 5.5&quot;" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label" style="font-size:0.75em">Upgrade Rate ($)</label>
                                        <input type="number" class="form-control form-control-sm upgrade-rate" value="${upgRate}" step="0.01" min="0" oninput="markPricingDirty()">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" style="font-size:0.75em">Description (shown to client)</label>
                                        <input type="text" class="form-control form-control-sm upgrade-desc" value="${upgDesc}" placeholder="e.g., Premium 5.5&quot; tall baseboard - a luxurious finishing touch" oninput="markPricingDirty()">
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

            if (!name || !unitType) {
                alert('Please fill in item name and unit type.');
                return;
            }

            if (!customItems[category]) customItems[category] = [];
            if (customItems[category].find(i => i.name === name) ||
                pricingDatabase[category]?.find(i => i.name === name)) {
                alert('An item with this name already exists in this category.');
                return;
            }

            const newItem = { name, unitType, rate, materialCost, supplierUrl, itemDescription };
            customItems[category].push(newItem);
            saveCustomItems();

            if (!pricingDatabase[category]) pricingDatabase[category] = [];
            pricingDatabase[category].push({ ...newItem, _custom: true });

            document.getElementById('newItemName').value = '';
            document.getElementById('newItemUnit').value = '';
            document.getElementById('newItemRate').value = '';
            document.getElementById('newItemMaterialCost').value = '';
            document.getElementById('newItemSupplierUrl').value = '';
            if (document.getElementById('newItemDescription')) document.getElementById('newItemDescription').value = '';

            renderAllItemsList();
        }

        async function refineDescription(textareaEl, btnEl) {
            if (!textareaEl || !btnEl) return;
            const currentText = textareaEl.value || '';
            if (!currentText.trim()) { alert('Please enter a description first.'); return; }
            const originalBtnHTML = btnEl.innerHTML;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btnEl.disabled = true;
            try {
                const prompt = 'Improve this renovation line item description so it is clear, professional, client-friendly, and concise. Return only the improved description, no heading or quotes.\n\nDescription: ' + currentText;
                const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
                const response = await fetch('https://axmoffknvblluibuitrq.supabase.co/functions/v1/ai-assistant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey },
                    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
                });
                const data = await response.json();
                if (!response.ok || data.error) throw new Error(data.error || 'AI refine failed');
                if (data.reply) {
                    textareaEl.value = data.reply.replace(/^["']|["']$/g, '').trim();
                    textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
                    markPricingDirty();
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

        function deleteCustomItem(category, name) {
            if (!confirm('Are you sure you want to delete this item?\n\n' + name)) {
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
        window.markPricingDirty = markPricingDirty;
        window.clearPricingDirty = clearPricingDirty;
        window.saveItemRow = saveItemRow;
        window.saveItemRowCore = saveItemRowCore;
        window._doRestoreItemsFromCloud = _doRestoreItemsFromCloud;
        window._doBackupItemsToCloud = _doBackupItemsToCloud;
        window.saveAllPricingRows = saveAllPricingRows;
        window.whizzScroll = whizzScroll;
        window.filterItemsList = filterItemsList;
        window.renderAllItemsList = renderAllItemsList;
        window.saveItemFieldEdit = saveItemFieldEdit;
        window.addCustomItem = addCustomItem;
        window.refineDescription = refineDescription;
        window.deleteCustomItem = deleteCustomItem;
})();
