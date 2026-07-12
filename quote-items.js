// Manage Items module extracted from quote-builder.html.
// Owns custom pricing items, manage-items modal rendering, cloud item backup, and row edit actions.
(function() {
    'use strict';

        var CREATE_NEW_CATEGORY_VALUE = '__quote_dr_create_new_category__';
        var MANAGE_CUSTOM_UNIT_VALUE = '__quote_dr_custom_unit__';
        var MANAGE_CUSTOM_UNITS_KEY = 'ald_manage_custom_unit_types';
        var MANAGE_CATEGORY_STATE_KEY = 'ald_manage_items_category_state';
        var MANAGE_CATEGORY_RENAMES_KEY = 'ald_manage_items_category_renames';
        var MANAGE_CATEGORY_ORDER_MODE_KEY = 'ald_manage_items_category_order_mode';
        var MANAGE_CATEGORY_CUSTOM_ORDER_KEY = 'ald_manage_items_category_custom_order';
        var MANAGE_PORTRAIT_FIELDS_KEY = 'ald_manage_items_portrait_fields';
        var manageItemsFilter = 'all';
        var manageItemsCategoryState = {};
        var manageCategoryRenames = {};
        var manageItemsCategoryOrderMode = 'alphabetical';
        var manageItemsCategoryCustomOrder = [];
        var manageCategorySortable = null;
        var manageNewItemWizardUpgradeGroups = [];
        var manageUpgradeWizardState = null;
        var MANAGE_ITEM_PHOTO_LIMIT = 3;
        var MANAGE_FULL_RES_PHOTO_BUCKET = 'item-full-res-photos';
        var MANAGE_FULL_RES_PHOTO_FEATURE = 'full_resolution_photos';
        var MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
        var manageOpenDetailSections = {};
        var dirtyPricingRows = new Set();
        var pricingOtherDirty = false;

        function getManageItemsPortraitFields() {
            try {
                var parsed = JSON.parse(localStorage.getItem(MANAGE_PORTRAIT_FIELDS_KEY) || '[]');
                return Array.isArray(parsed) ? parsed.map(function(field) { return String(field || '').trim(); }).filter(Boolean) : [];
            } catch (e) {
                return [];
            }
        }

        function applyManageItemsPortraitFieldSettings() {
            var modal = document.getElementById('manageItemsModal');
            if (!modal) return;
            var fields = getManageItemsPortraitFields();
            ['badges', 'unit', 'rate', 'material', 'supplier'].forEach(function(field) {
                modal.setAttribute('data-portrait-show-' + field, fields.indexOf(field) !== -1 ? '1' : '0');
            });
        }

        function manageItemsEscape(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
                return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
            });
        }

        function manageItemsAttr(value) {
            return manageItemsEscape(value).replace(/`/g, '&#96;');
        }

        function manageFullResPhotoPricingUrl() {
            return 'pricing.html?plan=pro&feature=' + encodeURIComponent(MANAGE_FULL_RES_PHOTO_FEATURE);
        }

        function renderManageFullResUpgradeNote() {
            return '<div class="small text-muted manage-full-res-upgrade-note mt-1" style="display:none;"><a href="' + manageItemsAttr(manageFullResPhotoPricingUrl()) + '" class="fw-semibold">Upgrade to Pro to show full resolution</a>.</div>';
        }

        function normalizeManageFullResPhotoMeta(meta) {
            if (!meta) return null;
            if (typeof meta === 'string') {
                var url = meta.trim();
                return url ? { url: url, path: '', sizeBytes: 0 } : null;
            }
            var fullUrl = String(meta.url || meta.publicUrl || meta.fullUrl || '').trim();
            var path = String(meta.path || meta.storagePath || '').trim();
            if (!fullUrl && !path) return null;
            return {
                url: fullUrl,
                path: path,
                sizeBytes: Math.max(0, parseInt(meta.sizeBytes || meta.size || 0, 10) || 0),
                width: Math.max(0, parseInt(meta.width || 0, 10) || 0),
                height: Math.max(0, parseInt(meta.height || 0, 10) || 0),
                mimeType: meta.mimeType || meta.type || '',
                name: meta.name || '',
                uploadedAt: meta.uploadedAt || meta.createdAt || ''
            };
        }

        function manageFullResPhotoUrl(meta) {
            meta = normalizeManageFullResPhotoMeta(meta);
            return meta ? (meta.url || meta.publicUrl || '') : '';
        }

        function manageFullResPhotoDataAttr(meta) {
            meta = normalizeManageFullResPhotoMeta(meta);
            return meta ? manageItemsAttr(JSON.stringify(meta)) : '';
        }

        async function openManageItemPhotoLightbox(trigger) {
            var src = trigger && trigger.getAttribute ? (trigger.getAttribute('data-photo-src') || trigger.getAttribute('src') || '') : '';
            var rawFull = trigger && trigger.getAttribute ? (trigger.getAttribute('data-full-photo') || '') : '';
            var fullMeta = null;
            if (rawFull) {
                try { fullMeta = JSON.parse(rawFull); } catch(e) { fullMeta = rawFull; }
            }
            var fullUrl = manageFullResPhotoUrl(fullMeta);
            var useFull = false;
            if (fullUrl) {
                try { useFull = await manageCanUseFullResPhotos(); } catch(e) { useFull = false; }
            }
            if (typeof openPhotoLightbox === 'function') openPhotoLightbox(useFull && fullUrl ? fullUrl : src);
        }

        function normalizeManageItemPhotosFull(item) {
            if (!item) return [];
            var full = [];
            if (Array.isArray(item.photosFull)) {
                item.photosFull.forEach(function(meta) {
                    full.push(normalizeManageFullResPhotoMeta(meta));
                });
            }
            if (!full.length && item.photoFull) {
                full.push(normalizeManageFullResPhotoMeta(item.photoFull));
            }
            return full.slice(0, MANAGE_ITEM_PHOTO_LIMIT);
        }

        function manageFullResPhotoIdentity(meta) {
            meta = normalizeManageFullResPhotoMeta(meta);
            return meta ? (meta.path || meta.url || '') : '';
        }

        function collectManageFullResPhotoMetasFromItem(item, out) {
            if (!item || !out) return;
            normalizeManageItemPhotosFull(item).forEach(function(meta) {
                if (meta) out.push(meta);
            });
            if (item.upgrade && item.upgrade.photoFull) {
                var legacyMeta = normalizeManageFullResPhotoMeta(item.upgrade.photoFull);
                if (legacyMeta) out.push(legacyMeta);
            }
            normalizeManageItemUpgradeGroups(item).forEach(function(group) {
                (group.options || []).forEach(function(option) {
                    var meta = normalizeManageFullResPhotoMeta(option.photoFull);
                    if (meta) out.push(meta);
                });
            });
        }

        function collectManageFullResPhotoMetas() {
            var metas = [];
            [customItems, pricingDatabase].forEach(function(db) {
                if (!db) return;
                Object.keys(db).forEach(function(cat) {
                    if (cat === '__choiceGroupTemplates' || !Array.isArray(db[cat])) return;
                    db[cat].forEach(function(item) {
                        collectManageFullResPhotoMetasFromItem(item, metas);
                    });
                });
            });
            return metas;
        }

        function getManageFullResPhotoUsageBytes(excludeMeta) {
            var excludeId = manageFullResPhotoIdentity(excludeMeta);
            var seen = {};
            return collectManageFullResPhotoMetas().reduce(function(total, meta) {
                meta = normalizeManageFullResPhotoMeta(meta);
                if (!meta) return total;
                var id = manageFullResPhotoIdentity(meta);
                if (!id || id === excludeId || seen[id]) return total;
                seen[id] = true;
                return total + (parseInt(meta.sizeBytes || 0, 10) || 0);
            }, 0);
        }

        function canAddManageFullResPhotoBytes(sizeBytes, existingMeta) {
            var nextUsageBytes = getManageFullResPhotoUsageBytes(existingMeta) + (parseInt(sizeBytes || 0, 10) || 0);
            return {
                allowed: nextUsageBytes <= MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES,
                nextUsageBytes: nextUsageBytes,
                limitBytes: MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES
            };
        }

        function formatManagePhotoBytes(bytes) {
            var value = parseInt(bytes || 0, 10) || 0;
            if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' GB';
            if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
            if (value >= 1024) return Math.round(value / 1024) + ' KB';
            return value + ' B';
        }

        async function manageCanUseFullResPhotos() {
            try {
                if (typeof hasFeature === 'function') return await hasFeature('full_resolution_photos');
                if (typeof isCurrentUserPro === 'function') return await isCurrentUserPro();
            } catch(e) {}
            return false;
        }

        function safeManagePhotoPathPart(value) {
            return String(value || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'photo';
        }

        function managePhotoFileExtension(file) {
            var name = file && file.name ? String(file.name) : '';
            var match = name.match(/\.([a-z0-9]{2,5})$/i);
            if (match) return match[1].toLowerCase();
            var type = file && file.type ? String(file.type).toLowerCase() : '';
            if (type.indexOf('png') !== -1) return 'png';
            if (type.indexOf('webp') !== -1) return 'webp';
            if (type.indexOf('gif') !== -1) return 'gif';
            return 'jpg';
        }

        async function uploadManageFullResPhoto(file, context, existingMeta, dimensions) {
            context = context || {};
            if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) return null;
            var quota = canAddManageFullResPhotoBytes(file.size || 0, existingMeta);
            if (!quota.allowed) {
                throw new Error('Full-resolution photo storage is full. QuoteDr Pro includes ' + formatManagePhotoBytes(MANAGE_FULL_RES_PHOTO_ACCOUNT_LIMIT_BYTES) + ' for saved item photos.');
            }
            if (typeof _supabase === 'undefined' || !_supabase || !_supabase.auth || !_supabase.storage) {
                throw new Error('Sign in to retain full-resolution photos.');
            }
            var current = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
            if (!current) {
                var userResult = await _supabase.auth.getUser();
                current = userResult && userResult.data && userResult.data.user;
            }
            var userId = current && current.id;
            if (!userId) throw new Error('Sign in to retain full-resolution photos.');
            var extension = managePhotoFileExtension(file);
            var path = [
                userId,
                safeManagePhotoPathPart(context.cat),
                safeManagePhotoPathPart(context.name),
                safeManagePhotoPathPart(context.field || 'photo'),
                Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + extension
            ].join('/');
            var upload = await _supabase.storage.from(MANAGE_FULL_RES_PHOTO_BUCKET).upload(path, file, {
                contentType: file.type || 'image/jpeg',
                upsert: false
            });
            if (upload && upload.error) throw upload.error;
            var publicUrl = _supabase.storage.from(MANAGE_FULL_RES_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
            return normalizeManageFullResPhotoMeta({
                url: publicUrl,
                path: path,
                sizeBytes: file.size || 0,
                width: dimensions && dimensions.width,
                height: dimensions && dimensions.height,
                mimeType: file.type || '',
                name: file.name || '',
                uploadedAt: new Date().toISOString()
            });
        }

        function removeManageFullResPhotoMeta(meta) {
            meta = normalizeManageFullResPhotoMeta(meta);
            if (!meta || !meta.path || typeof _supabase === 'undefined' || !_supabase || !_supabase.storage) return;
            _supabase.storage.from(MANAGE_FULL_RES_PHOTO_BUCKET).remove([meta.path]).catch(function(){});
        }

        function refreshManageFullResPhotoUpgradeNotes() {
            var notes = Array.from(document.querySelectorAll('.manage-full-res-upgrade-note'));
            if (!notes.length) return;
            manageCanUseFullResPhotos().then(function(allowed) {
                notes.forEach(function(note) {
                    note.style.display = allowed ? 'none' : '';
                });
            });
        }

        function normalizeManageUpgradeType(value) {
            const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (clean === 'consultation' || clean === 'requires_consultation') return 'consultation';
            return clean === 'add_on' || clean === 'addon' ? 'add_on' : 'replacement';
        }

        function normalizeManageUpgradeGroupType(value) {
            const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (clean === 'consultation' || clean === 'requires_consultation') return 'consultation';
            return clean === 'multiple' ? 'multiple' : 'single_optional';
        }

        function normalizeManageUpgradeQuantityMode(value) {
            const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (clean === 'manual' || clean === 'quote_quantity' || clean === 'enter_quantity_on_quote') return 'manual';
            if (clean === 'multiplier') return 'multiplier';
            if (clean === 'override' || clean === 'fixed' || clean === 'fixed_quantity') return 'override';
            return 'parent';
        }

        function normalizeManageUnitForCompare(unit) {
            const clean = String(unit || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (!clean) return '';
            if (['sq ft', 'sqft', 'square foot', 'square feet', 'sf'].indexOf(clean) !== -1) return 'sq ft';
            if (['lf', 'linear foot', 'linear feet', 'linear ft', 'lin ft'].indexOf(clean) !== -1) return 'lf';
            if (['each', 'ea'].indexOf(clean) !== -1) return 'each';
            return clean;
        }

        function manageUpgradeUnitsDiffer(baseUnitType, upgradeUnitType) {
            const base = normalizeManageUnitForCompare(baseUnitType);
            const upgrade = normalizeManageUnitForCompare(upgradeUnitType);
            return !!base && !!upgrade && base !== upgrade;
        }

        function manageUpgradeGroupId(prefix) {
            return (prefix || 'upg') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }

        function normalizeManageUpgradeOption(option, fallbackId) {
            option = option || {};
            return {
                id: option.id || fallbackId || manageUpgradeGroupId('upo'),
                name: option.name || option.sourceItemName || '',
                unitType: option.unitType || option.unit || '',
                rate: parseFloat(option.rate || 0) || 0,
                materialCost: parseFloat(option.materialCost || option.material_cost || 0) || 0,
                supplierUrl: option.supplierUrl || '',
                photo: option.photo || '',
                photoFull: normalizeManageFullResPhotoMeta(option.photoFull),
                description: option.description || option.itemDescription || '',
                itemDescription: option.itemDescription || option.description || '',
                upgradeType: normalizeManageUpgradeType(option.upgradeType || option.type || option.mode),
                requiresConsultation: option.requiresConsultation === true || normalizeManageUpgradeType(option.upgradeType || option.type || option.mode) === 'consultation',
                quantityMode: normalizeManageUpgradeQuantityMode(option.quantityMode),
                quantityMultiplier: parseFloat(option.quantityMultiplier || 1) || 1,
                quantityOverride: parseFloat(option.quantityOverride || 0) || 0,
                manualQuantity: parseFloat(option.manualQuantity || 0) || 0,
                sourceItemName: option.sourceItemName || '',
                category: option.category || '',
                availableAfterOptionIds: Array.isArray(option.availableAfterOptionIds) ? option.availableAfterOptionIds.filter(Boolean) : [],
                blockedByOptionIds: Array.isArray(option.blockedByOptionIds) ? option.blockedByOptionIds.filter(Boolean) : []
            };
        }

        function normalizeManageItemUpgradeGroups(item) {
            item = item || {};
            const groups = Array.isArray(item.upgradeGroups) ? item.upgradeGroups : [];
            const normalized = groups.map(function(group, groupIndex) {
                group = group || {};
                const options = Array.isArray(group.options) ? group.options.map(function(option, optionIndex) {
                    return normalizeManageUpgradeOption(option, 'upo_' + groupIndex + '_' + optionIndex);
                }).filter(function(option) { return String(option.name || '').trim(); }) : [];
                return {
                    id: group.id || manageUpgradeGroupId('upg'),
                    name: group.name || (groupIndex === 0 ? 'Upgrade Options' : 'Upgrade Group'),
                    note: group.note || '',
                    type: normalizeManageUpgradeGroupType(group.type),
                    options: options
                };
            }).filter(function(group) { return group.options.length || group.name; });

            if (!normalized.length && item.upgrade && item.upgrade.name) {
                normalized.push({
                    id: 'legacy_upgrade',
                    name: 'Upgrade Options',
                    note: '',
                    type: 'single_optional',
                    options: [normalizeManageUpgradeOption(Object.assign({}, item.upgrade, {
                        id: item.upgrade.id || 'legacy_upgrade_option',
                        upgradeType: item.upgrade.upgradeType || item.upgrade.type || item.upgrade.mode || 'replacement'
                    }))]
                });
            }
            return normalized;
        }

        function cloneManageUpgradeGroups(groups) {
            try {
                return JSON.parse(JSON.stringify(Array.isArray(groups) ? groups : []));
            } catch(e) {
                return [];
            }
        }

        function cloneManageUpgradeGroup(group) {
            const normalized = normalizeManageItemUpgradeGroups({ upgradeGroups: [group || {}] });
            return normalized[0] ? cloneManageUpgradeGroups([normalized[0]])[0] : {
                id: manageUpgradeGroupId('upg'),
                name: 'Upgrade Options',
                note: '',
                type: 'single_optional',
                options: []
            };
        }

        function inferManageUpgradeWizardSetupType(group) {
            group = group || {};
            const options = Array.isArray(group.options) ? group.options : [];
            const hasPathRules = options.some(function(option) {
                return (Array.isArray(option.availableAfterOptionIds) && option.availableAfterOptionIds.length) ||
                    (Array.isArray(option.blockedByOptionIds) && option.blockedByOptionIds.length);
            });
            if (hasPathRules) return 'path';
            if (group.type === 'consultation') return 'simple';
            if (group.type === 'multiple') return 'multiple';
            return options.length <= 1 ? 'simple' : 'pick_one';
        }

        function flattenManageUpgradeSourceItems() {
            const items = [];
            Object.keys(pricingDatabase || {}).forEach(function(category) {
                const list = pricingDatabase[category];
                if (category.indexOf('__') === 0 || !Array.isArray(list)) return;
                list.forEach(function(item) {
                    if (!item || !item.name) return;
                    items.push({
                        category: category,
                        name: item.name,
                        unitType: item.unitType || '',
                        rate: parseFloat(item.rate || 0) || 0,
                        materialCost: parseFloat(item.materialCost || 0) || 0,
                        supplierUrl: item.supplierUrl || '',
                        description: item.itemDescription || item.description || ''
                    });
                });
            });
            return items;
        }

        function renderManageUpgradeSourceSelect(selectedName, selectedCategory) {
            const selectedKey = (selectedCategory || '') + '||' + (selectedName || '');
            const options = ['<option value="">Type custom upgrade...</option>'];
            flattenManageUpgradeSourceItems().forEach(function(item) {
                const key = item.category + '||' + item.name;
                options.push('<option value="' + manageItemsAttr(key) + '" ' +
                    'data-category="' + manageItemsAttr(item.category) + '" ' +
                    'data-name="' + manageItemsAttr(item.name) + '" ' +
                    'data-unit="' + manageItemsAttr(item.unitType) + '" ' +
                    'data-rate="' + manageItemsAttr(item.rate) + '" ' +
                    'data-cost="' + manageItemsAttr(item.materialCost) + '" ' +
                    'data-supplier="' + manageItemsAttr(item.supplierUrl) + '" ' +
                    'data-description="' + manageItemsAttr(item.description) + '" ' +
                    (key === selectedKey ? 'selected' : '') + '>' +
                    manageItemsEscape(item.category + ' - ' + item.name) +
                    '</option>');
            });
            return '<select class="form-select form-select-sm upgrade-source-item" onchange="fillManageUpgradeOptionFromSource(this); markPricingDirty(this)">' + options.join('') + '</select>';
        }

        const MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE = '__always_available__';

        function filterManageUpgradeRuleOptionIds(values) {
            return Array.from(values || []).map(function(value) {
                return String(value || '');
            }).filter(function(value) {
                return value && value !== MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE;
            });
        }

        function collectManageUpgradeRuleCheckboxIds(optionEl, className, fallback) {
            const inputs = Array.from(optionEl?.querySelectorAll('input.' + className) || []);
            if (!inputs.length) return Array.isArray(fallback) ? fallback.slice() : [];
            return filterManageUpgradeRuleOptionIds(inputs.filter(function(input) {
                return input.checked;
            }).map(function(input) {
                return input.value;
            }));
        }

        function handleManageUpgradePathSelectChange(inputEl) {
            if (!inputEl || !inputEl.classList.contains('upgrade-available-after')) return;
            const groupEl = inputEl.closest('.manage-upgrade-rule-checkboxes');
            if (!groupEl) return;
            const checkboxes = Array.from(groupEl.querySelectorAll('input.upgrade-available-after'));
            if (inputEl.value === MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE && inputEl.checked) {
                checkboxes.forEach(function(checkbox) {
                    checkbox.checked = checkbox === inputEl;
                });
                return;
            }
            if (inputEl.value !== MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE && inputEl.checked) {
                checkboxes.forEach(function(checkbox) {
                    if (checkbox.value === MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE) checkbox.checked = false;
                });
            }
        }

        function renderManageUpgradePathSelect(allOptions, selectedIds, selfId, className, label) {
            selectedIds = Array.isArray(selectedIds) ? selectedIds : [];
            const usable = (allOptions || []).filter(function(option) { return option.id !== selfId && option.name; });
            if (!usable.length) return '<div class="small text-muted">' + label + ': add another option first.</div>';
            const isAvailableAfter = className === 'upgrade-available-after';
            return '<label class="form-label mb-1" style="font-size:0.75em">' + label + '</label>' +
                '<div class="manage-upgrade-rule-checkboxes border rounded bg-white p-2">' +
                (isAvailableAfter ? '<label class="form-check small mb-1"><input type="checkbox" class="form-check-input ' + className + '" value="' + MANAGE_UPGRADE_ALWAYS_AVAILABLE_VALUE + '" ' + (!selectedIds.length ? 'checked' : '') + ' onchange="handleManageUpgradePathSelectChange(this); markPricingDirty(this)"> <span class="form-check-label">Always available</span></label>' : '') +
                usable.map(function(option) {
                    return '<label class="form-check small mb-1"><input type="checkbox" class="form-check-input ' + className + '" value="' + manageItemsAttr(option.id) + '" ' + (selectedIds.indexOf(option.id) !== -1 ? 'checked' : '') + ' onchange="handleManageUpgradePathSelectChange(this); markPricingDirty(this)"> <span class="form-check-label">' + manageItemsEscape(option.name) + '</span></label>';
                }).join('') +
                '</div>';
        }

        function renderManageUpgradeQuantityControls(option, baseUnitType) {
            option = normalizeManageUpgradeOption(option || {});
            const mode = normalizeManageUpgradeQuantityMode(option.quantityMode);
            const baseUnit = String(baseUnitType || '').trim();
            const upgradeUnit = String(option.unitType || '').trim();
            const hasMismatch = manageUpgradeUnitsDiffer(baseUnit, upgradeUnit);
            const multiplier = parseFloat(option.quantityMultiplier || 1) || 1;
            const override = parseFloat(option.quantityOverride || 0) || 0;
            return '<div class="col-12 manage-upgrade-quantity-controls">' +
                (hasMismatch ? '<div class="alert alert-warning py-2 px-2 small mb-2 manage-upgrade-unit-warning"><i class="fas fa-triangle-exclamation me-1"></i>Base item is <strong>' + manageItemsEscape(baseUnit || 'not set') + '</strong>, upgrade is <strong>' + manageItemsEscape(upgradeUnit || 'not set') + '</strong>. Choose how QuoteDr should calculate this upgrade quantity.</div>' : '') +
                '<div class="row g-2 align-items-end">' +
                '<div class="col-md-4"><label class="form-label mb-1" style="font-size:0.75em">Quantity behavior</label><select class="form-select form-select-sm upgrade-quantity-mode" onchange="handleManageUpgradeQuantityModeChange(this); markPricingDirty(this)">' +
                '<option value="parent" ' + (mode === 'parent' ? 'selected' : '') + '>Use parent quantity</option>' +
                '<option value="manual" ' + (mode === 'manual' ? 'selected' : '') + '>Enter quantity on quote</option>' +
                '<option value="multiplier" ' + (mode === 'multiplier' ? 'selected' : '') + '>Multiplier</option>' +
                '<option value="override" ' + (mode === 'override' ? 'selected' : '') + '>Fixed quantity</option>' +
                '</select></div>' +
                '<div class="col-md-4 upgrade-quantity-multiplier-wrap" style="' + (mode === 'multiplier' ? '' : 'display:none') + '"><label class="form-label mb-1" style="font-size:0.75em">Multiplier</label><input type="number" class="form-control form-control-sm upgrade-quantity-multiplier" value="' + manageItemsAttr(multiplier) + '" step="0.01" min="0" oninput="markPricingDirty(this)"><div class="small text-muted mt-1">Example: base qty x multiplier.</div></div>' +
                '<div class="col-md-4 upgrade-quantity-override-wrap" style="' + (mode === 'override' ? '' : 'display:none') + '"><label class="form-label mb-1" style="font-size:0.75em">Fixed quantity</label><input type="number" class="form-control form-control-sm upgrade-quantity-override" value="' + manageItemsAttr(override) + '" step="0.01" min="0" oninput="markPricingDirty(this)"></div>' +
                '<div class="col-md-4 upgrade-quantity-manual-note" style="' + (mode === 'manual' ? '' : 'display:none') + '"><div class="small text-muted">Quote Builder will show a quantity box for this upgrade before you send the quote.</div></div>' +
                '</div>' +
                '</div>';
        }

        function readManageUpgradeOptionQuantityState(optionEl, previousState) {
            previousState = previousState || {};
            const modeControl = optionEl?.querySelector('.upgrade-quantity-mode');
            const multiplierControl = optionEl?.querySelector('.upgrade-quantity-multiplier');
            const overrideControl = optionEl?.querySelector('.upgrade-quantity-override');
            return {
                quantityMode: modeControl ? normalizeManageUpgradeQuantityMode(modeControl.value) : normalizeManageUpgradeQuantityMode(previousState.quantityMode),
                quantityMultiplier: multiplierControl ? (parseFloat(multiplierControl.value || 1) || 1) : (parseFloat(previousState.quantityMultiplier || 1) || 1),
                quantityOverride: overrideControl ? (parseFloat(overrideControl.value || 0) || 0) : (parseFloat(previousState.quantityOverride || 0) || 0)
            };
        }

        function syncManageUpgradeWizardOptionQuantityState(optionEl) {
            if (!optionEl || !manageUpgradeWizardState || !manageUpgradeWizardState.group) return;
            if (!optionEl.closest('#manageUpgradeWizardModal')) return;
            const optionId = optionEl.dataset.upgradeOptionId || '';
            if (!optionId) return;
            const options = Array.isArray(manageUpgradeWizardState.group.options) ? manageUpgradeWizardState.group.options : [];
            const option = options.find(function(candidate) { return candidate.id === optionId; });
            if (!option) return;
            Object.assign(option, readManageUpgradeOptionQuantityState(optionEl, option), {
                name: optionEl.querySelector('.upgrade-name')?.value || option.name || '',
                unitType: optionEl.querySelector('.upgrade-unit-type')?.value || option.unitType || ''
            });
        }

        function refreshManageUpgradeQuantityControls(optionEl) {
            if (!optionEl) return;
            const controls = optionEl.querySelector('.manage-upgrade-quantity-controls');
            if (!controls) return;
            const detailsRow = optionEl.closest('.item-details-row');
            const baseUnit = detailsRow ? rowUnitTypeForDetails(detailsRow) : (manageUpgradeWizardState?.baseUnitType || '');
            const option = Object.assign(readManageUpgradeOptionQuantityState(optionEl), {
                id: optionEl.dataset.upgradeOptionId || '',
                name: optionEl.querySelector('.upgrade-name')?.value || '',
                unitType: optionEl.querySelector('.upgrade-unit-type')?.value || ''
            });
            syncManageUpgradeWizardOptionQuantityState(optionEl);
            controls.outerHTML = renderManageUpgradeQuantityControls(option, baseUnit);
        }

        function handleManageUpgradeQuantityModeChange(selectEl) {
            const controls = selectEl ? selectEl.closest('.manage-upgrade-quantity-controls') : null;
            if (!controls) return;
            const mode = normalizeManageUpgradeQuantityMode(selectEl.value);
            const multiplierWrap = controls.querySelector('.upgrade-quantity-multiplier-wrap');
            const overrideWrap = controls.querySelector('.upgrade-quantity-override-wrap');
            const manualNote = controls.querySelector('.upgrade-quantity-manual-note');
            if (multiplierWrap) multiplierWrap.style.display = mode === 'multiplier' ? '' : 'none';
            if (overrideWrap) overrideWrap.style.display = mode === 'override' ? '' : 'none';
            if (manualNote) manualNote.style.display = mode === 'manual' ? '' : 'none';
            syncManageUpgradeWizardOptionQuantityState(selectEl.closest('.manage-upgrade-wizard-option'));
        }

        function renderManageItemUpgradeGroupsEditor(item, baseUnitType) {
            const groups = normalizeManageItemUpgradeGroups(item);
            const flatOptions = [];
            groups.forEach(function(group) {
                (group.options || []).forEach(function(option) { flatOptions.push(option); });
            });
            let html = '<div class="border rounded p-2 bg-light manage-upgrade-groups-editor">' +
                '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">' +
                '<div><small class="text-warning fw-bold"><i class="fas fa-arrow-up"></i> Upgrade Groups</small>' +
                '<div class="small text-muted">Create client-facing upgrade choices. Use <strong>Available after</strong> and <strong>Blocked by</strong> for simple upgrade paths.</div></div>' +
                '<div class="d-flex gap-1 flex-wrap">' +
                '<button type="button" class="btn btn-sm btn-primary" data-upgrade-wizard-action="open-new"><i class="fas fa-magic me-1"></i>Upgrade Wizard</button>' +
                '<button type="button" class="btn btn-sm btn-outline-primary" data-upgrade-group-action="add-single-upgrade"><i class="fas fa-arrow-up me-1"></i>Single Upgrade</button>' +
                '<button type="button" class="btn btn-sm btn-outline-primary" data-upgrade-group-action="add-group"><i class="fas fa-plus me-1"></i>Add Upgrade Group</button>' +
                '</div>' +
                '</div>';

            if (!groups.length) {
                html += '<div class="alert alert-info my-2 py-2">No upgrade groups yet. Add a group like <strong>Drink Rail</strong> or <strong>Post Caps</strong>, then add upgrade options.</div>';
            }

            groups.forEach(function(group, groupIndex) {
                const isConsultationGroup = group.type === 'consultation';
                html += '<div class="manage-upgrade-group border rounded bg-white p-2 mt-2" data-upgrade-group-id="' + manageItemsAttr(group.id) + '">' +
                    '<div class="row g-2 align-items-end">' +
                    '<div class="col-md-5"><label class="form-label" style="font-size:0.75em">Group Name</label><input type="text" class="form-control form-control-sm upgrade-group-name" value="' + manageItemsAttr(group.name) + '" placeholder="e.g., Drink Rail" oninput="markPricingDirty(this)"></div>' +
                    '<div class="col-md-4"><label class="form-label" style="font-size:0.75em">Selection Type</label><select class="form-select form-select-sm upgrade-group-type" onchange="handleManageUpgradeGroupTypeChange(this); markPricingDirty(this)"><option value="single_optional" ' + (group.type === 'single_optional' ? 'selected' : '') + '>Pick One Optional</option><option value="multiple" ' + (group.type === 'multiple' ? 'selected' : '') + '>Pick Multiple</option><option value="consultation" ' + (group.type === 'consultation' ? 'selected' : '') + '>Requires consultation</option></select></div>' +
                    '<div class="col-md-3 d-flex gap-1"><button type="button" class="btn btn-sm btn-outline-primary flex-fill" data-upgrade-group-action="add-option"><i class="fas fa-plus me-1"></i>Option</button><button type="button" class="btn btn-sm btn-outline-secondary" data-upgrade-group-action="toggle-note" title="Add note"><i class="fas fa-note-sticky"></i></button><button type="button" class="btn btn-sm btn-outline-secondary" data-upgrade-wizard-action="edit-existing" data-upgrade-group-id="' + manageItemsAttr(group.id) + '" title="Edit this group in the wizard"><i class="fas fa-magic"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-upgrade-group-action="remove-group" title="Remove group"><i class="fas fa-trash"></i></button></div>' +
                    '</div>';
                html += '<div class="upgrade-group-note-wrap mt-2 ' + (group.note ? '' : 'd-none') + '">' +
                    '<label class="form-label mb-1" style="font-size:0.75em">Upgrade group note</label>' +
                    '<textarea class="form-control form-control-sm upgrade-group-note" rows="2" placeholder="Explain this upgrade set for the client..." oninput="markPricingDirty(this)">' + manageItemsEscape(group.note || '') + '</textarea>' +
                    '<div class="small text-muted mt-1">Shown behind <strong>See Upgrade Notes</strong> in the quote.</div>' +
                    '</div>';

                if (!group.options.length) {
                    html += '<div class="small text-muted mt-2">No options in this group yet.</div>';
                }

                group.options.forEach(function(option, optionIndex) {
                    const optionRequiresConsultation = isConsultationGroup || option.upgradeType === 'consultation' || option.requiresConsultation === true;
                    html += '<div class="manage-upgrade-option border rounded p-2 mt-2" data-upgrade-option-id="' + manageItemsAttr(option.id) + '">' +
                        '<input type="hidden" class="upgrade-photo-value" value="' + manageItemsAttr(option.photo || '') + '">' +
                        '<input type="hidden" class="upgrade-photo-full-value" value="' + manageItemsAttr(JSON.stringify(normalizeManageFullResPhotoMeta(option.photoFull) || null)) + '">' +
                        '<div class="row g-2 align-items-end">' +
                        '<div class="col-md-4"><label class="form-label" style="font-size:0.75em">Copy From Saved Item</label>' + renderManageUpgradeSourceSelect(option.sourceItemName, option.category) + '</div>' +
                        '<div class="col-md-4"><label class="form-label" style="font-size:0.75em">Upgrade Name</label><input type="text" class="form-control form-control-sm upgrade-name" value="' + manageItemsAttr(option.name) + '" placeholder="e.g., Post-to-post drink rail" oninput="markPricingDirty(this)"></div>' +
                        '<div class="col-md-2"><label class="form-label" style="font-size:0.75em">Unit</label>' + renderManageUnitSelect(option.unitType || baseUnitType || '', 'upgrade-unit-type') + '</div>' +
                        '<div class="col-md-2"><label class="form-label" style="font-size:0.75em">Type</label><select class="form-select form-select-sm upgrade-type" onchange="markPricingDirty(this)" ' + (isConsultationGroup ? 'disabled' : '') + '><option value="replacement" ' + (option.upgradeType === 'replacement' ? 'selected' : '') + '>Replacement</option><option value="add_on" ' + (option.upgradeType === 'add_on' ? 'selected' : '') + '>Add-on</option><option value="consultation" ' + (optionRequiresConsultation ? 'selected' : '') + '>Requires consultation</option></select></div>' +
                        '<div class="col-md-2"><label class="form-label" style="font-size:0.75em">Rate</label><input type="number" class="form-control form-control-sm upgrade-rate" value="' + manageItemsAttr(optionRequiresConsultation ? '0.00' : option.rate.toFixed(2)) + '" step="0.01" min="0" placeholder="' + (optionRequiresConsultation ? 'Not priced' : '0.00') + '" ' + (optionRequiresConsultation ? 'disabled' : '') + ' oninput="markPricingDirty(this)"></div>' +
                        '<div class="col-md-2"><label class="form-label" style="font-size:0.75em">Cost</label><input type="number" class="form-control form-control-sm upgrade-material-cost" value="' + manageItemsAttr(optionRequiresConsultation ? '0.00' : option.materialCost.toFixed(2)) + '" step="0.01" min="0" placeholder="' + (optionRequiresConsultation ? 'Not priced' : '0.00') + '" ' + (optionRequiresConsultation ? 'disabled' : '') + ' oninput="markPricingDirty(this)"></div>' +
                        '<div class="col-md-8"><label class="form-label" style="font-size:0.75em">Supplier URL</label><input type="url" class="form-control form-control-sm upgrade-supplier-url" value="' + manageItemsAttr(option.supplierUrl) + '" placeholder="https://..." oninput="markPricingDirty(this)"></div>' +
                        '<div class="col-12 description-refine-scope"><div class="d-flex justify-content-between align-items-center gap-2"><label class="form-label mb-0" style="font-size:0.75em">Upgrade Description</label><button type="button" class="btn btn-sm btn-outline-primary refine-desc-btn" style="font-size:0.75rem;padding:2px 8px;">AI Refine</button></div><input type="text" class="form-control form-control-sm upgrade-desc item-description-textarea mt-1" value="' + manageItemsAttr(option.description || '') + '" placeholder="e.g., Premium finishing upgrade" oninput="markPricingDirty(this)"></div>' +
                        '<div class="col-md-6">' + renderManageUpgradePathSelect(flatOptions, option.availableAfterOptionIds, option.id, 'upgrade-available-after', 'Available after') + '</div>' +
                        '<div class="col-md-5">' + renderManageUpgradePathSelect(flatOptions, option.blockedByOptionIds, option.id, 'upgrade-blocked-by', 'Blocked by') + '</div>' +
                        '<div class="col-md-1 d-flex align-items-end"><button type="button" class="btn btn-sm btn-outline-danger w-100" data-upgrade-group-action="remove-option" title="Remove option"><i class="fas fa-trash"></i></button></div>' +
                        renderManageUpgradeQuantityControls(option, baseUnitType) +
                        '</div><div class="mt-2">' + renderManageMarginPill(option.rate, option.materialCost) + '</div>' +
                        '</div>';
                });
                html += '</div>';
            });
            html += '</div>';
            return html;
        }

        function collectManageItemUpgradeGroups(detailsRow, includeEmpty) {
            if (!detailsRow) return [];
            return Array.from(detailsRow.querySelectorAll('.manage-upgrade-group')).map(function(groupEl, groupIndex) {
                const groupType = normalizeManageUpgradeGroupType(groupEl.querySelector('.upgrade-group-type')?.value);
                const options = Array.from(groupEl.querySelectorAll('.manage-upgrade-option')).map(function(optionEl, optionIndex) {
                    const sourceSelect = optionEl.querySelector('.upgrade-source-item');
                    const selectedSource = sourceSelect ? sourceSelect.options[sourceSelect.selectedIndex] : null;
                    const name = optionEl.querySelector('.upgrade-name')?.value.trim() || '';
                    if (!name) return null;
                    const requiresConsultation = groupType === 'consultation' || normalizeManageUpgradeType(optionEl.querySelector('.upgrade-type')?.value) === 'consultation';
                    return {
                        id: optionEl.dataset.upgradeOptionId || manageUpgradeGroupId('upo'),
                        name: name,
                        unitType: optionEl.querySelector('.upgrade-unit-type')?.value.trim() || '',
                        rate: requiresConsultation ? 0 : (parseFloat(optionEl.querySelector('.upgrade-rate')?.value || 0) || 0),
                        materialCost: requiresConsultation ? 0 : (parseFloat(optionEl.querySelector('.upgrade-material-cost')?.value || 0) || 0),
                        supplierUrl: optionEl.querySelector('.upgrade-supplier-url')?.value.trim() || '',
                        photo: optionEl.querySelector('.upgrade-photo-value')?.value || '',
                        photoFull: normalizeManageFullResPhotoMeta((function() {
                            try { return JSON.parse(optionEl.querySelector('.upgrade-photo-full-value')?.value || 'null'); } catch(e) { return null; }
                        })()),
                        description: optionEl.querySelector('.upgrade-desc')?.value.trim() || '',
                        upgradeType: groupType === 'consultation' ? 'consultation' : normalizeManageUpgradeType(optionEl.querySelector('.upgrade-type')?.value),
                        requiresConsultation: requiresConsultation,
                        sourceItemName: selectedSource?.dataset.name || '',
                        category: selectedSource?.dataset.category || '',
                        availableAfterOptionIds: collectManageUpgradeRuleCheckboxIds(optionEl, 'upgrade-available-after'),
                        blockedByOptionIds: collectManageUpgradeRuleCheckboxIds(optionEl, 'upgrade-blocked-by'),
                        ...readManageUpgradeOptionQuantityState(optionEl)
                    };
                }).filter(Boolean);
                if (!options.length && !includeEmpty) return null;
                return {
                    id: groupEl.dataset.upgradeGroupId || manageUpgradeGroupId('upg'),
                    name: groupEl.querySelector('.upgrade-group-name')?.value.trim() || ('Upgrade Group ' + (groupIndex + 1)),
                    note: groupEl.querySelector('.upgrade-group-note')?.value.trim() || '',
                    type: groupType,
                    options: options
                };
            }).filter(Boolean);
        }

        function handleManageUpgradeGroupTypeChange(selectEl) {
            const detailsRow = selectEl ? selectEl.closest('.item-details-row') : null;
            if (!detailsRow) return;
            const groups = collectManageItemUpgradeGroups(detailsRow, true);
            refreshManageUpgradeGroupsEditor(detailsRow, groups);
        }

        function refreshManageUpgradeGroupsEditor(detailsRow, groups) {
            if (!detailsRow) return;
            const editor = detailsRow.querySelector('.manage-upgrade-groups-editor');
            if (!editor) return;
            const rowKey = detailsRow.getAttribute('data-row-key') || '';
            const row = rowKey ? getManageRowByKey(rowKey) : null;
            const unitType = row?.querySelector('.item-unit-type-input')?.value || '';
            editor.outerHTML = renderManageItemUpgradeGroupsEditor({ upgradeGroups: groups }, unitType);
        }

        function handleManageUpgradeGroupAction(button) {
            if (!button) return;
            const detailsRow = button.closest('.item-details-row');
            if (!detailsRow) return;
            const action = button.getAttribute('data-upgrade-group-action');
            const groups = collectManageItemUpgradeGroups(detailsRow, true);
            const groupEl = button.closest('.manage-upgrade-group');
            const optionEl = button.closest('.manage-upgrade-option');
            const groupId = groupEl?.dataset.upgradeGroupId || '';
            const optionId = optionEl?.dataset.upgradeOptionId || '';

            if (action === 'add-group') {
                groups.push({ id: manageUpgradeGroupId('upg'), name: 'Upgrade Group', note: '', type: 'single_optional', options: [] });
            } else if (action === 'add-single-upgrade') {
                groups.push({
                    id: manageUpgradeGroupId('upg'),
                    name: 'Upgrade Options',
                    note: '',
                    type: 'single_optional',
                    options: [{
                        id: manageUpgradeGroupId('upo'),
                        name: 'New Upgrade',
                        unitType: rowUnitTypeForDetails(detailsRow),
                        rate: 0,
                        materialCost: 0,
                        supplierUrl: '',
                        description: '',
                        upgradeType: 'add_on',
                        requiresConsultation: false,
                        availableAfterOptionIds: [],
                        blockedByOptionIds: [],
                        quantityMode: 'parent',
                        quantityMultiplier: 1,
                        quantityOverride: 0
                    }]
                });
            } else if (action === 'toggle-note') {
                const noteWrap = groupEl?.querySelector('.upgrade-group-note-wrap');
                if (noteWrap) {
                    noteWrap.classList.remove('d-none');
                    const textarea = noteWrap.querySelector('.upgrade-group-note');
                    if (textarea) textarea.focus();
                    markPricingDirty(detailsRow);
                }
                return;
            } else if (action === 'remove-group') {
                const index = groups.findIndex(function(group) { return group.id === groupId; });
                if (index !== -1) groups.splice(index, 1);
            } else if (action === 'add-option') {
                const group = groups.find(function(group) { return group.id === groupId; });
                if (group) {
                    group.options = group.options || [];
                    group.options.push({
                        id: manageUpgradeGroupId('upo'),
                        name: 'New Upgrade',
                        unitType: rowUnitTypeForDetails(detailsRow),
                        rate: 0,
                        materialCost: 0,
                        supplierUrl: '',
                        description: '',
                        upgradeType: 'add_on',
                        requiresConsultation: group.type === 'consultation',
                        availableAfterOptionIds: [],
                        blockedByOptionIds: [],
                        quantityMode: 'parent',
                        quantityMultiplier: 1,
                        quantityOverride: 0
                    });
                }
            } else if (action === 'remove-option') {
                groups.forEach(function(group) {
                    group.options = (group.options || []).filter(function(option) {
                        return option.id !== optionId;
                    }).map(function(option) {
                        option.availableAfterOptionIds = (option.availableAfterOptionIds || []).filter(function(id) { return id !== optionId; });
                        option.blockedByOptionIds = (option.blockedByOptionIds || []).filter(function(id) { return id !== optionId; });
                        return option;
                    });
                });
            }

            refreshManageUpgradeGroupsEditor(detailsRow, groups);
            markPricingDirty(detailsRow);
        }

        function getManageDetailsRowByKey(rowKey) {
            const row = getManageRowByKey(rowKey);
            return row ? document.getElementById(row.dataset.detailsId || '') : null;
        }

        function manageUpgradeWizardAlert(message) {
            if (typeof qdAlert === 'function') {
                qdAlert(message);
            } else {
                alert(message);
            }
        }

        function getManageUpgradeWizardOptionTemplate(baseUnitType, index) {
            return {
                id: manageUpgradeGroupId('upo'),
                name: '',
                unitType: baseUnitType || '',
                rate: 0,
                materialCost: 0,
                supplierUrl: '',
                description: '',
                upgradeType: index === 0 ? 'replacement' : 'add_on',
                requiresConsultation: false,
                sourceItemName: '',
                category: '',
                availableAfterOptionIds: [],
                blockedByOptionIds: [],
                quantityMode: 'parent',
                quantityMultiplier: 1,
                quantityOverride: 0
            };
        }

        function buildManageUpgradeWizardGroup(setupType, baseUnitType) {
            const group = {
                id: manageUpgradeGroupId('upg'),
                name: setupType === 'consultation' ? 'Consultation Options' : (setupType === 'path' ? 'Upgrade Path' : (setupType === 'multiple' ? 'Add-on Options' : 'Upgrade Options')),
                note: '',
                type: setupType === 'consultation' ? 'consultation' : (setupType === 'multiple' ? 'multiple' : 'single_optional'),
                options: []
            };
            const optionCount = setupType === 'simple' || setupType === 'multiple' ? 1 : 2;
            for (let i = 0; i < optionCount; i++) {
                group.options.push(getManageUpgradeWizardOptionTemplate(baseUnitType, i));
            }
            return group;
        }

        function hydrateManageUpgradeWizardFromGroup(group) {
            return cloneManageUpgradeGroup(group);
        }

        function getManageUpgradeWizardContextFromButton(button) {
            const detailsRow = button ? button.closest('.item-details-row') : null;
            if (detailsRow) {
                return {
                    context: 'row',
                    rowKey: detailsRow.getAttribute('data-row-key') || '',
                    baseUnitType: rowUnitTypeForDetails(detailsRow),
                    groups: collectManageItemUpgradeGroups(detailsRow, true)
                };
            }
            return {
                context: 'newItem',
                rowKey: '',
                baseUnitType: document.getElementById('newItemUnit')?.value.trim() || '',
                groups: cloneManageUpgradeGroups(manageNewItemWizardUpgradeGroups)
            };
        }

        function ensureManageUpgradeWizardModal() {
            let modalEl = document.getElementById('manageUpgradeWizardModal');
            if (modalEl) return modalEl;
            modalEl = document.createElement('div');
            modalEl.className = 'modal fade';
            modalEl.id = 'manageUpgradeWizardModal';
            modalEl.tabIndex = -1;
            modalEl.setAttribute('aria-hidden', 'true');
            document.body.appendChild(modalEl);
            return modalEl;
        }

        function renderManageUpgradeWizardTypeCards() {
            const cards = [
                { id: 'simple', title: 'Simple Upgrade', icon: 'fa-arrow-up', text: 'One optional upgrade, like standard trim to premium trim.' },
                { id: 'pick_one', title: 'Pick One Upgrade Set', icon: 'fa-list-check', text: 'Client can choose one upgrade or leave the base item as-is.' },
                { id: 'multiple', title: 'Stackable Add-ons', icon: 'fa-layer-group', text: 'Client can select more than one add-on at the same time.' },
                { id: 'consultation', title: 'Requires Consultation', icon: 'fa-comments-dollar', text: 'Client can request this upgrade, then the quote returns to you for pricing.' },
                { id: 'path', title: 'Upgrade Path', icon: 'fa-code-branch', text: 'Use Available after and Blocked by rules for dependent upgrades.' }
            ];
            return '<div class="row g-2">' + cards.map(function(card) {
                return '<div class="col-md-6"><button type="button" class="btn btn-outline-primary text-start w-100 h-100 p-3" data-upgrade-wizard-action="choose-type" data-setup-type="' + manageItemsAttr(card.id) + '">' +
                    '<div class="fw-bold"><i class="fas ' + card.icon + ' me-2"></i>' + manageItemsEscape(card.title) + '</div>' +
                    '<div class="small text-muted mt-1">' + manageItemsEscape(card.text) + '</div>' +
                    '</button></div>';
            }).join('') + '</div>';
        }

        function renderManageUpgradeWizardExistingGroups() {
            const groups = manageUpgradeWizardState ? normalizeManageItemUpgradeGroups({ upgradeGroups: manageUpgradeWizardState.groups }) : [];
            if (!groups.length) return '<div class="alert alert-light border small mb-3">No upgrade groups yet. Start with a setup type below.</div>';
            return '<div class="mb-3">' +
                '<div class="small fw-bold text-muted mb-2">Existing upgrade groups</div>' +
                groups.map(function(group) {
                    return '<div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center gap-2 flex-wrap">' +
                        '<div><div class="fw-bold">' + manageItemsEscape(group.name || 'Upgrade Options') + '</div>' +
                        '<div class="small text-muted">' + (group.type === 'consultation' ? 'Requires Consultation' : (group.type === 'multiple' ? 'Pick Multiple' : 'Pick One Optional')) + ' - ' + (group.options || []).length + ' option' + ((group.options || []).length === 1 ? '' : 's') + '</div></div>' +
                        '<button type="button" class="btn btn-sm btn-outline-primary" data-upgrade-wizard-action="edit-existing" data-upgrade-group-id="' + manageItemsAttr(group.id) + '"><i class="fas fa-magic me-1"></i>Edit in Wizard</button>' +
                        '</div>';
                }).join('') +
                '</div>';
        }

        function renderManageUpgradeWizardStepNav(activeStep) {
            const steps = [
                ['setup', 'Setup'],
                ['options', 'Options'],
                ['rules', 'Rules'],
                ['review', 'Review']
            ];
            return '<div class="d-flex flex-wrap gap-1 mb-3">' + steps.map(function(step) {
                const active = step[0] === activeStep;
                return '<span class="badge ' + (active ? 'bg-primary' : 'bg-light text-dark border') + '">' + manageItemsEscape(step[1]) + '</span>';
            }).join('') + '</div>';
        }

        function renderManageUpgradeWizardOptionsStep() {
            const state = manageUpgradeWizardState || {};
            const group = state.group || buildManageUpgradeWizardGroup(state.setupType || 'simple', state.baseUnitType);
            const options = Array.isArray(group.options) ? group.options : [];
            const isConsultationGroup = group.type === 'consultation';
            return '<div data-upgrade-wizard-step="options">' +
                renderManageUpgradeWizardStepNav('options') +
                '<div class="row g-2 mb-3">' +
                '<div class="col-md-7"><label class="form-label small fw-bold">Upgrade group name</label><input type="text" class="form-control form-control-sm upgrade-group-name" value="' + manageItemsAttr(group.name || '') + '" placeholder="e.g., Drink Rail"></div>' +
                '<div class="col-md-5"><label class="form-label small fw-bold">Client selection</label><select class="form-select form-select-sm upgrade-group-type"><option value="single_optional" ' + (group.type === 'single_optional' ? 'selected' : '') + '>Pick One Optional</option><option value="multiple" ' + (group.type === 'multiple' ? 'selected' : '') + '>Pick Multiple</option><option value="consultation" ' + (group.type === 'consultation' ? 'selected' : '') + '>Requires consultation</option></select></div>' +
                '</div>' +
                '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><div class="small text-muted">Copy from saved items or type a custom upgrade.</div><div class="d-flex gap-1 flex-wrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-upgrade-wizard-action="toggle-note"><i class="fas fa-note-sticky me-1"></i>Add Note</button><button type="button" class="btn btn-sm btn-outline-primary" data-upgrade-wizard-action="add-option"><i class="fas fa-plus me-1"></i>Add Option</button></div></div>' +
                '<div class="upgrade-wizard-note-wrap upgrade-group-note-wrap mb-3 ' + (group.note ? '' : 'd-none') + '">' +
                '<label class="form-label small fw-bold">Upgrade note shown to client</label>' +
                '<textarea class="form-control form-control-sm upgrade-group-note" rows="3" placeholder="Explain this upgrade set, material choices, or what the client should know...">' + manageItemsEscape(group.note || '') + '</textarea>' +
                '<div class="small text-muted mt-1">This starts collapsed behind <strong>See Upgrade Notes</strong> on the quote.</div>' +
                '</div>' +
                options.map(function(option, optionIndex) {
                    option = normalizeManageUpgradeOption(option, 'wizard_' + optionIndex);
                    const optionRequiresConsultation = isConsultationGroup || option.requiresConsultation === true || option.upgradeType === 'consultation';
                    return '<div class="manage-upgrade-wizard-option manage-upgrade-wizard-option-card" data-upgrade-option-id="' + manageItemsAttr(option.id) + '">' +
                        '<div class="row g-2 align-items-end">' +
                        '<div class="col-md-4"><label class="form-label small mb-1">Copy From Saved Item</label>' + renderManageUpgradeSourceSelect(option.sourceItemName, option.category) + '</div>' +
                        '<div class="col-md-4"><label class="form-label small mb-1">Upgrade Name</label><input type="text" class="form-control form-control-sm upgrade-name" value="' + manageItemsAttr(option.name) + '" placeholder="e.g., Post-to-post drink rail"></div>' +
                        '<div class="col-md-2"><label class="form-label small mb-1">Unit</label>' + renderManageUnitSelect(option.unitType || state.baseUnitType || '', 'upgrade-unit-type') + '</div>' +
                        '<div class="col-md-2"><label class="form-label small mb-1">Type</label><select class="form-select form-select-sm upgrade-type" ' + (isConsultationGroup ? 'disabled' : '') + '><option value="replacement" ' + (option.upgradeType === 'replacement' ? 'selected' : '') + '>Replacement</option><option value="add_on" ' + (option.upgradeType === 'add_on' ? 'selected' : '') + '>Add-on</option><option value="consultation" ' + (optionRequiresConsultation ? 'selected' : '') + '>Requires consultation</option></select></div>' +
                        '<div class="col-md-2"><label class="form-label small mb-1">Rate</label><input type="number" class="form-control form-control-sm upgrade-rate" value="' + manageItemsAttr(optionRequiresConsultation ? '0.00' : option.rate.toFixed(2)) + '" step="0.01" min="0" ' + (optionRequiresConsultation ? 'disabled' : '') + '></div>' +
                        '<div class="col-md-2"><label class="form-label small mb-1">Cost</label><input type="number" class="form-control form-control-sm upgrade-material-cost" value="' + manageItemsAttr(optionRequiresConsultation ? '0.00' : option.materialCost.toFixed(2)) + '" step="0.01" min="0" ' + (optionRequiresConsultation ? 'disabled' : '') + '></div>' +
                        '<div class="col-md-7"><label class="form-label small mb-1">Supplier URL</label><input type="url" class="form-control form-control-sm upgrade-supplier-url" value="' + manageItemsAttr(option.supplierUrl || '') + '" placeholder="https://..."></div>' +
                        '<div class="col-md-1 d-flex align-items-end"><button type="button" class="btn btn-sm btn-outline-danger w-100" data-upgrade-wizard-action="remove-option" title="Remove option"><i class="fas fa-trash"></i></button></div>' +
                        '<div class="col-12"><label class="form-label small mb-1">Upgrade Description</label><input type="text" class="form-control form-control-sm upgrade-desc" value="' + manageItemsAttr(option.description || '') + '" placeholder="Optional client-facing description"></div>' +
                        renderManageUpgradeQuantityControls(option, state.baseUnitType) +
                        '</div>' +
                        '</div>';
                }).join('') +
                '</div>';
        }

        function renderManageUpgradeWizardRulesStep() {
            const group = manageUpgradeWizardState?.group || { options: [] };
            const options = Array.isArray(group.options) ? group.options : [];
            return '<div data-upgrade-wizard-step="rules">' +
                renderManageUpgradeWizardStepNav('rules') +
                '<div class="alert alert-light border small">Use rules only when an upgrade depends on another upgrade. Example: <strong>Lighted post caps</strong> can be Available after <strong>Post-to-post drink rail</strong> and Blocked by <strong>Continuous drink rail</strong>.</div>' +
                options.map(function(option, optionIndex) {
                    option = normalizeManageUpgradeOption(option, 'wizard_rule_' + optionIndex);
                    return '<div class="manage-upgrade-wizard-option manage-upgrade-wizard-option-card" data-upgrade-option-id="' + manageItemsAttr(option.id) + '">' +
                        '<div class="fw-bold">' + manageItemsEscape(option.name || 'Unnamed upgrade') + '</div>' +
                        '<div class="small text-muted mb-2">' + manageItemsEscape(option.upgradeType === 'consultation' || option.requiresConsultation ? 'Requires consultation' : (option.upgradeType === 'replacement' ? 'Replacement' : 'Add-on')) + (option.requiresConsultation || option.upgradeType === 'consultation' ? '' : ' - ' + manageItemsEscape(option.unitType || 'unit not set') + ' @ $' + (parseFloat(option.rate) || 0).toFixed(2)) + '</div>' +
                        '<div class="row g-2">' +
                        '<div class="col-md-6">' + renderManageUpgradePathSelect(options, option.availableAfterOptionIds, option.id, 'upgrade-available-after', 'Available after') + '</div>' +
                        '<div class="col-md-6">' + renderManageUpgradePathSelect(options, option.blockedByOptionIds, option.id, 'upgrade-blocked-by', 'Blocked by') + '</div>' +
                        '</div>' +
                        '</div>';
                }).join('') +
                '</div>';
        }

        function renderManageUpgradeWizardReviewStep() {
            const group = manageUpgradeWizardState?.group || { options: [] };
            const options = Array.isArray(group.options) ? group.options : [];
            return '<div data-upgrade-wizard-step="review">' +
                renderManageUpgradeWizardStepNav('review') +
                '<div class="manage-upgrade-wizard-preview border rounded bg-light p-3">' +
                '<div class="fw-bold mb-1">' + manageItemsEscape(group.name || 'Upgrade Options') + '</div>' +
                '<div class="small text-muted mb-3">' + (group.type === 'consultation' ? 'Client can request this option and send the quote back for pricing.' : (group.type === 'multiple' ? 'Client can pick multiple upgrades.' : 'Client can pick one upgrade, or leave the base item unchanged.')) + '</div>' +
                (group.note ? '<div class="alert alert-light border small"><strong>Client note:</strong> ' + manageItemsEscape(group.note) + '</div>' : '') +
                (options.length ? options.map(function(option) {
                    const rules = [];
                    if ((option.availableAfterOptionIds || []).length) rules.push('Available after ' + option.availableAfterOptionIds.length + ' option(s)');
                    if ((option.blockedByOptionIds || []).length) rules.push('Blocked by ' + option.blockedByOptionIds.length + ' option(s)');
                    const quantityMode = normalizeManageUpgradeQuantityMode(option.quantityMode);
                    if (quantityMode === 'manual') rules.push('Quantity entered on quote');
                    if (quantityMode === 'multiplier') rules.push('Quantity multiplier x ' + (parseFloat(option.quantityMultiplier || 1) || 1));
                    if (quantityMode === 'override') rules.push('Fixed quantity ' + (parseFloat(option.quantityOverride || 0) || 0));
                    return '<div class="border rounded bg-white p-2 mb-2">' +
                        '<div class="d-flex justify-content-between gap-2 flex-wrap"><strong>' + manageItemsEscape(option.name || 'Unnamed upgrade') + '</strong><span>' + (option.requiresConsultation || option.upgradeType === 'consultation' ? 'Requires consultation' : (manageItemsEscape(option.upgradeType === 'replacement' ? 'Replacement' : 'Add-on') + ' - $' + (parseFloat(option.rate) || 0).toFixed(2) + '/' + manageItemsEscape(option.unitType || 'unit'))) + '</span></div>' +
                        (option.description ? '<div class="small text-muted mt-1">' + manageItemsEscape(option.description) + '</div>' : '') +
                        (rules.length ? '<div class="small text-primary mt-1">' + manageItemsEscape(rules.join(' | ')) + '</div>' : '') +
                        '</div>';
                }).join('') : '<div class="text-muted">No named upgrade options yet.</div>') +
                '</div>' +
                '</div>';
        }

        function renderManageUpgradeWizardModal() {
            const state = manageUpgradeWizardState || {};
            const modalEl = ensureManageUpgradeWizardModal();
            const step = state.step || 'setup';
            let body = '';
            let footer = '';
            if (step === 'setup') {
                body = '<div data-upgrade-wizard-step="setup">' +
                    renderManageUpgradeWizardStepNav('setup') +
                    renderManageUpgradeWizardExistingGroups() +
                    '<div class="small fw-bold text-muted mb-2">Create a new guided setup</div>' +
                    renderManageUpgradeWizardTypeCards() +
                    '</div>';
                footer = '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>';
            } else if (step === 'options') {
                body = renderManageUpgradeWizardOptionsStep();
                footer = '<button type="button" class="btn btn-outline-secondary" data-upgrade-wizard-action="back">Back</button>' +
                    '<button type="button" class="btn btn-primary" data-upgrade-wizard-action="' + (state.setupType === 'path' ? 'next-rules' : 'next-review') + '">Continue</button>';
            } else if (step === 'rules') {
                body = renderManageUpgradeWizardRulesStep();
                footer = '<button type="button" class="btn btn-outline-secondary" data-upgrade-wizard-action="back">Back</button>' +
                    '<button type="button" class="btn btn-primary" data-upgrade-wizard-action="next-review">Review</button>';
            } else {
                body = renderManageUpgradeWizardReviewStep();
                footer = '<button type="button" class="btn btn-outline-secondary" data-upgrade-wizard-action="back">Back</button>' +
                    '<button type="button" class="btn btn-primary" data-upgrade-wizard-action="save"><i class="fas fa-save me-1"></i>Save Upgrade Group</button>';
            }
            modalEl.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                '<div class="modal-header bg-primary text-white">' +
                '<h5 class="modal-title"><i class="fas fa-magic me-2"></i>Upgrade Wizard</h5>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' + body + '</div>' +
                '<div class="modal-footer">' + footer + '</div>' +
                '</div>' +
                '</div>';
        }

        function collectManageUpgradeWizardForm() {
            if (!manageUpgradeWizardState || !manageUpgradeWizardState.group) return;
            const modalEl = document.getElementById('manageUpgradeWizardModal');
            if (!modalEl) return;
            const group = manageUpgradeWizardState.group;
            const groupName = modalEl.querySelector('.upgrade-group-name');
            const groupType = modalEl.querySelector('.upgrade-group-type');
            const groupNote = modalEl.querySelector('.upgrade-group-note');
            if (groupName) group.name = groupName.value.trim();
            if (groupType) group.type = normalizeManageUpgradeGroupType(groupType.value);
            if (groupNote) group.note = groupNote.value.trim();
            const optionEls = Array.from(modalEl.querySelectorAll('.manage-upgrade-wizard-option'));
            if (!optionEls.length) return;
            group.options = optionEls.map(function(optionEl, optionIndex) {
                const optionId = optionEl.dataset.upgradeOptionId || manageUpgradeGroupId('upo');
                const previous = (group.options || []).find(function(option) { return option.id === optionId; }) || {};
                const sourceSelect = optionEl.querySelector('.upgrade-source-item');
                const selectedSource = sourceSelect ? sourceSelect.options[sourceSelect.selectedIndex] : null;
                const getValue = function(selector, fallback) {
                    const input = optionEl.querySelector(selector);
                    return input ? input.value.trim() : (fallback || '');
                };
                const getNumber = function(selector, fallback) {
                    const input = optionEl.querySelector(selector);
                    return input ? (parseFloat(input.value || 0) || 0) : (parseFloat(fallback || 0) || 0);
                };
                const selectedFrom = function(selector, fallback) {
                    return collectManageUpgradeRuleCheckboxIds(optionEl, selector.replace(/^\./, ''), fallback);
                };
                const optionType = normalizeManageUpgradeType(optionEl.querySelector('.upgrade-type')?.value || previous.upgradeType);
                const requiresConsultation = group.type === 'consultation' || optionType === 'consultation' || previous.requiresConsultation === true;
                return {
                    id: optionId,
                    name: getValue('.upgrade-name', previous.name),
                    unitType: getValue('.upgrade-unit-type', previous.unitType || manageUpgradeWizardState.baseUnitType),
                    rate: requiresConsultation ? 0 : getNumber('.upgrade-rate', previous.rate),
                    materialCost: requiresConsultation ? 0 : getNumber('.upgrade-material-cost', previous.materialCost),
                    supplierUrl: getValue('.upgrade-supplier-url', previous.supplierUrl),
                    description: getValue('.upgrade-desc', previous.description),
                    upgradeType: group.type === 'consultation' ? 'consultation' : optionType,
                    requiresConsultation: requiresConsultation,
                    sourceItemName: selectedSource?.dataset.name || previous.sourceItemName || '',
                    category: selectedSource?.dataset.category || previous.category || '',
                    availableAfterOptionIds: selectedFrom('.upgrade-available-after', previous.availableAfterOptionIds),
                    blockedByOptionIds: selectedFrom('.upgrade-blocked-by', previous.blockedByOptionIds),
                    ...readManageUpgradeOptionQuantityState(optionEl, previous)
                };
            });
        }

        function showManageUpgradeWizard() {
            renderManageUpgradeWizardModal();
            const modalEl = document.getElementById('manageUpgradeWizardModal');
            if (modalEl && window.bootstrap && bootstrap.Modal) {
                bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        }

        function openManageUpgradeWizard(button) {
            const context = getManageUpgradeWizardContextFromButton(button);
            manageUpgradeWizardState = {
                context: context.context,
                rowKey: context.rowKey,
                baseUnitType: context.baseUnitType,
                groups: cloneManageUpgradeGroups(context.groups),
                editingGroupId: '',
                setupType: '',
                step: 'setup',
                group: null
            };
            const action = button?.getAttribute('data-upgrade-wizard-action') || '';
            const groupId = button?.getAttribute('data-upgrade-group-id') || '';
            if (action === 'edit-existing' && groupId) {
                startManageUpgradeWizardExistingGroup(groupId);
                return;
            }
            showManageUpgradeWizard();
        }

        function openManageNewItemUpgradeWizard() {
            manageUpgradeWizardState = {
                context: 'newItem',
                rowKey: '',
                baseUnitType: document.getElementById('newItemUnit')?.value.trim() || '',
                groups: cloneManageUpgradeGroups(manageNewItemWizardUpgradeGroups),
                editingGroupId: '',
                setupType: '',
                step: 'setup',
                group: null
            };
            showManageUpgradeWizard();
        }

        function startManageUpgradeWizardExistingGroup(groupId) {
            if (!manageUpgradeWizardState) return;
            const group = (manageUpgradeWizardState.groups || []).find(function(candidate) { return candidate.id === groupId; });
            manageUpgradeWizardState.group = hydrateManageUpgradeWizardFromGroup(group);
            manageUpgradeWizardState.editingGroupId = groupId;
            manageUpgradeWizardState.setupType = inferManageUpgradeWizardSetupType(manageUpgradeWizardState.group);
            manageUpgradeWizardState.step = 'options';
            showManageUpgradeWizard();
        }

        function startManageUpgradeWizardNewGroup(setupType) {
            if (!manageUpgradeWizardState) return;
            manageUpgradeWizardState.setupType = setupType || 'simple';
            manageUpgradeWizardState.group = buildManageUpgradeWizardGroup(manageUpgradeWizardState.setupType, manageUpgradeWizardState.baseUnitType);
            manageUpgradeWizardState.editingGroupId = '';
            manageUpgradeWizardState.step = 'options';
            showManageUpgradeWizard();
        }

        function saveManageUpgradeWizard() {
            collectManageUpgradeWizardForm();
            if (!manageUpgradeWizardState || !manageUpgradeWizardState.group) return;
            const group = cloneManageUpgradeGroup(manageUpgradeWizardState.group);
            group.options = (group.options || []).filter(function(option) { return String(option.name || '').trim(); });
            if (!group.name) {
                manageUpgradeWizardAlert('Please name this upgrade group.');
                return;
            }
            if (!group.options.length) {
                manageUpgradeWizardAlert('Please add at least one named upgrade option.');
                return;
            }
            let groups = cloneManageUpgradeGroups(manageUpgradeWizardState.groups);
            const existingIndex = groups.findIndex(function(candidate) { return candidate.id === manageUpgradeWizardState.editingGroupId; });
            if (existingIndex !== -1) {
                groups[existingIndex] = group;
            } else {
                groups.push(group);
            }
            if (manageUpgradeWizardState.context === 'row') {
                const detailsRow = getManageDetailsRowByKey(manageUpgradeWizardState.rowKey);
                if (detailsRow) {
                    refreshManageUpgradeGroupsEditor(detailsRow, groups);
                    if (!saveManageUpgradeWizardRow(detailsRow)) {
                        markPricingDirty(detailsRow);
                    }
                }
            } else {
                manageNewItemWizardUpgradeGroups = normalizeManageItemUpgradeGroups({ upgradeGroups: groups });
                syncNewItemUpgradeWizardSummary();
            }
            const modalEl = document.getElementById('manageUpgradeWizardModal');
            if (modalEl && window.bootstrap && bootstrap.Modal) {
                bootstrap.Modal.getInstance(modalEl)?.hide();
            }
            manageUpgradeWizardState = null;
        }

        function syncNewItemUpgradeWizardSummary() {
            const target = document.getElementById('newItemUpgradeWizardSummary');
            if (!target) return;
            const groups = normalizeManageItemUpgradeGroups({ upgradeGroups: manageNewItemWizardUpgradeGroups });
            target.style.display = groups.length ? 'block' : 'none';
            target.innerHTML = groups.length ? '<div class="small fw-bold text-primary mb-1"><i class="fas fa-magic me-1"></i>Wizard Upgrade Groups</div>' +
                groups.map(function(group) {
                    return '<div class="small border rounded bg-light p-2 mb-1"><strong>' + manageItemsEscape(group.name || 'Upgrade Options') + '</strong> - ' +
                        (group.type === 'multiple' ? 'Pick Multiple' : 'Pick One Optional') + ' - ' + (group.options || []).length + ' option' + ((group.options || []).length === 1 ? '' : 's') + '</div>';
                }).join('') : '';
        }

        function handleManageUpgradeWizardAction(button) {
            if (!button) return;
            const action = button.getAttribute('data-upgrade-wizard-action') || '';
            if (action === 'open-new') {
                openManageUpgradeWizard(button);
                return;
            }
            if (action === 'edit-existing') {
                if (!manageUpgradeWizardState || !button.closest('#manageUpgradeWizardModal')) {
                    openManageUpgradeWizard(button);
                } else {
                    startManageUpgradeWizardExistingGroup(button.getAttribute('data-upgrade-group-id') || '');
                }
                return;
            }
            if (!manageUpgradeWizardState) return;
            if (action === 'choose-type') {
                startManageUpgradeWizardNewGroup(button.getAttribute('data-setup-type') || 'simple');
                return;
            }
            if (action === 'add-option') {
                collectManageUpgradeWizardForm();
                manageUpgradeWizardState.group.options.push(getManageUpgradeWizardOptionTemplate(manageUpgradeWizardState.baseUnitType, manageUpgradeWizardState.group.options.length));
                showManageUpgradeWizard();
                return;
            }
            if (action === 'toggle-note') {
                const noteWrap = document.querySelector('#manageUpgradeWizardModal .upgrade-wizard-note-wrap');
                if (noteWrap) {
                    noteWrap.classList.remove('d-none');
                    const textarea = noteWrap.querySelector('.upgrade-group-note');
                    if (textarea) textarea.focus();
                }
                return;
            }
            if (action === 'remove-option') {
                collectManageUpgradeWizardForm();
                const optionId = button.closest('.manage-upgrade-wizard-option')?.dataset.upgradeOptionId || '';
                manageUpgradeWizardState.group.options = (manageUpgradeWizardState.group.options || []).filter(function(option) { return option.id !== optionId; }).map(function(option) {
                    option.availableAfterOptionIds = (option.availableAfterOptionIds || []).filter(function(id) { return id !== optionId; });
                    option.blockedByOptionIds = (option.blockedByOptionIds || []).filter(function(id) { return id !== optionId; });
                    return option;
                });
                showManageUpgradeWizard();
                return;
            }
            if (action === 'next-rules' || action === 'next-review') {
                collectManageUpgradeWizardForm();
                manageUpgradeWizardState.step = action === 'next-rules' ? 'rules' : 'review';
                showManageUpgradeWizard();
                return;
            }
            if (action === 'back') {
                collectManageUpgradeWizardForm();
                if (manageUpgradeWizardState.step === 'review') {
                    manageUpgradeWizardState.step = manageUpgradeWizardState.setupType === 'path' ? 'rules' : 'options';
                } else if (manageUpgradeWizardState.step === 'rules') {
                    manageUpgradeWizardState.step = 'options';
                } else {
                    manageUpgradeWizardState.step = 'setup';
                    manageUpgradeWizardState.group = null;
                }
                showManageUpgradeWizard();
                return;
            }
            if (action === 'save') {
                saveManageUpgradeWizard();
            }
        }

        function rowUnitTypeForDetails(detailsRow) {
            const rowKey = detailsRow ? detailsRow.getAttribute('data-row-key') : '';
            const row = rowKey ? getManageRowByKey(rowKey) : null;
            return row?.querySelector('.item-unit-type-input')?.value || '';
        }

        function fillManageUpgradeOptionFromSource(selectEl) {
            if (!selectEl) return;
            const optionEl = selectEl.closest('.manage-upgrade-option') || selectEl.closest('.manage-upgrade-wizard-option');
            const selected = selectEl.options[selectEl.selectedIndex];
            if (!optionEl || !selected || !selected.value) return;
            const setValue = function(selector, value) {
                const input = optionEl.querySelector(selector);
                if (!input) return;
                if (input.tagName === 'SELECT') {
                    ensureManageUnitOption(input, value || '');
                }
                input.value = value || '';
                if (input.classList?.contains('item-unit-type-input')) {
                    input.dataset.currentUnit = input.value || '';
                }
            };
            setValue('.upgrade-name', selected.dataset.name || '');
            setValue('.upgrade-unit-type', selected.dataset.unit || rowUnitTypeForDetails(selectEl.closest('.item-details-row')) || manageUpgradeWizardState?.baseUnitType || '');
            setValue('.upgrade-rate', selected.dataset.rate || '0');
            setValue('.upgrade-material-cost', selected.dataset.cost || '0');
            setValue('.upgrade-supplier-url', selected.dataset.supplier || '');
            setValue('.upgrade-desc', selected.dataset.description || '');
            refreshManageUpgradeQuantityControls(optionEl);
        }

        document.addEventListener('click', function(event) {
            const wizardButton = event.target.closest('[data-upgrade-wizard-action]');
            if (!wizardButton) return;
            handleManageUpgradeWizardAction(wizardButton);
        });

        function getManageBaseUnitTypes() {
            return ['sq ft', 'sqft', 'LF', 'linear foot', 'linear ft', 'm\u00b2', 'm', 'each', 'Flatrate', 'hourly', 'sheet', 'minimum'];
        }

        function addManageUniqueUnit(units, unit) {
            const clean = String(unit || '').trim();
            if (!clean || clean === MANAGE_CUSTOM_UNIT_VALUE) return;
            if (!units.some(function(existing) { return existing.toLowerCase() === clean.toLowerCase(); })) {
                units.push(clean);
            }
        }

        function getRememberedManageUnitTypes() {
            try {
                const stored = JSON.parse(localStorage.getItem(MANAGE_CUSTOM_UNITS_KEY) || '[]');
                return Array.isArray(stored) ? stored.filter(function(unit) { return String(unit || '').trim(); }) : [];
            } catch(e) {
                return [];
            }
        }

        function collectSavedManageUnitTypes() {
            const units = [];
            [pricingDatabase, customItems].forEach(function(source) {
                Object.keys(source || {}).forEach(function(category) {
                    const items = source[category];
                    if (category.indexOf('__') === 0 || !Array.isArray(items)) return;
                    items.forEach(function(item) {
                        addManageUniqueUnit(units, item && item.unitType);
                        addManageUniqueUnit(units, item && item.upgrade && item.upgrade.unitType);
                        normalizeManageItemUpgradeGroups(item).forEach(function(group) {
                            (group.options || []).forEach(function(option) {
                                addManageUniqueUnit(units, option && option.unitType);
                            });
                        });
                    });
                });
            });
            return units;
        }

        function getManageKnownUnitTypes(currentValue) {
            const units = [];
            getManageBaseUnitTypes().forEach(function(unit) { addManageUniqueUnit(units, unit); });
            getRememberedManageUnitTypes().forEach(function(unit) { addManageUniqueUnit(units, unit); });
            collectSavedManageUnitTypes().forEach(function(unit) { addManageUniqueUnit(units, unit); });
            addManageUniqueUnit(units, currentValue);
            return units;
        }

        function ensureManageUnitOption(selectEl, unit) {
            const clean = String(unit || '').trim();
            if (!selectEl || !clean) return;
            const exists = Array.from(selectEl.options).some(function(option) {
                return option.value.toLowerCase() === clean.toLowerCase();
            });
            if (exists) return;
            const option = new Option(clean, clean);
            const sentinelOption = Array.from(selectEl.options).find(function(opt) {
                return opt.value === MANAGE_CUSTOM_UNIT_VALUE;
            });
            selectEl.add(option, sentinelOption || null);
        }

        function syncManageUnitTypeOptions() {
            const units = getManageKnownUnitTypes();
            const datalist = document.getElementById('unitTypeOptions');
            if (datalist) {
                units.forEach(function(unit) {
                    if (![...datalist.children].some(function(opt) { return opt.value.toLowerCase() === unit.toLowerCase(); })) {
                        const opt = document.createElement('option');
                        opt.value = unit;
                        datalist.appendChild(opt);
                    }
                });
            }
            document.querySelectorAll('.item-unit-type-input').forEach(function(selectEl) {
                units.forEach(function(unit) { ensureManageUnitOption(selectEl, unit); });
            });
        }

        function rememberManageUnitType(unit) {
            const clean = String(unit || '').trim();
            if (!clean || clean === MANAGE_CUSTOM_UNIT_VALUE) return false;
            const remembered = getRememberedManageUnitTypes();
            const alreadyRemembered = remembered.some(function(existing) {
                return existing.toLowerCase() === clean.toLowerCase();
            });
            const isBaseUnit = getManageBaseUnitTypes().some(function(existing) {
                return existing.toLowerCase() === clean.toLowerCase();
            });
            if (!alreadyRemembered && !isBaseUnit) {
                remembered.push(clean);
                remembered.sort(function(a, b) { return a.localeCompare(b); });
                localStorage.setItem(MANAGE_CUSTOM_UNITS_KEY, JSON.stringify(remembered));
            }
            syncManageUnitTypeOptions();
            return true;
        }

        function renderManageUnitSelect(currentValue, extraClass) {
            const current = String(currentValue || '').trim();
            const units = getManageKnownUnitTypes(current);
            const options = ['<option value="" ' + (!current ? 'selected' : '') + '>Select unit...</option>'].concat(units.map(function(unit) {
                return '<option value="' + manageItemsAttr(unit) + '" ' + (unit === current ? 'selected' : '') + '>' + manageItemsEscape(unit) + '</option>';
            }));
            const extraClassName = String(extraClass || '').split(/\s+/).filter(Boolean).join(' ');
            options.push('<option value="' + MANAGE_CUSTOM_UNIT_VALUE + '">New...</option>');
            if (!extraClassName) {
                return '<select class="form-select form-select-sm item-unit-type-input" aria-label="Unit type" data-current-unit="' + manageItemsAttr(current) + '" onchange="handleManageUnitTypeChange(this)">' + options.join('') + '</select>';
            }
            return '<select class="form-select form-select-sm item-unit-type-input ' + manageItemsAttr(extraClassName) + '" aria-label="Unit type" data-current-unit="' + manageItemsAttr(current) + '" onchange="handleManageUnitTypeChange(this)">' + options.join('') + '</select>';
        }

        async function handleManageUnitTypeChange(selectEl) {
            if (!selectEl) return;

            if (selectEl.value !== MANAGE_CUSTOM_UNIT_VALUE) {
                selectEl.dataset.currentUnit = selectEl.value || '';
                markPricingDirty(selectEl);
                if (selectEl.classList.contains('upgrade-unit-type')) {
                    refreshManageUpgradeQuantityControls(selectEl.closest('.manage-upgrade-option') || selectEl.closest('.manage-upgrade-wizard-option'));
                }
                return;
            }

            const previousUnit = selectEl.dataset.currentUnit || '';
            const customUnit = (await qdPrompt('Enter new unit type:', '', {
                title: 'New Unit Type'
            }) || '').trim();

            if (!customUnit) {
                selectEl.value = previousUnit;
                return;
            }

            const existingOption = Array.from(selectEl.options).find(function(option) {
                return option.value.toLowerCase() === customUnit.toLowerCase();
            });

            rememberManageUnitType(customUnit);
            ensureManageUnitOption(selectEl, customUnit);
            selectEl.value = existingOption ? existingOption.value : customUnit;
            selectEl.dataset.currentUnit = selectEl.value;

            markPricingDirty(selectEl);
            if (selectEl.classList.contains('upgrade-unit-type')) {
                refreshManageUpgradeQuantityControls(selectEl.closest('.manage-upgrade-option') || selectEl.closest('.manage-upgrade-wizard-option'));
            }
        }

        function manageItemsRowKey(cat, name) {
            return String(cat || '') + '||' + String(name || '');
        }

        function normalizeManageItemPhotos(item) {
            if (!item) return [];
            var photos = [];
            if (Array.isArray(item.photos)) {
                item.photos.forEach(function(photo) {
                    if (typeof photo === 'string' && photo.trim()) photos.push(photo);
                });
            }
            if (!photos.length && typeof item.photo === 'string' && item.photo.trim()) {
                photos.push(item.photo);
            }
            return photos.slice(0, MANAGE_ITEM_PHOTO_LIMIT);
        }

        function syncManageItemPhotoCompatibility(item) {
            if (!item) return [];
            var photos = normalizeManageItemPhotos(item);
            var photosFull = normalizeManageItemPhotosFull(item);
            item.photos = photos;
            item.photo = photos[0] || '';
            item.photosFull = photos.map(function(_photo, index) {
                return normalizeManageFullResPhotoMeta(photosFull[index]);
            });
            item.photoFull = item.photosFull[0] || null;
            return photos;
        }

        function normalizeManageItemPhotoCollections(db) {
            if (!db) return db;
            Object.keys(db).forEach(function(cat) {
                if (cat === '__choiceGroupTemplates' || !Array.isArray(db[cat])) return;
                db[cat].forEach(function(item) {
                    syncManageItemPhotoCompatibility(item);
                });
            });
            return db;
        }

        function findManagePhotoItems(cat, name) {
            var matches = [];
            [customItems, pricingDatabase].forEach(function(db) {
                if (!db || !Array.isArray(db[cat])) return;
                var item = db[cat].find(function(it) { return it && it.name === name; });
                if (item && matches.indexOf(item) === -1) matches.push(item);
            });
            return matches;
        }

        function findManagePhotoItem(cat, name) {
            var matches = findManagePhotoItems(cat, name);
            return matches[0] || null;
        }

        function getManageItemDetailsRow(cat, name) {
            var rowKey = manageItemsRowKey(cat, name);
            return Array.from(document.querySelectorAll('.item-details-row')).find(function(row) {
                return row && row.dataset && row.dataset.rowKey === rowKey;
            }) || null;
        }

        function syncManageUpgradePhotoFromDetails(cat, name, groupId, optionId, photo) {
            var detailsRow = getManageItemDetailsRow(cat, name);
            if (!detailsRow) return false;
            var targetGroupId = String(groupId || '');
            var targetOptionId = String(optionId || '');
            var optionEl = null;
            Array.from(detailsRow.querySelectorAll('.manage-upgrade-group')).some(function(groupEl) {
                if (String(groupEl.dataset.upgradeGroupId || '') !== targetGroupId) return false;
                optionEl = Array.from(groupEl.querySelectorAll('.manage-upgrade-option')).find(function(candidate) {
                    return String(candidate.dataset.upgradeOptionId || '') === targetOptionId;
                }) || null;
                return !!optionEl;
            });
            if (!optionEl) return false;
            var hidden = optionEl.querySelector('.upgrade-photo-value');
            if (!hidden) {
                hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.className = 'upgrade-photo-value';
                optionEl.insertBefore(hidden, optionEl.firstChild);
            }
            hidden.value = photo || '';
            var groups = collectManageItemUpgradeGroups(detailsRow, true);
            findManagePhotoItems(cat, name).forEach(function(item) {
                item.upgradeGroups = groups;
                setManageUpgradeOptionPhoto(item, groupId, optionId, photo);
            });
            return true;
        }

        function syncManageUpgradePhotoFullFromDetails(cat, name, groupId, optionId, photoFull) {
            var detailsRow = getManageItemDetailsRow(cat, name);
            if (!detailsRow) return false;
            var targetGroupId = String(groupId || '');
            var targetOptionId = String(optionId || '');
            var optionEl = null;
            Array.from(detailsRow.querySelectorAll('.manage-upgrade-group')).some(function(groupEl) {
                if (String(groupEl.dataset.upgradeGroupId || '') !== targetGroupId) return false;
                optionEl = Array.from(groupEl.querySelectorAll('.manage-upgrade-option')).find(function(candidate) {
                    return String(candidate.dataset.upgradeOptionId || '') === targetOptionId;
                }) || null;
                return !!optionEl;
            });
            if (!optionEl) return false;
            var hidden = optionEl.querySelector('.upgrade-photo-full-value');
            if (!hidden) {
                hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.className = 'upgrade-photo-full-value';
                optionEl.insertBefore(hidden, optionEl.firstChild);
            }
            hidden.value = JSON.stringify(normalizeManageFullResPhotoMeta(photoFull) || null);
            var groups = collectManageItemUpgradeGroups(detailsRow, true);
            findManagePhotoItems(cat, name).forEach(function(item) {
                item.upgradeGroups = groups;
                setManageUpgradeOptionPhotoFull(item, groupId, optionId, photoFull);
            });
            return true;
        }

        function shouldPromptManageItemPhotoReplacement(cat, name) {
            return normalizeManageItemPhotos(findManagePhotoItem(cat, name)).length >= MANAGE_ITEM_PHOTO_LIMIT;
        }

        function setManageItemDetailSectionOpen(cat, name, section, open) {
            var rowKey = manageItemsRowKey(cat, name);
            if (!manageOpenDetailSections[rowKey]) manageOpenDetailSections[rowKey] = {};
            manageOpenDetailSections[rowKey][section] = open !== false;
            if (open === false) delete manageOpenDetailSections[rowKey][section];
            if (!Object.keys(manageOpenDetailSections[rowKey]).length) delete manageOpenDetailSections[rowKey];
        }

        function setManageItemDetailSectionOpenFromToggle(toggle) {
            if (!toggle) return;
            var section = toggle.getAttribute('data-section') || '';
            var targetId = toggle.dataset ? toggle.dataset.target : '';
            var detailsRow = targetId ? document.getElementById(targetId) : null;
            var rowKey = detailsRow ? (detailsRow.getAttribute('data-row-key') || '') : '';
            var parts = rowKey.split('||');
            if (!parts.length || !parts[0]) return;
            setManageItemDetailSectionOpen(parts[0], parts.slice(1).join('||'), section, toggle.checked);
        }

        function applyManageDetailSectionState() {
            Object.keys(manageOpenDetailSections || {}).forEach(function(rowKey) {
                var detailsRow = Array.from(document.querySelectorAll('.item-details-row')).find(function(row) {
                    return row.getAttribute('data-row-key') === rowKey;
                });
                if (!detailsRow) return;
                var detailsId = detailsRow.id;
                var menu = Array.from(document.querySelectorAll('.details-section-menu')).find(function(el) {
                    return el.dataset && el.dataset.target === detailsId;
                });
                if (!menu) return;
                Object.keys(manageOpenDetailSections[rowKey] || {}).forEach(function(section) {
                    var toggle = Array.from(menu.querySelectorAll('[data-detail-section-toggle]')).find(function(el) {
                        return el.getAttribute('data-section') === section;
                    });
                    if (toggle) toggle.checked = true;
                });
                if (typeof window.syncManageDetailsSections === 'function') {
                    window.syncManageDetailsSections(detailsId);
                }
            });
        }

        function findManageUpgradePhotoTarget(item, groupId, optionId) {
            if (!item) return null;
            var targetGroupId = String(groupId || '');
            var targetOptionId = String(optionId || '');
            if (targetGroupId === 'legacy_upgrade' || targetOptionId === 'legacy_upgrade_option') {
                if (!item.upgrade) item.upgrade = {};
                return { option: item.upgrade, legacy: true };
            }
            var groups = Array.isArray(item.upgradeGroups) ? item.upgradeGroups : [];
            for (var g = 0; g < groups.length; g++) {
                var group = groups[g] || {};
                if (String(group.id || '') !== targetGroupId) continue;
                var options = Array.isArray(group.options) ? group.options : [];
                for (var o = 0; o < options.length; o++) {
                    var option = options[o] || {};
                    if (String(option.id || '') === targetOptionId) {
                        return { option: option, legacy: false };
                    }
                }
            }
            if (!groups.length && item.upgrade && item.upgrade.name) {
                return { option: item.upgrade, legacy: true };
            }
            return null;
        }

        function setManageUpgradeOptionPhoto(item, groupId, optionId, photo) {
            var target = findManageUpgradePhotoTarget(item, groupId, optionId);
            if (!target || !target.option) return false;
            target.option.photo = photo || '';
            if (target.legacy && item.upgrade) item.upgrade.photo = photo || '';
            if (item.upgrade && item.upgrade.name && target.option.name && item.upgrade.name === target.option.name) {
                item.upgrade.photo = photo || '';
            }
            return true;
        }

        function setManageUpgradeOptionPhotoFull(item, groupId, optionId, photoFull) {
            var target = findManageUpgradePhotoTarget(item, groupId, optionId);
            if (!target || !target.option) return false;
            target.option.photoFull = normalizeManageFullResPhotoMeta(photoFull);
            if (target.legacy && item.upgrade) item.upgrade.photoFull = target.option.photoFull;
            if (item.upgrade && item.upgrade.name && target.option.name && item.upgrade.name === target.option.name) {
                item.upgrade.photoFull = target.option.photoFull;
            }
            return true;
        }

        function getManageUpgradePhotoTargets(item) {
            var groups = normalizeManageItemUpgradeGroups(item);
            var targets = [];
            groups.forEach(function(group) {
                (group.options || []).forEach(function(option) {
                    if (!option || !option.name) return;
                    targets.push({
                        groupId: group.id || '',
                        groupName: group.name || 'Upgrade Options',
                        optionId: option.id || '',
                        optionName: option.name || '',
                        photo: option.photo || '',
                        photoFull: normalizeManageFullResPhotoMeta(option.photoFull),
                        upgradeType: option.upgradeType || ''
                    });
                });
            });
            return targets;
        }

        function countManageUpgradePhotos(item) {
            return getManageUpgradePhotoTargets(item).filter(function(target) {
                return !!target.photo;
            }).length;
        }

        function removeManageUpgradePhoto(cat, name, groupId, optionId) {
            if (!groupId && !optionId) return;
            pushUndoState();
            findManagePhotoItems(cat, name).forEach(function(item) {
                var existingTarget = findManageUpgradePhotoTarget(item, groupId, optionId);
                if (existingTarget && existingTarget.option) removeManageFullResPhotoMeta(existingTarget.option.photoFull);
                setManageUpgradeOptionPhoto(item, groupId, optionId, '');
                setManageUpgradeOptionPhotoFull(item, groupId, optionId, null);
            });
            setManageItemDetailSectionOpen(cat, name, 'photos', true);
            markRowDirty(manageItemsRowKey(cat, name));
            renderAllItemsList();
            showManageItemsToast('Upgrade photo removed. Save changes when ready.', true);
        }

        function removeManageItemPhoto(cat, name, photoIndex) {
            var index = parseInt(photoIndex, 10);
            if (!Number.isFinite(index) || index < 0) return;
            pushUndoState();
            findManagePhotoItems(cat, name).forEach(function(item) {
                var photos = normalizeManageItemPhotos(item);
                var photosFull = normalizeManageItemPhotosFull(item);
                if (index >= photos.length) return;
                removeManageFullResPhotoMeta(photosFull[index]);
                photos.splice(index, 1);
                photosFull.splice(index, 1);
                item.photos = photos;
                item.photosFull = photosFull;
                item.photo = photos[0] || '';
                item.photoFull = photosFull[0] || null;
            });
            setManageItemDetailSectionOpen(cat, name, 'photos', true);
            markRowDirty(manageItemsRowKey(cat, name));
            renderAllItemsList();
            showManageItemsToast('Photo removed. Save changes when ready.', true);
        }

        function openManageItemPhotoReplacePicker(cat, name) {
            var photos = normalizeManageItemPhotos(findManagePhotoItem(cat, name));
            if (photos.length < MANAGE_ITEM_PHOTO_LIMIT) {
                if (typeof window.openManageItemPhotoFilePicker === 'function') {
                    window.openManageItemPhotoFilePicker(cat, name, 'photo');
                }
                return;
            }
            var existing = document.getElementById('manageItemPhotoReplaceModal');
            if (existing) existing.remove();
            var modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'manageItemPhotoReplaceModal';
            modal.tabIndex = -1;
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title"><i class="fas fa-camera me-2"></i>Replace Item Photo</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted mb-3">This item already has 3 photos. Choose which photo to replace.</p>
                            <div class="row g-2">
                                ${photos.map(function(photo, index) {
                                    return `<div class="col-4">
                                        <button type="button" class="btn btn-outline-primary w-100 p-2 manage-photo-replace-choice" data-photo-index="${index}">
                                            <img src="${manageItemsAttr(photo)}" class="rounded d-block mx-auto mb-2" style="width:100%;height:88px;object-fit:cover;" alt="Photo ${index + 1}">
                                            Replace ${index + 1}
                                        </button>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('.manage-photo-replace-choice').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var index = this.dataset.photoIndex;
                    var bs = window.bootstrap && window.bootstrap.Modal ? window.bootstrap.Modal.getInstance(modal) : null;
                    if (bs) bs.hide();
                    else modal.remove();
                    if (typeof window.openManageItemPhotoFilePicker === 'function') {
                        window.openManageItemPhotoFilePicker(cat, name, 'photo', index);
                    }
                });
            });
            if (window.bootstrap && window.bootstrap.Modal) {
                modal.addEventListener('hidden.bs.modal', function() { modal.remove(); }, { once: true });
                window.bootstrap.Modal.getOrCreateInstance(modal).show();
            } else {
                modal.classList.add('show');
                modal.style.display = 'block';
            }
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

        function loadManageCategoryOrderState() {
            try {
                manageItemsCategoryOrderMode = localStorage.getItem(MANAGE_CATEGORY_ORDER_MODE_KEY) === 'custom' ? 'custom' : 'alphabetical';
            } catch(e) {
                manageItemsCategoryOrderMode = 'alphabetical';
            }
            try {
                var stored = JSON.parse(localStorage.getItem(MANAGE_CATEGORY_CUSTOM_ORDER_KEY) || '[]');
                manageItemsCategoryCustomOrder = Array.isArray(stored) ? stored.filter(Boolean) : [];
            } catch(e) {
                manageItemsCategoryCustomOrder = [];
            }
        }

        function getManageItemsCategoryOrderMode() {
            return manageItemsCategoryOrderMode === 'custom' ? 'custom' : 'alphabetical';
        }

        function saveManageCategoryCustomOrder(order) {
            var seen = new Set();
            manageItemsCategoryCustomOrder = (Array.isArray(order) ? order : []).map(function(cat) {
                return String(cat || '').trim();
            }).filter(function(cat) {
                var key = cat.toLowerCase();
                if (!cat || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            localStorage.setItem(MANAGE_CATEGORY_CUSTOM_ORDER_KEY, JSON.stringify(manageItemsCategoryCustomOrder));
        }

        function getManageCategoryNamesWithItems() {
            return Object.keys(pricingDatabase || {}).filter(function(cat) {
                return cat.indexOf('__') !== 0 && Array.isArray(pricingDatabase[cat]) && pricingDatabase[cat].length;
            });
        }

        function getOrderedManageCategories() {
            var categories = getManageCategoryNamesWithItems();
            if (getManageItemsCategoryOrderMode() !== 'custom') {
                return categories.sort(function(a, b) { return a.localeCompare(b); });
            }

            var categorySet = new Set(categories);
            var customOrder = manageItemsCategoryCustomOrder.filter(function(cat) {
                return categorySet.has(cat);
            });
            var orderedSet = new Set(customOrder);
            var missingCategories = categories.filter(function(cat) {
                return !orderedSet.has(cat);
            }).sort(function(a, b) {
                return a.localeCompare(b);
            });
            var normalizedOrder = customOrder.concat(missingCategories);
            if (normalizedOrder.join('\u0001') !== manageItemsCategoryCustomOrder.join('\u0001')) {
                saveManageCategoryCustomOrder(normalizedOrder);
            }
            return normalizedOrder;
        }

        function renameManageCategoryOrder(oldCat, newCat) {
            if (!oldCat || !newCat) return;
            var changed = false;
            var mappedOrder = manageItemsCategoryCustomOrder.map(function(cat) {
                if (cat === oldCat) {
                    changed = true;
                    return newCat;
                }
                return cat;
            });
            if (changed) saveManageCategoryCustomOrder(mappedOrder);
        }

        function updateManageCategoryOrderControls() {
            var mode = getManageItemsCategoryOrderMode();
            var badge = document.getElementById('manage-category-order-mode-badge');
            if (badge) badge.textContent = mode === 'custom' ? 'Custom' : 'A-Z';
            var button = document.getElementById('manageCategoryOrganizeBtn');
            if (button) button.classList.toggle('btn-primary', mode === 'custom');
            if (button) button.classList.toggle('btn-outline-primary', mode !== 'custom');
            document.querySelectorAll('.manage-category-drag-handle').forEach(function(handle) {
                handle.style.display = mode === 'custom' ? '' : 'none';
            });
        }

        function saveManageCategoryOrderFromDom() {
            var container = document.getElementById('customItemsList');
            if (!container) return;
            var order = Array.from(container.querySelectorAll('.manage-items-category')).map(function(section) {
                return section.dataset.category || '';
            }).filter(Boolean);
            saveManageCategoryCustomOrder(order);
            showManageItemsToast('Custom category order saved.', true);
        }

        function initManageCategorySortable() {
            var container = document.getElementById('customItemsList');
            if (manageCategorySortable && typeof manageCategorySortable.destroy === 'function') {
                manageCategorySortable.destroy();
                manageCategorySortable = null;
            }
            if (!container || getManageItemsCategoryOrderMode() !== 'custom' || typeof Sortable === 'undefined') {
                updateManageCategoryOrderControls();
                return;
            }
            manageCategorySortable = Sortable.create(container, {
                animation: 150,
                draggable: '.manage-items-category',
                handle: '.manage-category-drag-handle',
                filter: '#manageItemsEmptyFilter',
                onEnd: saveManageCategoryOrderFromDom
            });
            updateManageCategoryOrderControls();
        }

        function showManageCategoryCustomOrderHelp() {
            qdAlert('Drag categories up or down using the grip handle beside each category name. QuoteDr saves this custom order automatically, and it will still be remembered if you switch back to Alphabetical later.', {
                title: 'Custom Category Order',
                type: 'info',
                okText: 'Got it'
            });
        }

        async function setManageItemsCategoryOrderMode(mode) {
            loadManageCategoryOrderState();
            manageItemsCategoryOrderMode = mode === 'custom' ? 'custom' : 'alphabetical';
            localStorage.setItem(MANAGE_CATEGORY_ORDER_MODE_KEY, manageItemsCategoryOrderMode);
            if (manageItemsCategoryOrderMode === 'custom' && !manageItemsCategoryCustomOrder.length) {
                saveManageCategoryCustomOrder(getManageCategoryNamesWithItems().sort(function(a, b) {
                    return a.localeCompare(b);
                }));
            }
            renderAllItemsList();
            if (manageItemsCategoryOrderMode === 'custom') showManageCategoryCustomOrderHelp();
        }

        async function openManageCategoryOrganizeMenu() {
            var choice = await qdConfirm('Choose how Manage Items should organize your categories. Custom lets you drag category rows into your preferred order; Alphabetical sorts them A to Z without erasing your saved custom order.', {
                title: 'Organize Categories',
                okText: 'Custom',
                secondaryText: 'Alphabetical',
                cancelText: 'Cancel',
                type: 'info'
            });
            if (choice === true) return setManageItemsCategoryOrderMode('custom');
            if (choice === 'secondary') return setManageItemsCategoryOrderMode('alphabetical');
        }

        function loadManageCategoryRenames() {
            try {
                manageCategoryRenames = JSON.parse(localStorage.getItem(MANAGE_CATEGORY_RENAMES_KEY) || '{}') || {};
            } catch(e) {
                manageCategoryRenames = {};
            }
        }

        function saveManageCategoryRenames() {
            localStorage.setItem(MANAGE_CATEGORY_RENAMES_KEY, JSON.stringify(manageCategoryRenames || {}));
            _saveCategoryRenamesToCloud().catch(function(){});
        }

        async function _saveCategoryRenamesToCloud() {
            try {
                if (typeof _supabase === 'undefined') return;
                var user = await _supabase.auth.getUser();
                if (!user.data?.user) return;
                await _supabase.from('user_data').upsert(
                    { user_id: user.data.user.id, key: 'category_renames', value: manageCategoryRenames || {}, updated_at: new Date().toISOString() },
                    { onConflict: 'user_id,key' }
                );
            } catch(e) {
                console.warn('Category renames cloud save failed:', e);
            }
        }

        async function _restoreCategoryRenamesFromCloud() {
            try {
                if (typeof _supabase === 'undefined') return;
                var user = await _supabase.auth.getUser();
                if (!user.data?.user) return;
                var { data } = await _supabase.from('user_data').select('value').eq('user_id', user.data.user.id).eq('key', 'category_renames').single();
                if (data?.value && typeof data.value === 'object') {
                    Object.assign(manageCategoryRenames, data.value);
                    localStorage.setItem(MANAGE_CATEGORY_RENAMES_KEY, JSON.stringify(manageCategoryRenames || {}));
                    applyManageCategoryRenames();
                    populateNewItemCategorySelect(document.getElementById('newItemCategory')?.value);
                    renderAllItemsList();
                }
            } catch(e) {
                console.warn('Category renames cloud restore failed:', e);
            }
        }

        function mergeManageCategoryItems(store, oldCat, newCat) {
            if (!store || !Array.isArray(store[oldCat])) return;
            if (!Array.isArray(store[newCat])) store[newCat] = [];
            var existingNames = new Set(store[newCat].filter(Boolean).map(function(item) {
                return String(item.name || '').toLowerCase();
            }));
            store[oldCat].forEach(function(item) {
                if (!item) return;
                item.category = newCat;
                var key = String(item.name || '').toLowerCase();
                if (!key || !existingNames.has(key)) {
                    store[newCat].push(item);
                    if (key) existingNames.add(key);
                }
            });
            delete store[oldCat];
        }

        function moveManageCategoryData(oldCat, newCat) {
            mergeManageCategoryItems(pricingDatabase, oldCat, newCat);
            mergeManageCategoryItems(customItems, oldCat, newCat);

            if (categoryStyles && categoryStyles[oldCat]) {
                if (!categoryStyles[newCat]) categoryStyles[newCat] = categoryStyles[oldCat];
                delete categoryStyles[oldCat];
            }

            if (Object.prototype.hasOwnProperty.call(manageItemsCategoryState, oldCat)) {
                manageItemsCategoryState[newCat] = manageItemsCategoryState[oldCat];
                delete manageItemsCategoryState[oldCat];
            }

            renameManageCategoryOrder(oldCat, newCat);

            var templates = customItems && Array.isArray(customItems.__choiceGroupTemplates) ? customItems.__choiceGroupTemplates : [];
            templates.forEach(function(group) {
                (group.options || []).forEach(function(option) {
                    if (option.category === oldCat) option.category = newCat;
                });
            });

            var quoteRooms = [];
            try {
                if (typeof rooms !== 'undefined' && Array.isArray(rooms)) {
                    quoteRooms = rooms;
                } else if (Array.isArray(window.rooms)) {
                    quoteRooms = window.rooms;
                }
            } catch (err) {
                quoteRooms = Array.isArray(window.rooms) ? window.rooms : [];
            }
            if (quoteRooms.length) {
                quoteRooms.forEach(function(room) {
                    (room.items || []).forEach(function(item) {
                        if (item.category === oldCat) item.category = newCat;
                    });
                });
            }
        }

        function applyManageCategoryRenames() {
            loadManageCategoryOrderState();
            loadManageCategoryRenames();
            Object.keys(manageCategoryRenames || {}).forEach(function(oldCat) {
                var newCat = (manageCategoryRenames[oldCat] || '').trim();
                if (!newCat || oldCat === newCat) return;
                moveManageCategoryData(oldCat, newCat);
            });
        }

        function categoryNameExists(cat, ignoreCat) {
            var key = String(cat || '').trim().toLowerCase();
            var ignoredName = String(ignoreCat || '').trim();
            if (!key) return false;
            return Object.keys(pricingDatabase || {}).concat(Object.keys(customItems || {}).filter(function(k) {
                return k !== '__choiceGroupTemplates';
            })).some(function(existing) {
                if (ignoredName && String(existing || '').trim() === ignoredName) return false;
                return String(existing || '').trim().toLowerCase() === key;
            });
        }

        async function renameManageItemsCategory(oldCat) {
            oldCat = String(oldCat || '').trim();
            if (!oldCat) return false;
            var nextName = (await qdPrompt('Rename category:', oldCat, {
                title: 'Rename Category'
            }) || '').trim();
            if (!nextName || nextName === oldCat) return false;
            if (categoryNameExists(nextName, oldCat)) {
                qdAlert('A category named "' + nextName + '" already exists. Choose a unique name so QuoteDr does not merge unrelated items.');
                return false;
            }

            pushUndoState();
            Object.keys(manageCategoryRenames || {}).forEach(function(sourceCat) {
                if (manageCategoryRenames[sourceCat] === oldCat) manageCategoryRenames[sourceCat] = nextName;
            });
            delete manageCategoryRenames[nextName];
            manageCategoryRenames[oldCat] = nextName;
            moveManageCategoryData(oldCat, nextName);
            saveManageCategoryRenames();
            saveManageItemsCategoryState();
            saveCustomItems(false);
            populateNewItemCategorySelect(nextName);
            renderAllItemsList();
            if (typeof renderRooms === 'function') renderRooms();
            if (typeof calculateTotals === 'function') calculateTotals();
            if (typeof markUnsaved === 'function') markUnsaved();
            showManageItemsToast('Category renamed to "' + nextName + '".', true);
            return true;
        }

        function renameSelectedCategory() {
            var catSelect = document.getElementById('newItemCategory');
            if (!catSelect || catSelect.value === CREATE_NEW_CATEGORY_VALUE) return;
            renameManageItemsCategory(catSelect.value);
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
            normalizeManageItemPhotoCollections(customItems);

            var localIsEmpty = Object.keys(customItems).length === 0;

            // Always sync from cloud on load - cloud is source of truth
            _doRestoreItemsFromCloud().then(function(result) {
                if (!result.error && result.data && Object.keys(result.data).length > 0) {
                    var cloudItems = normalizeManageItemPhotoCollections(result.data);
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
            loadManageCategoryRenames();
            _restoreCategoryRenamesFromCloud().catch(function(){});
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
            applyManageCategoryRenames();
            loadItemOverrides();
            syncManageUnitTypeOptions();
        }

        function saveCustomItems(showToast) {
            normalizeManageItemPhotoCollections(customItems);
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
                if (typeof window.notifyBuilderGuideSavedItemCategorySelected === 'function') {
                    window.notifyBuilderGuideSavedItemCategorySelected();
                }
                return existing;
            }
            pricingDatabase[newCat] = [];
            populateNewItemCategorySelect(newCat);
            if (typeof window.notifyBuilderGuideSavedItemCategorySelected === 'function') {
                window.notifyBuilderGuideSavedItemCategorySelected();
            }
            return newCat;
        }

        async function addNewUnitType() {
            const newUnit = (await qdPrompt('Enter new unit type (e.g., "bundle", "bag", "gallon"):', '', {
                title: 'New Unit Type'
            }) || '').trim();
            if (!newUnit || newUnit.length === 0) return;
            const datalist = document.getElementById('unitTypeOptions');
            if ([...datalist.children].find(opt => opt.value === newUnit)) { qdAlert('Unit type already exists!'); return; }
            rememberManageUnitType(newUnit);
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
            if (catSelect.value && typeof window.notifyBuilderGuideSavedItemCategorySelected === 'function') {
                window.notifyBuilderGuideSavedItemCategorySelected();
            }
        }

        function handleItemPhotoUpload(input) {
            var file = input.files[0];
            if (!file) return;
            var cat = input.dataset.cat, name = input.dataset.name, field = input.dataset.field || 'photo';
            var upgradeGroupId = input.dataset.upgradeGroupId || '';
            var upgradeOptionId = input.dataset.upgradeOptionId || '';
            var requestedIndex = input.dataset.photoIndex === undefined || input.dataset.photoIndex === ''
                ? -1
                : parseInt(input.dataset.photoIndex, 10);
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = async function() {
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
                    var existingFullMeta = null;
                    var firstPhotoItem = findManagePhotoItem(cat, name);
                    if (firstPhotoItem) {
                        if (field === 'upgradePhoto') {
                            var existingTarget = findManageUpgradePhotoTarget(firstPhotoItem, upgradeGroupId, upgradeOptionId);
                            existingFullMeta = existingTarget && existingTarget.option ? existingTarget.option.photoFull : null;
                        } else {
                            var existingPhotosFull = normalizeManageItemPhotosFull(firstPhotoItem);
                            existingFullMeta = Number.isFinite(requestedIndex) && requestedIndex >= 0 ? existingPhotosFull[requestedIndex] : null;
                        }
                    }
                    var fullMeta = null;
                    var fullResWarning = '';
                    try {
                        fullMeta = await uploadManageFullResPhoto(file, {
                            cat: cat,
                            name: name,
                            field: field,
                            upgradeGroupId: upgradeGroupId,
                            upgradeOptionId: upgradeOptionId
                        }, existingFullMeta, { width: img.width, height: img.height });
                    } catch(fullErr) {
                        var fullErrMessage = fullErr && fullErr.message ? fullErr.message : 'Full-resolution photo was not saved.';
                        fullResWarning = /bucket not found|not found/i.test(fullErrMessage)
                            ? 'Full-resolution photo storage is not set up yet. The compressed thumbnail was saved.'
                            : fullErrMessage;
                    }
                    var upgradePhotoSyncedFromDetails = field === 'upgradePhoto'
                        ? syncManageUpgradePhotoFromDetails(cat, name, upgradeGroupId, upgradeOptionId, dataUrl)
                        : false;
                    var upgradePhotoSaved = upgradePhotoSyncedFromDetails;
                    if (field === 'upgradePhoto') {
                        syncManageUpgradePhotoFullFromDetails(cat, name, upgradeGroupId, upgradeOptionId, fullMeta);
                    }
                    // Find item in customItems and pricingDatabase
                    var targets = [customItems, pricingDatabase];
                    targets.forEach(function(db) {
                        if (!db[cat]) return;
                        var item = db[cat].find(function(it) { return it && it.name === name; });
                        if (!item) return;
                        if (field === 'upgradePhoto') {
                            if (!setManageUpgradeOptionPhoto(item, upgradeGroupId, upgradeOptionId, dataUrl)) {
                                var isLegacyUpgradePhoto = upgradeGroupId === 'legacy_upgrade' || upgradeOptionId === 'legacy_upgrade_option' || (!upgradeGroupId && !upgradeOptionId);
                                if (isLegacyUpgradePhoto) {
                                    if (!item.upgrade) item.upgrade = {};
                                    item.upgrade.photo = dataUrl;
                                    item.upgrade.photoFull = normalizeManageFullResPhotoMeta(fullMeta);
                                    upgradePhotoSaved = true;
                                }
                            } else {
                                upgradePhotoSaved = true;
                            }
                            setManageUpgradeOptionPhotoFull(item, upgradeGroupId, upgradeOptionId, fullMeta);
                        } else {
                            var photos = normalizeManageItemPhotos(item);
                            var photosFull = normalizeManageItemPhotosFull(item);
                            var oldFullMeta = null;
                            if (Number.isFinite(requestedIndex) && requestedIndex >= 0 && requestedIndex < MANAGE_ITEM_PHOTO_LIMIT) {
                                oldFullMeta = photosFull[requestedIndex] || null;
                                photos[requestedIndex] = dataUrl;
                                photosFull[requestedIndex] = normalizeManageFullResPhotoMeta(fullMeta);
                            } else if (photos.length < MANAGE_ITEM_PHOTO_LIMIT) {
                                photos.push(dataUrl);
                                photosFull.push(normalizeManageFullResPhotoMeta(fullMeta));
                            } else {
                                return;
                            }
                            if (oldFullMeta && manageFullResPhotoIdentity(oldFullMeta) !== manageFullResPhotoIdentity(fullMeta)) {
                                removeManageFullResPhotoMeta(oldFullMeta);
                            }
                            item.photos = photos.filter(Boolean).slice(0, MANAGE_ITEM_PHOTO_LIMIT);
                            item.photosFull = item.photos.map(function(_photo, index) {
                                return normalizeManageFullResPhotoMeta(photosFull[index]);
                            });
                            item.photo = item.photos[0] || '';
                            item.photoFull = item.photosFull[0] || null;
                        }
                    });
                    if (field === 'upgradePhoto' && existingFullMeta && manageFullResPhotoIdentity(existingFullMeta) !== manageFullResPhotoIdentity(fullMeta)) {
                        removeManageFullResPhotoMeta(existingFullMeta);
                    }
                    setManageItemDetailSectionOpen(cat, name, 'photos', true);
                    markRowDirty(manageItemsRowKey(cat, name));
                    renderAllItemsList();
                    if (field === 'upgradePhoto' && !upgradePhotoSaved) {
                        showManageItemsToast('Could not attach that upgrade photo. Reopen the upgrade details and try again.', false);
                    } else if (fullResWarning) {
                        showManageItemsToast('Photo updated as a compressed thumbnail. ' + fullResWarning, false);
                    } else {
                        showManageItemsToast(fullMeta ? 'Photo updated with full-resolution original. Save changes when ready.' : 'Photo updated. Save changes when ready.', true);
                    }
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
            applyManageCategoryRenames();
            const catSelect = document.getElementById('newItemCategory');
            if (!catSelect) { console.error('newItemCategory not found'); return; }
            loadManageItemsCategoryState();
            populateNewItemCategorySelect(catSelect.value);
            document.getElementById('newItemName').value = '';
            document.getElementById('newItemUnit').value = '';
            document.getElementById('newItemRate').value = '';
            document.getElementById('newItemMaterialCost').value = '';
            document.getElementById('newItemSupplierUrl').value = '';
            resetNewItemUpgradePanel();
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
            bindManageItemsCloseGuard();
            manageItemsCloseConfirmed = false;
            manageItemsClosePromptOpen = false;
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

        function resetNewItemUpgradePanel(clearWizard) {
            const panel = document.getElementById('newItemUpgradePanel');
            const btn = document.getElementById('toggleNewItemUpgradeBtn');
            if (panel) panel.style.display = 'none';
            if (btn) btn.innerHTML = '<i class="fas fa-arrow-up"></i> Add Upgrade';
            if (clearWizard !== false) {
                manageNewItemWizardUpgradeGroups = [];
                syncNewItemUpgradeWizardSummary();
            }
            [
                'newItemUpgradeName',
                'newItemUpgradeUnit',
                'newItemUpgradeRate',
                'newItemUpgradeMaterialCost',
                'newItemUpgradeSupplierUrl',
                'newItemUpgradeDescription',
                'newItemUpgradeType'
            ].forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.value = id === 'newItemUpgradeType' ? 'replacement' : '';
            });
        }

        function toggleNewItemUpgradePanel(forceOpen) {
            const panel = document.getElementById('newItemUpgradePanel');
            const btn = document.getElementById('toggleNewItemUpgradeBtn');
            if (!panel) return;
            const isOpen = panel.style.display !== 'none';
            const open = forceOpen === true || (forceOpen !== false && !isOpen);
            if (!open) {
                resetNewItemUpgradePanel(false);
                return;
            }
            panel.style.display = 'block';
            if (btn) btn.innerHTML = '<i class="fas fa-times"></i> Remove Upgrade';
            setTimeout(function() {
                document.getElementById('newItemUpgradeName')?.focus();
            }, 0);
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
            manageItemsCloseConfirmed = false;
            manageItemsClosePromptOpen = false;
        }

        function hasUnsavedManageItemsChanges() {
            return !!(pricingDirty || pricingOtherDirty || dirtyPricingRows.size > 0);
        }

        async function confirmDiscardManageItemsChanges() {
            return await qdConfirm('You have unsaved changes, are you sure you want to exit?', {
                title: 'Unsaved Changes',
                okText: 'Exit Without Saving',
                cancelText: 'Keep Editing',
                okClass: 'btn-warning',
                type: 'warning'
            });
        }

        function bindManageItemsCloseGuard() {
            const modalEl = document.getElementById('manageItemsModal');
            if (!modalEl || modalEl.dataset.manageCloseGuardBound === '1') return;
            modalEl.dataset.manageCloseGuardBound = '1';
            modalEl.addEventListener('hide.bs.modal', function(event) {
                if (manageItemsCloseConfirmed || !hasUnsavedManageItemsChanges()) return;
                event.preventDefault();
                if (manageItemsClosePromptOpen) return;
                manageItemsClosePromptOpen = true;
                confirmDiscardManageItemsChanges().then(function(shouldExit) {
                    manageItemsClosePromptOpen = false;
                    if (!shouldExit) return;
                    clearPricingDirty();
                    manageItemsCloseConfirmed = true;
                    hideManageItemsModal();
                }).catch(function() {
                    manageItemsClosePromptOpen = false;
                });
            });
            modalEl.addEventListener('hidden.bs.modal', function() {
                manageItemsCloseConfirmed = false;
                manageItemsClosePromptOpen = false;
            });
        }

        async function closeManageItemsModal() {
            if (hasUnsavedManageItemsChanges()) {
                const shouldExit = await confirmDiscardManageItemsChanges();
                if (!shouldExit) return false;
                clearPricingDirty();
            }
            manageItemsCloseConfirmed = true;
            hideManageItemsModal();
            return true;
        }

        let pricingDirty = false; // tracks unsaved changes in Manage Items modal
        let manageItemsCloseConfirmed = false;
        let manageItemsClosePromptOpen = false;
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
            const unitType    = row.querySelector('.item-unit-type-input')?.value.trim() || '';
            const rate        = parseFloat(inputs[0]?.value) || 0;
            const detailsRow  = document.getElementById('details_' + safeId);
            const detailMaterialInput = detailsRow?.querySelector('.item-detail-material-cost');
            const detailSupplierInput = detailsRow?.querySelector('.item-detail-supplier-url');
            const matCost     = parseFloat(detailMaterialInput?.value || inputs[1]?.value) || 0;
            const supplierUrl = (detailSupplierInput?.value || inputs[2]?.value || '').trim();
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
                const upgType = normalizeManageUpgradeType(collapseRow.querySelector('.upgrade-type')?.value);
                if (upgName) upgrade = { name: upgName, unitType: upgUnitType, rate: upgRate, materialCost: upgMaterialCost, supplierUrl: upgSupplierUrl, description: upgDesc, type: upgType };
            }
            const upgradeGroups = collectManageItemUpgradeGroups(detailsRow);
            if (!upgrade && upgradeGroups.length && upgradeGroups[0].options[0]) {
                const firstUpgradeOption = upgradeGroups[0].options[0];
                upgrade = {
                    name: firstUpgradeOption.name,
                    unitType: firstUpgradeOption.unitType,
                    rate: firstUpgradeOption.rate,
                    materialCost: firstUpgradeOption.materialCost,
                    supplierUrl: firstUpgradeOption.supplierUrl,
                    description: firstUpgradeOption.description,
                    type: firstUpgradeOption.upgradeType
                };
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
                    ci = { name: pi.name, unitType: pi.unitType || '', rate: pi.rate || 0, materialCost: pi.materialCost || 0, supplierUrl: pi.supplierUrl || '', itemDescription: pi.itemDescription || '', photo: pi.photo || '', photos: normalizeManageItemPhotos(pi), photoFull: normalizeManageFullResPhotoMeta(pi.photoFull), photosFull: normalizeManageItemPhotosFull(pi), laborTime: normalizeManageLaborTime(pi.laborTime), upgrade: pi.upgrade || undefined, upgradeGroups: normalizeManageItemUpgradeGroups(pi) };
                    syncManageItemPhotoCompatibility(ci);
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
            if (upgradeGroups.length) {
                ci.upgradeGroups = upgradeGroups;
            } else if (hasUpgradeEditor) {
                delete ci.upgradeGroups;
            }
            if (upgrade !== null) {
                // Preserve upgrade photo from previous state
                var oldUpgPhoto = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.upgrade?.photo;
                var oldUpgPhotoFull = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;})?.upgrade?.photoFull;
                if (!upgrade.photo && oldUpgPhoto) upgrade.photo = oldUpgPhoto;
                if (!upgrade.photoFull && oldUpgPhotoFull) upgrade.photoFull = normalizeManageFullResPhotoMeta(oldUpgPhotoFull);
                ci.upgrade = upgrade;
            } else if (hasUpgradeEditor) {
                delete ci.upgrade;
            }
            rememberManageUnitType(unitType);
            if (upgrade && upgrade.unitType) rememberManageUnitType(upgrade.unitType);
            upgradeGroups.forEach(function(group) {
                (group.options || []).forEach(function(option) {
                    if (option.unitType) rememberManageUnitType(option.unitType);
                });
            });
            // Preserve item photos from previous state and keep legacy item.photo compatible.
            var currentPhotos = normalizeManageItemPhotos(ci);
            if (!currentPhotos.length) {
                var oldPhotoItem = pricingDatabase[cat]?.find(function(i){return i.name===name||i.name===newName;});
                currentPhotos = normalizeManageItemPhotos(oldPhotoItem);
                if (currentPhotos.length) {
                    ci.photos = currentPhotos;
                    ci.photosFull = normalizeManageItemPhotosFull(oldPhotoItem);
                    ci.photoFull = ci.photosFull[0] || null;
                }
            }
            syncManageItemPhotoCompatibility(ci);
            if (beforeQuoteSyncItem && typeof recordSavedItemQuoteChange === 'function' && typeof getSavedItemFingerprintForQuoteSync === 'function') {
                recordSavedItemQuoteChange(cat, name, beforeQuoteSyncItem, ci);
            }

            // Mirror into pricingDatabase
            if (!pricingDatabase[cat]) pricingDatabase[cat] = [];
            const pi = pricingDatabase[cat].find(i => i.name === name);
            if (pi) {
                Object.assign(pi, ci, { _custom: true });
                if (hasUpgradeEditor && upgrade === null) delete pi.upgrade;
                if (hasUpgradeEditor && !upgradeGroups.length) delete pi.upgradeGroups;
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
            updateManageRowMargin(row);
            updateManageDetailMargin(detailsRow);

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

        function saveManageUpgradeWizardRow(detailsRow) {
            const rowKey = detailsRow ? (detailsRow.getAttribute('data-row-key') || '') : '';
            const row = getManageRowByKey(rowKey);
            const saveBtn = row ? row.querySelector('.item-save-btn') : null;
            if (!saveBtn?.dataset.cat || !saveBtn?.dataset.name) return false;
            pushUndoState();
            const saved = saveItemRowCore(saveBtn.dataset.cat, saveBtn.dataset.name, { backup: false, flash: false });
            if (!saved) return false;
            localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
            _doBackupItemsToCloud(customItems).then(function(result) {
                const ok = result && !result.error;
                showManageItemsToast(ok ? 'Upgrade group saved.' : 'Saved locally - cloud sync failed.', ok);
                filterItemsList();
            }).catch(function() {
                showManageItemsToast('Saved locally - cloud sync failed.', false);
                filterItemsList();
            });
            if (manageItemsFilter === 'unsaved') filterItemsList();
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
                    const itemPhotosFull = normalizeManageItemPhotosFull(item);
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
                            ${item.photo ? `<img src="${manageItemsAttr(item.photo)}" data-photo-src="${manageItemsAttr(item.photo)}" data-full-photo="${manageFullResPhotoDataAttr(item.photoFull || itemPhotosFull[0])}" class="mt-1 rounded" style="max-width:60px;max-height:40px;cursor:pointer;" onclick="openManageItemPhotoLightbox(this)" title="Click to enlarge">` : ''}
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
                                        ${renderManageUnitSelect(upgUnitType, 'upgrade-unit-type')}
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
                                    <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="upgradePhoto" data-upgrade-group-id="legacy_upgrade" data-upgrade-option-id="legacy_upgrade_option" title="Add upgrade photo" style="font-size:0.75em;"><i class="fas fa-camera me-1"></i>Upgrade Photo</button>
                                    ${upg.photo ? `<img src="${manageItemsAttr(upg.photo)}" data-photo-src="${manageItemsAttr(upg.photo)}" data-full-photo="${manageFullResPhotoDataAttr(upg.photoFull)}" class="ms-2 rounded" style="max-width:80px;max-height:50px;cursor:pointer;vertical-align:middle;" onclick="openManageItemPhotoLightbox(this)" title="Click to enlarge">` : ''}
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

        function updateManageDetailMargin(sourceEl) {
            const detailsRow = sourceEl?.classList?.contains('item-details-row')
                ? sourceEl
                : sourceEl?.closest?.('.item-details-row');
            if (!detailsRow) return;
            const rowKey = detailsRow.getAttribute('data-row-key') || '';
            const row = rowKey ? getManageRowByKey(rowKey) : null;
            const rowInputs = row ? row.querySelectorAll('input.item-input') : [];
            const rate = parseFloat(rowInputs[0]?.value || 0) || 0;
            const material = parseFloat(detailsRow.querySelector('.item-detail-material-cost')?.value || rowInputs[1]?.value || 0) || 0;
            const target = detailsRow.querySelector('.manage-detail-margin-target');
            if (target) target.innerHTML = renderManageMarginPill(rate, material);
            const rowTarget = row?.querySelector('.manage-row-margin-target');
            if (rowTarget) rowTarget.innerHTML = renderManageMarginPill(rate, material);
        }

        function updateManageRowMargin(sourceEl) {
            const row = sourceEl?.classList?.contains('manage-items-row')
                ? sourceEl
                : sourceEl?.closest?.('.manage-items-row');
            if (!row) return;
            const inputs = row.querySelectorAll('input.item-input');
            const rate = parseFloat(inputs[0]?.value || 0) || 0;
            const material = parseFloat(inputs[1]?.value || 0) || 0;
            const target = row.querySelector('.manage-row-margin-target');
            if (target) target.innerHTML = renderManageMarginPill(rate, material);
            const detailsId = row.dataset.detailsId || '';
            const detailsRow = detailsId ? document.getElementById(detailsId) : null;
            if (detailsRow) {
                const detailMaterialInput = detailsRow.querySelector('.item-detail-material-cost');
                if (detailMaterialInput && sourceEl === inputs[1]) detailMaterialInput.value = inputs[1].value;
                updateManageDetailMargin(detailsRow);
            }
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
            if (inputEl.classList.contains('item-detail-material-cost') && rowInputs[1]) {
                rowInputs[1].value = inputEl.value;
            }
            if (inputEl.classList.contains('item-detail-supplier-url') && rowInputs[2]) {
                rowInputs[2].value = inputEl.value;
            }
        }

        function renderAllItemsList() {
            const container = document.getElementById('customItemsList');
            let html = '';

            const orderedCategories = getOrderedManageCategories();
            orderedCategories.forEach((cat) => {
                const items = pricingDatabase[cat] || [];
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
                        <button type="button" class="manage-category-drag-handle" title="Drag to reorder category" style="${getManageItemsCategoryOrderMode() === 'custom' ? '' : 'display:none;'}">
                            <i class="fas fa-grip-vertical"></i>
                        </button>
                        ${catIconMarkup}
                        <h6 class="fw-bold mb-0 text-primary" style="flex:1;">${manageItemsEscape(cat)}</h6>
                        <span class="manage-items-category-count">${items.length}</span>
                        <button class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem; padding:1px 8px;" onclick="renameManageItemsCategory(${catJs})" title="Rename category">
                            <i class="fas fa-pen me-1"></i>Rename
                        </button>
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
                    const itemPhotos = normalizeManageItemPhotos(item);
                    const itemPhotosFull = normalizeManageItemPhotosFull(item);
                    const upgradeGroups = normalizeManageItemUpgradeGroups(item);
                    const upgradePhotoTargets = getManageUpgradePhotoTargets(item);
                    const upgradePhotoCount = upgradePhotoTargets.filter(function(target) { return !!target.photo; }).length;
                    const allUpgradeOptions = upgradeGroups.reduce(function(list, group) {
                        return list.concat(group.options || []);
                    }, []);
                    const hasUpgrade = upgradeGroups.some(function(group) { return (group.options || []).length > 0; });
                    const noDescription = !(item.itemDescription || '').trim();
                    const missingMaterial = parseFloat(item.materialCost || 0) <= 0;
                    const detailsId = 'details_' + safeId;
                    const photosBadge = (itemPhotos.length || upgradePhotoCount || upg.photo)
                        ? `<span class="badge text-bg-secondary ms-auto">${itemPhotos.length ? itemPhotos.length + '/3' : '0/3'}${upgradePhotoCount ? ' +' + upgradePhotoCount : ''}</span>`
                        : '';
                    const isDirty = dirtyPricingRows.has(rowKey);
                    const searchBlob = [
                        cat, item.name, item.unitType, item.supplierUrl, item.itemDescription,
                        laborTime.mode, laborTime.unitsPerHour, laborTime.fixedHours,
                        allUpgradeOptions.map(function(option) {
                            return [option.name, option.unitType, option.supplierUrl, option.description, option.sourceItemName, option.category].filter(Boolean).join(' ');
                        }).join(' ')
                    ].filter(Boolean).join(' ').toLowerCase();
                    const rowMeta = `data-row-key="${manageItemsAttr(rowKey)}" data-details-id="${detailsId}" data-search="${manageItemsAttr(searchBlob)}" data-custom="${isCustom ? '1' : '0'}" data-has-upgrade="${hasUpgrade ? '1' : '0'}" data-missing-material="${missingMaterial ? '1' : '0'}" data-no-description="${noDescription ? '1' : '0'}"`;

                    html += `<tr id="row_${safeId}" class="manage-items-row ${isDirty ? 'manage-item-dirty' : ''}" ${rowMeta}>
                        <td data-label="Name">
                            <div class="d-flex align-items-center">
                                <span class="manage-dirty-dot" title="Unsaved row"></span>
                                <input type="text" class="form-control form-control-sm item-name-input" value="${manageItemsAttr(item.name)}" placeholder="Item name" oninput="markPricingDirty(this)">
                            </div>
                            <div class="mt-1 d-flex flex-wrap gap-1 manage-items-portrait-optional manage-items-row-badges" data-manage-portrait-field="badges"><span class="manage-row-margin-target">${renderManageMarginPill(rate, matCost)}</span> ${renderManageLaborPill(laborTime, item.unitType || '')}</div>
                        </td>
                        <td data-label="Unit" class="manage-items-portrait-optional" data-manage-portrait-field="unit">${renderManageUnitSelect(item.unitType || '')}</td>
                        <td data-label="Rate" class="manage-items-portrait-optional" data-manage-portrait-field="rate"><input type="number" class="form-control form-control-sm item-input" value="${rate}" step="0.01" min="0" oninput="markPricingDirty(this); updateManageRowMargin(this)"></td>
                        <td data-label="Mat. Cost" class="manage-items-portrait-optional" data-manage-portrait-field="material"><input type="number" class="form-control form-control-sm item-input" value="${matCost}" step="0.01" min="0" oninput="markPricingDirty(this); updateManageRowMargin(this)"></td>
                        <td data-label="Supplier" class="manage-items-portrait-optional" data-manage-portrait-field="supplier">
                            <div class="input-group input-group-sm">
                                <input type="url" class="form-control item-input" value="${supplier}" placeholder="https://..." oninput="markPricingDirty(this)">
                                <button type="button" class="btn btn-outline-secondary" title="Help with supplier URLs" aria-label="Help with supplier URLs" onclick="if(window.QuoteDrModalHelp){QuoteDrModalHelp.openInline('supplierUrl');} return false;"><i class="fas fa-question"></i></button>
                            </div>
                        </td>
                        <td data-label="Actions" class="manage-items-actions-cell">
                            <div class="manage-item-actions">
                                <div class="btn-group details-section-menu" data-target="${detailsId}">
                                    <button class="btn btn-sm btn-info dropdown-toggle details-menu-btn" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Choose item details to display"><i class="fas fa-sliders-h"></i> Details</button>
                                    <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:210px;">
                                        <div class="small text-muted fw-bold px-1 mb-1">Show for this item</div>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="description"> Description</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="upgrade"> Upgrade Options ${hasUpgrade ? '<span class="badge text-bg-warning ms-auto">set</span>' : ''}</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="labor"> Labor Time ${laborTime.mode ? '<span class="badge text-bg-success ms-auto">set</span>' : ''}</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="supplier-cost"> Supplier / Cost</label>
                                        <label class="dropdown-item d-flex align-items-center gap-2"><input class="form-check-input m-0" type="checkbox" data-detail-section-toggle data-target="${detailsId}" data-section="photos"> Photos ${photosBadge}</label>
                                    </div>
                                </div>
                                <button class="btn btn-sm btn-success item-save-btn" data-cat="${catE}" data-name="${nameE}" title="Save this row"><i class="fas fa-save"></i></button>
                                ${isCustom ? `<button class="btn btn-sm btn-danger item-delete-btn" data-cat="${catE}" data-name="${nameE}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                        </td>
                    </tr>
                    <tr id="${detailsId}" class="item-details-row ${isDirty ? 'manage-item-dirty' : ''}" data-row-key="${manageItemsAttr(rowKey)}" data-cat="${catE}" data-name="${nameE}" style="display:none;">
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
                                                    <input type="number" class="form-control form-control-sm item-detail-material-cost" value="${matCost}" step="0.01" min="0" oninput="syncManageDetailBaseField(this); markPricingDirty(this); updateManageDetailMargin(this)">
                                                </div>
                                                <div class="col-md-9">
                                                    <label class="form-label" style="font-size:0.75em">Supplier URL</label>
                                                    <input type="url" class="form-control form-control-sm item-detail-supplier-url" value="${supplier}" placeholder="https://..." oninput="syncManageDetailBaseField(this); markPricingDirty(this)">
                                                </div>
                                            </div>
                                            <div class="mt-2 manage-detail-margin-target">${renderManageMarginPill(rate, matCost)}</div>
                                        </div>
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="upgrade" style="display:none;">
                                        ${renderManageItemUpgradeGroupsEditor(item, item.unitType || '')}
                                    </div>
                                    <div class="col-12 manage-detail-section" data-detail-section="photos" style="display:none;">
                                        <div class="border rounded p-2 bg-light">
                                            <small class="text-secondary fw-bold"><i class="fas fa-camera"></i> Photos</small>
                                            <div class="mt-2">
                                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                                    <button class="btn btn-sm btn-outline-secondary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="photo" title="Add item photo"><i class="fas fa-camera me-1"></i>${itemPhotos.length >= MANAGE_ITEM_PHOTO_LIMIT ? 'Replace Item Photo' : 'Add Item Photo'} (${itemPhotos.length}/${MANAGE_ITEM_PHOTO_LIMIT})</button>
                                                    <small class="text-muted">Base item photos. Upgrade photos are selected below.</small>
                                                </div>
                                                ${renderManageFullResUpgradeNote()}
                                                <div class="d-flex align-items-start gap-2 mt-2 flex-wrap">
                                                    ${itemPhotos.length ? itemPhotos.map(function(photo, index) {
                                                        return `<div class="manage-item-photo-thumb border rounded p-1 bg-white">
                                                            <img src="${manageItemsAttr(photo)}" data-photo-src="${manageItemsAttr(photo)}" data-full-photo="${manageFullResPhotoDataAttr(itemPhotosFull[index])}" class="rounded d-block" style="width:88px;height:58px;object-fit:cover;cursor:pointer;" onclick="openManageItemPhotoLightbox(this)" title="Click to enlarge">
                                                            <div class="btn-group btn-group-sm mt-1 w-100">
                                                                <button type="button" class="btn btn-outline-primary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="photo" data-photo-index="${index}" title="Replace photo ${index + 1}"><i class="fas fa-sync-alt"></i></button>
                                                                <button type="button" class="btn btn-outline-danger item-photo-remove-btn" data-cat="${catE}" data-name="${nameE}" data-photo-index="${index}" title="Remove photo ${index + 1}"><i class="fas fa-times"></i></button>
                                                            </div>
                                                        </div>`;
                                                    }).join('') : '<small class="text-muted">No item photos yet.</small>'}
                                                </div>
                                            </div>
                                            <div class="mt-3 pt-2 border-top">
                                                <small class="text-secondary fw-bold"><i class="fas fa-images"></i> Upgrade photos</small>
                                                <div class="small text-muted mb-2">Choose the upgrade option you want the photo attached to.</div>
                                                ${renderManageFullResUpgradeNote()}
                                                ${upgradePhotoTargets.length ? `<div class="d-flex flex-column gap-2">
                                                    ${upgradePhotoTargets.map(function(target) {
                                                        const groupIdE = manageItemsAttr(target.groupId);
                                                        const optionIdE = manageItemsAttr(target.optionId);
                                                        const optionNameE = manageItemsEscape(target.optionName);
                                                        const optionTitleE = manageItemsAttr(target.optionName);
                                                        const groupNameE = manageItemsEscape(target.groupName);
                                                        return `<div class="manage-upgrade-photo-target border rounded p-2 bg-white d-flex align-items-center justify-content-between gap-2 flex-wrap">
                                                            <div class="d-flex align-items-center gap-2 min-w-0">
                                                                ${target.photo ? `<img src="${manageItemsAttr(target.photo)}" data-photo-src="${manageItemsAttr(target.photo)}" data-full-photo="${manageFullResPhotoDataAttr(target.photoFull)}" class="rounded border" style="width:70px;height:48px;object-fit:cover;cursor:pointer;" onclick="openManageItemPhotoLightbox(this)" title="Click to enlarge">` : '<span class="badge text-bg-light border text-secondary"><i class="fas fa-camera"></i></span>'}
                                                                <div class="min-w-0">
                                                                    <div class="fw-semibold text-truncate">${optionNameE}</div>
                                                                    <div class="small text-muted text-truncate">${groupNameE}</div>
                                                                </div>
                                                            </div>
                                                            <div class="btn-group btn-group-sm">
                                                                <button type="button" class="btn btn-outline-primary item-photo-btn" data-cat="${catE}" data-name="${nameE}" data-field="upgradePhoto" data-upgrade-group-id="${groupIdE}" data-upgrade-option-id="${optionIdE}" title="${target.photo ? 'Replace' : 'Add'} photo for ${optionTitleE}"><i class="fas fa-camera me-1"></i>${target.photo ? 'Replace' : 'Add'}</button>
                                                                ${target.photo ? `<button type="button" class="btn btn-outline-danger upgrade-photo-remove-btn" data-cat="${catE}" data-name="${nameE}" data-upgrade-group-id="${groupIdE}" data-upgrade-option-id="${optionIdE}" title="Remove photo from ${optionTitleE}"><i class="fas fa-times"></i></button>` : ''}
                                                            </div>
                                                        </div>`;
                                                    }).join('')}
                                                </div>` : '<small class="text-muted">No upgrade options yet. Add upgrades first, then attach photos here.</small>'}
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
            applyManageItemsPortraitFieldSettings();
            filterItemsList();
            applyManageDetailSectionState();
            refreshManageFullResPhotoUpgradeNotes();
            initManageCategorySortable();
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
                if (field === 'unitType') rememberManageUnitType(value);
                saveCustomItems();
                // Also update live pricingDatabase
                const pi = pricingDatabase[category]?.find(i => i.name === name);
                if (pi) pi[field] = value;
                return;
            }
            // For truly built-in items: use overrides
            saveItemOverride(category, name, { [field]: value });
        }

        function collectNewItemUpgrade(baseUnitType) {
            const panel = document.getElementById('newItemUpgradePanel');
            if (panel && panel.style.display === 'none') return null;
            const name = document.getElementById('newItemUpgradeName')?.value.trim() || '';
            if (!name) return null;
            const unitType = document.getElementById('newItemUpgradeUnit')?.value.trim() || baseUnitType || '';
            const rate = parseFloat(document.getElementById('newItemUpgradeRate')?.value || 0) || 0;
            const materialCost = parseFloat(document.getElementById('newItemUpgradeMaterialCost')?.value || 0) || 0;
            const supplierUrl = document.getElementById('newItemUpgradeSupplierUrl')?.value.trim() || '';
            const description = document.getElementById('newItemUpgradeDescription')?.value.trim() || '';
            const upgradeType = normalizeManageUpgradeType(document.getElementById('newItemUpgradeType')?.value);
            return { name, unitType, rate, materialCost, supplierUrl, description, type: upgradeType };
        }

        function collectNewItemUpgradeGroups(baseUnitType) {
            const groups = cloneManageUpgradeGroups(manageNewItemWizardUpgradeGroups || []);
            const upgrade = collectNewItemUpgrade(baseUnitType);
            if (upgrade) {
                groups.push({
                    id: manageUpgradeGroupId('upg'),
                    name: 'Upgrade Options',
                    type: 'single_optional',
                    options: [normalizeManageUpgradeOption(Object.assign({}, upgrade, {
                        id: manageUpgradeGroupId('upo'),
                        upgradeType: upgrade.type
                    }))]
                });
            }
            return normalizeManageItemUpgradeGroups({ upgradeGroups: groups });
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
            const upgrade = collectNewItemUpgrade(unitType);
            const upgradeGroups = collectNewItemUpgradeGroups(unitType);
            if (upgradeGroups.length) newItem.upgradeGroups = upgradeGroups;
            if (upgrade) newItem.upgrade = upgrade;
            customItems[category].push(newItem);
            rememberManageUnitType(unitType);
            if (upgrade && upgrade.unitType) rememberManageUnitType(upgrade.unitType);
            upgradeGroups.forEach(function(group) {
                (group.options || []).forEach(function(option) {
                    if (option.unitType) rememberManageUnitType(option.unitType);
                });
            });
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
            resetNewItemUpgradePanel();
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
                    var itemPhotos = normalizeManageItemPhotos(item);
                    out.push({
                        category: cat,
                        id: 'cgt_' + cat.replace(/[^a-z0-9]/gi, '_') + '_' + item.name.replace(/[^a-z0-9]/gi, '_'),
                        name: item.name,
                        description: item.name,
                        unitType: item.unitType || item.unit || '',
                        rate: parseFloat(item.rate) || 0,
                        materialCost: parseFloat(item.materialCost) || 0,
                        supplierUrl: item.supplierUrl || '',
                        photos: itemPhotos,
                        photo: itemPhotos[0] || item.photo || '',
                        photosFull: normalizeManageItemPhotosFull(item),
                        photoFull: normalizeManageFullResPhotoMeta(item.photoFull),
                        itemDescription: item.itemDescription || item.description || '',
                        laborTime: normalizeManageLaborTime(item.laborTime),
                        upgrade: item.upgrade ? JSON.parse(JSON.stringify(item.upgrade)) : null,
                        upgradeGroups: normalizeManageItemUpgradeGroups(item),
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

        function choiceGroupEnhancementId(prefix) {
            return (prefix || 'cge') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }

        function normalizeChoiceGroupEnhancementOption(option, fallbackIndex) {
            option = option || {};
            return {
                id: option.id || choiceGroupEnhancementId('cgeo_' + (fallbackIndex || 0)),
                name: option.name || option.sourceItemName || option.description || 'Enhancement',
                category: option.category || '',
                sourceItemName: option.sourceItemName || option.name || '',
                unitType: option.unitType || option.unit || '',
                rate: parseFloat(option.rate) || 0,
                materialCost: parseFloat(option.materialCost) || 0,
                supplierUrl: option.supplierUrl || '',
                photo: option.photo || '',
                photoFull: normalizeManageFullResPhotoMeta(option.photoFull),
                description: option.description || option.itemDescription || option.name || '',
                itemDescription: option.itemDescription || option.description || '',
                laborTime: normalizeManageLaborTime(option.laborTime),
                upgradeType: option.upgradeType === 'replacement' ? 'replacement' : 'add_on',
                allowedBaseOptionIds: Array.isArray(option.allowedBaseOptionIds) ? option.allowedBaseOptionIds.filter(Boolean) : [],
                blockedByEnhancementOptionIds: Array.isArray(option.blockedByEnhancementOptionIds) ? option.blockedByEnhancementOptionIds.filter(Boolean) : []
            };
        }

        function normalizeChoiceGroupEnhancementGroup(group, fallbackIndex) {
            group = group || {};
            return {
                id: group.id || choiceGroupEnhancementId('cgeg_' + (fallbackIndex || 0)),
                name: group.name || 'Enhancements',
                type: group.type === 'multiple' ? 'multiple' : 'single_optional',
                selectedOptionIds: Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds.filter(Boolean) : [],
                options: Array.isArray(group.options) ? group.options.map(normalizeChoiceGroupEnhancementOption) : []
            };
        }

        function normalizeChoiceGroupEnhancementGroups(groups) {
            return Array.isArray(groups) ? groups.map(normalizeChoiceGroupEnhancementGroup).filter(function(group) {
                return group && Array.isArray(group.options);
            }) : [];
        }

        function savedItemToChoiceGroupEnhancementOption(item) {
            item = item || {};
            return normalizeChoiceGroupEnhancementOption({
                id: choiceGroupEnhancementId('cgeo'),
                name: item.name || item.description || 'Enhancement',
                category: item.category || '',
                sourceItemName: item.name || item.description || '',
                unitType: item.unitType || item.unit || '',
                rate: parseFloat(item.rate) || 0,
                materialCost: parseFloat(item.materialCost) || 0,
                supplierUrl: item.supplierUrl || '',
                photo: item.photo || '',
                photoFull: normalizeManageFullResPhotoMeta(item.photoFull),
                description: item.itemDescription || item.description || item.name || '',
                itemDescription: item.itemDescription || item.description || '',
                laborTime: normalizeManageLaborTime(item.laborTime),
                upgradeType: 'add_on',
                allowedBaseOptionIds: [],
                blockedByEnhancementOptionIds: []
            });
        }

        function openChoiceGroupItemPicker(candidates, initialQuery, initialSelectedIds, initialAutoGroup, pickerOptions) {
            return new Promise(function(resolve) {
                pickerOptions = pickerOptions || {};
                var minSelected = pickerOptions.minSelected || 2;
                var showAutoGroup = pickerOptions.showAutoGroup !== false;
                var useLabel = pickerOptions.useLabel || 'Use Selected Items';
                var helperText = pickerOptions.helperText || 'Click saved items below to include them in this choice group.';
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
                    '<div class="small text-muted">' + itemHtmlEscape(helperText) + '</div>' +
                    '<span id="choiceGroupSelectedCount" class="badge bg-secondary">0 selected</span>' +
                    '</div>' +
                    (showAutoGroup ? '<div class="form-check form-switch border rounded bg-light px-5 py-2 mb-2">' +
                    '<input class="form-check-input" type="checkbox" id="choiceGroupAutoGroupCheckbox" checked>' +
                    '<label class="form-check-label fw-semibold" for="choiceGroupAutoGroupCheckbox">Always use grouping when any of these items are added to a quote</label>' +
                    '<div class="small text-muted">When this is on, QuoteDr automatically shows the full option group if one of these saved items lands on a quote.</div>' +
                    '</div>' : '') +
                    '<div id="choiceGroupItemPickerList" style="max-height:55vh;overflow:auto;"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
                    '<button type="button" class="btn btn-primary" id="choiceGroupUseSelectedBtn" disabled><i class="fas fa-check me-1"></i>' + itemHtmlEscape(useLabel) + '</button>' +
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
                    useBtn.disabled = selected.size < minSelected;
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
                    if (selected.size < minSelected) return;
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
                enhancementGroups: [],
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
                enhancementGroups: normalizeChoiceGroupEnhancementGroups(group.enhancementGroups),
                options: picked
            };
            saveCustomItems(true);
            renderAllItemsList();
        }

        function renderChoiceGroupEnhancementsEditor(modalEl, groupIndex) {
            var store = getChoiceGroupTemplateStore();
            var group = store[groupIndex];
            if (!group) return;
            group.enhancementGroups = normalizeChoiceGroupEnhancementGroups(group.enhancementGroups);
            var baseOptions = Array.isArray(group.options) ? group.options : [];
            var bodyEl = modalEl.querySelector('#choiceGroupEnhancementsBody');
            if (!bodyEl) return;
            var allEnhancementOptions = [];
            group.enhancementGroups.forEach(function(enhGroup) {
                (enhGroup.options || []).forEach(function(option) {
                    allEnhancementOptions.push({
                        groupId: enhGroup.id,
                        optionId: option.id,
                        label: (enhGroup.name || 'Enhancement') + ': ' + (option.name || 'Option')
                    });
                });
            });

            var html = '<div class="alert alert-light border mb-3">' +
                '<div class="fw-bold mb-1">Base Options</div>' +
                '<div class="small text-muted mb-2">Enhancements appear under these client choices on the quote.</div>' +
                '<div class="d-flex gap-1 flex-wrap">' + baseOptions.map(function(option) {
                    return '<span class="badge bg-light text-dark border">' + itemHtmlEscape(option.name || option.description || 'Option') + '</span>';
                }).join('') + '</div>' +
                '</div>';

            if (!group.enhancementGroups.length) {
                html += '<div class="alert alert-info">No enhancements yet. Add a group like <strong>Drink Rail</strong> or <strong>Post Caps</strong>, then choose saved items for its options.</div>';
            }

            group.enhancementGroups.forEach(function(enhGroup, groupIdx) {
                html += '<section class="border rounded mb-3 overflow-hidden" data-enhancement-group="' + groupIdx + '">' +
                    '<div class="d-flex align-items-center justify-content-between gap-2 p-3" style="background:#eef4ff;">' +
                    '<div><div class="fw-bold"><i class="fas fa-wand-magic-sparkles me-1 text-primary"></i>' + itemHtmlEscape(enhGroup.name || 'Enhancements') + '</div>' +
                    '<div class="small text-muted">' + (enhGroup.type === 'multiple' ? 'Pick Multiple' : 'Pick One Optional') + ' - ' + (enhGroup.options || []).length + ' options</div></div>' +
                    '<div class="d-flex gap-1 flex-wrap">' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" data-enhancement-action="add-options" data-enhancement-group-index="' + groupIdx + '"><i class="fas fa-plus me-1"></i>Add Options</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" data-enhancement-action="delete-group" data-enhancement-group-index="' + groupIdx + '"><i class="fas fa-trash me-1"></i>Delete</button>' +
                    '</div>' +
                    '</div>' +
                    '<div class="p-3">';
                if (!(enhGroup.options || []).length) {
                    html += '<div class="small text-muted">No options in this enhancement group yet.</div>';
                }
                (enhGroup.options || []).forEach(function(option, optIdx) {
                    var allowed = Array.isArray(option.allowedBaseOptionIds) ? option.allowedBaseOptionIds : [];
                    var blocked = Array.isArray(option.blockedByEnhancementOptionIds) ? option.blockedByEnhancementOptionIds : [];
                    html += '<div class="border rounded p-3 mb-2 bg-white" data-enhancement-option="' + optIdx + '">' +
                        '<div class="d-flex justify-content-between gap-2 flex-wrap mb-2">' +
                        '<div><div class="fw-bold">' + itemHtmlEscape(option.name || 'Enhancement') + '</div>' +
                        '<div class="small text-muted">' + itemHtmlEscape(option.category || 'Saved Item') + ' - $' + (parseFloat(option.rate) || 0).toFixed(2) + '/' + itemHtmlEscape(option.unitType || 'unit') + '</div></div>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" data-enhancement-action="delete-option" data-enhancement-group-index="' + groupIdx + '" data-enhancement-option-index="' + optIdx + '"><i class="fas fa-trash me-1"></i>Remove</button>' +
                        '</div>' +
                        '<div class="row g-2">' +
                        '<div class="col-md-3"><label class="form-label small fw-bold">Upgrade Type</label>' +
                        '<select class="form-select form-select-sm" data-enhancement-field="upgradeType" data-enhancement-group-index="' + groupIdx + '" data-enhancement-option-index="' + optIdx + '">' +
                        '<option value="add_on"' + (option.upgradeType !== 'replacement' ? ' selected' : '') + '>Add-on</option>' +
                        '<option value="replacement"' + (option.upgradeType === 'replacement' ? ' selected' : '') + '>Replacement</option>' +
                        '</select></div>' +
                        '<div class="col-md-4"><label class="form-label small fw-bold">Available With</label>' +
                        '<div class="border rounded p-2" style="max-height:120px;overflow:auto;">' +
                        '<label class="d-block small"><input type="checkbox" data-enhancement-all-base="' + groupIdx + '_' + optIdx + '"' + (!allowed.length ? ' checked' : '') + '> All base options</label>' +
                        baseOptions.map(function(base) {
                            var checked = allowed.indexOf(base.id) !== -1;
                            return '<label class="d-block small"><input type="checkbox" data-enhancement-base-option="' + itemHtmlEscape(base.id) + '" data-enhancement-group-index="' + groupIdx + '" data-enhancement-option-index="' + optIdx + '"' + (checked ? ' checked' : '') + '> ' + itemHtmlEscape(base.name || base.description || 'Option') + '</label>';
                        }).join('') +
                        '</div></div>' +
                        '<div class="col-md-5"><label class="form-label small fw-bold">Blocked By</label>' +
                        '<div class="border rounded p-2" style="max-height:120px;overflow:auto;">' +
                        (allEnhancementOptions.filter(function(other) { return other.optionId !== option.id; }).map(function(other) {
                            var checked = blocked.indexOf(other.optionId) !== -1;
                            return '<label class="d-block small"><input type="checkbox" data-enhancement-blocked-by="' + itemHtmlEscape(other.optionId) + '" data-enhancement-group-index="' + groupIdx + '" data-enhancement-option-index="' + optIdx + '"' + (checked ? ' checked' : '') + '> ' + itemHtmlEscape(other.label) + '</label>';
                        }).join('') || '<div class="small text-muted">No other enhancement options yet.</div>') +
                        '</div></div>' +
                        '</div>' +
                        '</div>';
                });
                html += '</div></section>';
            });
            bodyEl.innerHTML = html;
        }

        async function addChoiceGroupEnhancementGroup(groupIndex, modalEl) {
            var store = getChoiceGroupTemplateStore();
            var group = store[groupIndex];
            if (!group) return;
            var name = (await qdPrompt('Name this enhancement group:', 'Drink Rail', { title: 'New Enhancement Group' }) || '').trim();
            if (!name) return;
            var type = await qdConfirm('Can the client pick more than one enhancement in this group?', {
                title: 'Enhancement Type',
                okText: 'Pick Multiple',
                cancelText: 'Pick One Optional'
            }) ? 'multiple' : 'single_optional';
            var picked = await openChoiceGroupItemPicker(flattenChoiceGroupCandidateItems(), name, [], false, {
                minSelected: 1,
                showAutoGroup: false,
                useLabel: 'Use As Enhancements',
                helperText: 'Choose saved items that should appear as optional enhancements for this group.'
            });
            if (!picked || !picked.length) return;
            pushUndoState();
            group.enhancementGroups = normalizeChoiceGroupEnhancementGroups(group.enhancementGroups);
            group.enhancementGroups.push({
                id: choiceGroupEnhancementId('cgeg'),
                name: name,
                type: type,
                selectedOptionIds: [],
                options: picked.map(savedItemToChoiceGroupEnhancementOption)
            });
            saveCustomItems(true);
            renderChoiceGroupEnhancementsEditor(modalEl, groupIndex);
        }

        async function addOptionsToChoiceGroupEnhancement(groupIndex, enhancementGroupIndex, modalEl) {
            var store = getChoiceGroupTemplateStore();
            var group = store[groupIndex];
            var enhancementGroup = group && group.enhancementGroups && group.enhancementGroups[enhancementGroupIndex];
            if (!enhancementGroup) return;
            var picked = await openChoiceGroupItemPicker(flattenChoiceGroupCandidateItems(), enhancementGroup.name || '', [], false, {
                minSelected: 1,
                showAutoGroup: false,
                useLabel: 'Add Enhancement Options',
                helperText: 'Choose saved items to add to this enhancement group.'
            });
            if (!picked || !picked.length) return;
            pushUndoState();
            enhancementGroup.options = (enhancementGroup.options || []).concat(picked.map(savedItemToChoiceGroupEnhancementOption));
            group.enhancementGroups = normalizeChoiceGroupEnhancementGroups(group.enhancementGroups);
            saveCustomItems(true);
            renderChoiceGroupEnhancementsEditor(modalEl, groupIndex);
        }

        function openChoiceGroupEnhancementsModal(groupIndex) {
            var store = getChoiceGroupTemplateStore();
            var group = store[groupIndex];
            if (!group) return;
            var existing = document.getElementById('choiceGroupEnhancementsModal');
            if (existing) existing.remove();
            group.enhancementGroups = normalizeChoiceGroupEnhancementGroups(group.enhancementGroups);
            var modalHtml = '' +
                '<div class="modal fade" id="choiceGroupEnhancementsModal" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                '<div class="modal-header bg-primary text-white">' +
                '<h5 class="modal-title"><i class="fas fa-wand-magic-sparkles me-2"></i>Enhancements - ' + itemHtmlEscape(group.name || 'Choice Group') + '</h5>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' +
                '<div class="d-flex justify-content-between align-items-center gap-2 mb-3 flex-wrap">' +
                '<div class="text-muted">Add optional client upgrades that appear under this Choice Group. Use <strong>Available With</strong> and <strong>Blocked By</strong> to keep invalid combinations out of the quote.</div>' +
                '<button type="button" class="btn btn-primary" id="newChoiceGroupEnhancementBtn"><i class="fas fa-plus me-1"></i>New Enhancement Group</button>' +
                '</div>' +
                '<div id="choiceGroupEnhancementsBody"></div>' +
                '</div>' +
                '<div class="modal-footer">' +
                '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Done</button>' +
                '</div>' +
                '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            var modalEl = document.getElementById('choiceGroupEnhancementsModal');
            renderChoiceGroupEnhancementsEditor(modalEl, groupIndex);
            document.getElementById('newChoiceGroupEnhancementBtn').addEventListener('click', function() {
                addChoiceGroupEnhancementGroup(groupIndex, modalEl);
            });
            modalEl.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-enhancement-action]');
                if (!btn) return;
                var action = btn.getAttribute('data-enhancement-action');
                var enhancementGroupIndex = parseInt(btn.getAttribute('data-enhancement-group-index'), 10);
                var optionIndex = parseInt(btn.getAttribute('data-enhancement-option-index'), 10);
                var currentGroup = getChoiceGroupTemplateStore()[groupIndex];
                if (!currentGroup || !currentGroup.enhancementGroups) return;
                if (action === 'add-options') {
                    addOptionsToChoiceGroupEnhancement(groupIndex, enhancementGroupIndex, modalEl);
                    return;
                }
                pushUndoState();
                if (action === 'delete-group') {
                    currentGroup.enhancementGroups.splice(enhancementGroupIndex, 1);
                } else if (action === 'delete-option' && currentGroup.enhancementGroups[enhancementGroupIndex]) {
                    currentGroup.enhancementGroups[enhancementGroupIndex].options.splice(optionIndex, 1);
                }
                currentGroup.enhancementGroups = normalizeChoiceGroupEnhancementGroups(currentGroup.enhancementGroups);
                saveCustomItems(true);
                renderChoiceGroupEnhancementsEditor(modalEl, groupIndex);
            });
            modalEl.addEventListener('change', function(e) {
                var currentGroup = getChoiceGroupTemplateStore()[groupIndex];
                if (!currentGroup || !currentGroup.enhancementGroups) return;
                var groupIdx = parseInt(e.target.getAttribute('data-enhancement-group-index'), 10);
                var optIdx = parseInt(e.target.getAttribute('data-enhancement-option-index'), 10);
                var enhancementOption = currentGroup.enhancementGroups[groupIdx] && currentGroup.enhancementGroups[groupIdx].options[optIdx];
                if (!enhancementOption) return;
                pushUndoState();
                if (e.target.matches('[data-enhancement-field="upgradeType"]')) {
                    enhancementOption.upgradeType = e.target.value === 'replacement' ? 'replacement' : 'add_on';
                } else if (e.target.matches('[data-enhancement-all-base]')) {
                    enhancementOption.allowedBaseOptionIds = e.target.checked ? [] : (Array.isArray(currentGroup.options) && currentGroup.options[0] ? [currentGroup.options[0].id] : []);
                } else if (e.target.matches('[data-enhancement-base-option]')) {
                    var baseIds = Array.from(modalEl.querySelectorAll('[data-enhancement-base-option][data-enhancement-group-index="' + groupIdx + '"][data-enhancement-option-index="' + optIdx + '"]:checked')).map(function(input) {
                        return input.getAttribute('data-enhancement-base-option');
                    }).filter(Boolean);
                    enhancementOption.allowedBaseOptionIds = baseIds;
                } else if (e.target.matches('[data-enhancement-blocked-by]')) {
                    var blockedIds = Array.from(modalEl.querySelectorAll('[data-enhancement-blocked-by][data-enhancement-group-index="' + groupIdx + '"][data-enhancement-option-index="' + optIdx + '"]:checked')).map(function(input) {
                        return input.getAttribute('data-enhancement-blocked-by');
                    }).filter(Boolean);
                    enhancementOption.blockedByEnhancementOptionIds = blockedIds;
                }
                currentGroup.enhancementGroups = normalizeChoiceGroupEnhancementGroups(currentGroup.enhancementGroups);
                saveCustomItems(true);
                renderChoiceGroupEnhancementsEditor(modalEl, groupIndex);
            });
            modalEl.addEventListener('hidden.bs.modal', function() {
                if (document.body.contains(modalEl)) modalEl.remove();
                renderAllItemsList();
            }, { once: true });
            new bootstrap.Modal(modalEl).show();
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
                var enhancementCount = normalizeChoiceGroupEnhancementGroups(group.enhancementGroups).reduce(function(total, enhGroup) {
                    return total + (Array.isArray(enhGroup.options) ? enhGroup.options.length : 0);
                }, 0);
                return '<div class="border rounded p-3 mb-2 bg-white" data-choice-group-template="' + index + '">' +
                    '<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">' +
                    '<div class="flex-grow-1">' +
                    '<div class="fw-bold"><i class="fas fa-layer-group me-1 text-primary"></i>' + itemHtmlEscape(group.name || 'Choice Group') + '</div>' +
                    '<div class="small text-muted">' + itemHtmlEscape(group.type === 'multiple' ? 'Pick Multiple' : 'Pick One') + ' - ' + options.length + ' options</div>' +
                    '<div class="small mt-1">' + itemHtmlEscape(optionNames || 'No options') + '</div>' +
                    '<div class="small text-muted mt-1"><i class="fas fa-wand-magic-sparkles me-1"></i>' + enhancementCount + ' enhancements</div>' +
                    '</div>' +
                    '<div class="d-flex gap-1 flex-wrap">' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" data-choice-group-template-action="edit" data-choice-group-template-index="' + index + '"><i class="fas fa-pen me-1"></i>Edit</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" data-choice-group-template-action="enhancements" data-choice-group-template-index="' + index + '"><i class="fas fa-wand-magic-sparkles me-1"></i>Enhancements</button>' +
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

        function openChoiceGroupHelpModal() {
            var existing = document.getElementById('choiceGroupHelpModal');
            if (existing) existing.remove();
            var modalHtml = '' +
                '<div class="modal fade" id="choiceGroupHelpModal" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                '<div class="modal-header bg-primary text-white">' +
                '<h5 class="modal-title"><i class="fas fa-question-circle me-2"></i>How Choice Groups Work</h5>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' +
                '<p class="mb-3">Choice Groups turn a set of saved line items into client-facing options. They are useful when the client should choose between materials, finishes, upgrades, or add-ons without you rebuilding the quote every time.</p>' +
                '<div class="border rounded p-3 mb-3 bg-light">' +
                '<div class="fw-bold mb-1">Example: flooring options</div>' +
                '<div class="small">Create one group with Laminate Installation, Vinyl Plank Installation, and Hardwood Flooring Installation. When that group is on a quote, the client sees the available options and the quote total updates from their selection.</div>' +
                '</div>' +
                '<h6 class="fw-bold">Pick One</h6>' +
                '<p class="mb-3">Use Pick One when the client should choose only one option, like laminate versus vinyl versus hardwood. You choose a default/base option when creating the group, and you can still switch which option is selected inside the quote builder.</p>' +
                '<h6 class="fw-bold">Pick Multiple</h6>' +
                '<p class="mb-3">Use Pick Multiple when the client can choose more than one item, like baseboards, shoe molding, and crown molding. Each selected option can add to the quote total.</p>' +
                '<h6 class="fw-bold">Always use grouping</h6>' +
                '<p class="mb-3">When this is turned on for a saved group, QuoteDr can automatically use the group when one of its saved items is added to a quote. This works for normal Add Item flows and AI Voice items after they land in the quote flow.</p>' +
                '<h6 class="fw-bold">Turning grouping off for one quote</h6>' +
                '<p class="mb-3">If a group appears on a quote but you only want a normal line item for that job, use the Turn Off Grouping button on the quote row. That changes only that quote line and does not change the saved group.</p>' +
                '<h6 class="fw-bold">Managing groups</h6>' +
                '<p class="mb-0">Use New Choice Group to create a group from saved items. Existing groups can be edited, renamed, or deleted here. Deleting a saved group does not delete the original saved line items.</p>' +
                '</div>' +
                '<div class="modal-footer">' +
                '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it</button>' +
                '</div>' +
                '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            var modalEl = document.getElementById('choiceGroupHelpModal');
            modalEl.addEventListener('hidden.bs.modal', function() {
                if (document.body.contains(modalEl)) modalEl.remove();
            }, { once: true });
            new bootstrap.Modal(modalEl).show();
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
                '<div class="d-flex align-items-center gap-2 ms-auto">' +
                '<button type="button" class="btn btn-sm btn-light text-primary fw-semibold" id="choiceGroupTemplateHelpBtn" onclick="openChoiceGroupHelpModal(); return false;"><i class="fas fa-question-circle me-1"></i>Help</button>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
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
                if (action === 'enhancements') {
                    modalEl.addEventListener('hidden.bs.modal', function() {
                        modalEl.remove();
                        openChoiceGroupEnhancementsModal(index);
                    }, { once: true });
                    bootstrap.Modal.getInstance(modalEl).hide();
                }
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
        window.renameManageItemsCategory = renameManageItemsCategory;
        window.renameSelectedCategory = renameSelectedCategory;
        window.addNewUnitType = addNewUnitType;
        window.handleCategoryChange = handleCategoryChange;
        window.handleItemPhotoUpload = handleItemPhotoUpload;
        window.normalizeManageItemPhotos = normalizeManageItemPhotos;
        window.normalizeManageItemPhotosFull = normalizeManageItemPhotosFull;
        window.syncManageItemPhotoCompatibility = syncManageItemPhotoCompatibility;
        window.getManageFullResPhotoUsageBytes = getManageFullResPhotoUsageBytes;
        window.canAddManageFullResPhotoBytes = canAddManageFullResPhotoBytes;
        window.shouldPromptManageItemPhotoReplacement = shouldPromptManageItemPhotoReplacement;
        window.openManageItemPhotoReplacePicker = openManageItemPhotoReplacePicker;
        window.removeManageItemPhoto = removeManageItemPhoto;
        window.setManageItemDetailSectionOpen = setManageItemDetailSectionOpen;
        window.setManageItemDetailSectionOpenFromToggle = setManageItemDetailSectionOpenFromToggle;
        window.applyManageDetailSectionState = applyManageDetailSectionState;
        window.openManageItemsModal = openManageItemsModal;
        window.closeManageItemsModal = closeManageItemsModal;
        window.pushUndoState = pushUndoState;
        window.undoManageItems = undoManageItems;
        window.syncManageItemsUndoButtons = syncManageItemsUndoButtons;
        window.toggleManageItemsTopBar = toggleManageItemsTopBar;
        window.toggleManageItemsBottomBar = toggleManageItemsBottomBar;
        window.toggleManageNewItemPanel = toggleManageNewItemPanel;
        window.toggleNewItemUpgradePanel = toggleNewItemUpgradePanel;
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
        window.openManageCategoryOrganizeMenu = openManageCategoryOrganizeMenu;
        window.setManageItemsCategoryOrderMode = setManageItemsCategoryOrderMode;
        window.applyManageItemsPortraitFieldSettings = applyManageItemsPortraitFieldSettings;
        window.filterItemsList = filterItemsList;
        window.renderAllItemsList = renderAllItemsList;
        window.saveItemFieldEdit = saveItemFieldEdit;
        window.handleManageUnitTypeChange = handleManageUnitTypeChange;
        window.syncManageDetailBaseField = syncManageDetailBaseField;
        window.updateManageRowMargin = updateManageRowMargin;
        window.updateManageDetailMargin = updateManageDetailMargin;
        window.normalizeManageItemUpgradeGroups = normalizeManageItemUpgradeGroups;
        window.renderManageItemUpgradeGroupsEditor = renderManageItemUpgradeGroupsEditor;
        window.collectManageItemUpgradeGroups = collectManageItemUpgradeGroups;
        window.manageFullResPhotoUrl = manageFullResPhotoUrl;
        window.openManageItemPhotoLightbox = openManageItemPhotoLightbox;
        window.getManageUpgradePhotoTargets = getManageUpgradePhotoTargets;
        window.setManageUpgradeOptionPhotoFull = setManageUpgradeOptionPhotoFull;
        window.removeManageUpgradePhoto = removeManageUpgradePhoto;
        window.handleManageUpgradeGroupAction = handleManageUpgradeGroupAction;
        window.handleManageUpgradeGroupTypeChange = handleManageUpgradeGroupTypeChange;
        window.openManageUpgradeWizard = openManageUpgradeWizard;
        window.openManageNewItemUpgradeWizard = openManageNewItemUpgradeWizard;
        window.renderManageUpgradeWizardModal = renderManageUpgradeWizardModal;
        window.hydrateManageUpgradeWizardFromGroup = hydrateManageUpgradeWizardFromGroup;
        window.saveManageUpgradeWizard = saveManageUpgradeWizard;
        window.handleManageUpgradeWizardAction = handleManageUpgradeWizardAction;
        window.handleManageUpgradePathSelectChange = handleManageUpgradePathSelectChange;
        window.handleManageUpgradeQuantityModeChange = handleManageUpgradeQuantityModeChange;
        window.refreshManageUpgradeQuantityControls = refreshManageUpgradeQuantityControls;
        window.fillManageUpgradeOptionFromSource = fillManageUpgradeOptionFromSource;
        window.addCustomItem = addCustomItem;
        window.openChoiceGroupHelpModal = openChoiceGroupHelpModal;
        window.openChoiceGroupTemplateModal = openChoiceGroupTemplateModal;
        window.openChoiceGroupEnhancementsModal = openChoiceGroupEnhancementsModal;
        window.openChoiceGroupDefaultOptionPicker = openChoiceGroupDefaultOptionPicker;
        window.openChoiceGroupTypePicker = openChoiceGroupTypePicker;
        window.suggestChoiceGroupTemplates = suggestChoiceGroupTemplates;
        window.refineDescription = refineDescription;
        window.toggleRefinedDescription = toggleRefinedDescription;
        window.deleteCustomItem = deleteCustomItem;
})();
