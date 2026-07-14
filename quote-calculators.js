// Quote Dr quick room quoter and calculator helpers.
// Extracted from quote-builder.html so the quote builder shell stays easier to maintain.

        function calcIsMetric() {
            return typeof getMeasurementSystem === 'function' && getMeasurementSystem() === 'metric';
        }

        function calcAreaUnit() {
            return calcIsMetric() ? 'm\u00b2' : 'sqft';
        }

        function calcLengthUnit() {
            return calcIsMetric() ? 'm' : 'LF';
        }

        function calcHeightUnit() {
            return calcIsMetric() ? 'm' : 'ft';
        }

        function calcFormatQuantity(value, unit) {
            if (typeof qdFormatQuantity === 'function') return qdFormatQuantity(value, unit);
            return (parseFloat(value) || 0).toLocaleString() + ' ' + unit;
        }

        function calcPercentInput(id, fallback) {
            var el = document.getElementById(id);
            var value = el ? parseFloat(el.value) : fallback;
            if (!Number.isFinite(value)) value = fallback;
            return Math.max(0, Math.min(50, value));
        }

        function calcDoorAreaDeduction() {
            return calcIsMetric() ? 1.86 : 20;
        }

        function calcWindowAreaDeduction() {
            return calcIsMetric() ? 1.39 : 15;
        }

        function calcDoorCasingLength() {
            return calcIsMetric() ? 10.67 : 35;
        }

        function calcWindowCasingLength() {
            return calcIsMetric() ? 5.49 : 18;
        }

        function applyCalculatorMeasurementLabels() {
            var area = calcAreaUnit();
            var height = calcHeightUnit();
            [
                ['hardwoodWidth', 'Width (' + height + ')'],
                ['hardwoodLength', 'Length (' + height + ')'],
                ['hardwoodTotalSqft', 'Total ' + area],
                ['hardwoodSqftPerBox', area + ' per Box'],
                ['paintWidth', 'Width (' + height + ')'],
                ['paintLength', 'Length (' + height + ')'],
                ['paintHeight', 'Ceiling Height (' + height + ')'],
                ['paintWallSqft', 'Wall ' + area],
                ['paintCeilingSqft', 'Ceiling ' + area + ' (optional)'],
                ['paintCoverage', 'Coverage per Gallon (' + area + ')'],
                ['hardwoodScanSqft', 'Total ' + area + ' (scanned)'],
                ['paintScanSqft', 'Total ' + area + ' (scanned)'],
                ['drywallScanSqft', 'Total ' + area + ' (scanned)'],
                ['drywallWidth', 'Width (' + height + ')'],
                ['drywallLength', 'Length (' + height + ')'],
                ['drywallHeight', 'Ceiling Height (' + height + ')'],
                ['drywallWallSqft', 'Wall ' + area],
                ['drywallCeilingSqft', 'Ceiling ' + area + ' (optional)']
            ].forEach(function(pair) {
                var label = document.querySelector('label[for="' + pair[0] + '"]');
                if (label) label.textContent = pair[1];
            });
            var hardwoodToggle = document.querySelector('label[for="hardwoodToggleDimensions"]');
            var paintToggle = document.querySelector('label[for="paintToggleDimensions"]');
            var drywallToggle = document.querySelector('label[for="drywallToggleDimensions"]');
            if (hardwoodToggle) hardwoodToggle.textContent = 'Enter Dimensions (' + height + ') instead of Total ' + area;
            if (paintToggle) paintToggle.textContent = 'Enter room dimensions instead of ' + area;
            if (drywallToggle) drywallToggle.textContent = 'Enter room dimensions instead of ' + area;
            var plankLabel = document.querySelector('label[for="hardwoodPlankWidth"]');
            var plankSelect = document.getElementById('hardwoodPlankWidth');
            if (plankLabel && plankSelect) {
                plankLabel.textContent = calcIsMetric() ? 'Plank Width (mm)' : 'Plank Width (inches)';
                var plankOptions = calcIsMetric()
                    ? [['76', '76 mm'], ['102', '102 mm'], ['127', '127 mm'], ['152', '152 mm'], ['178', '178 mm'], ['203', '203 mm']]
                    : [['3', '3 inches'], ['4', '4 inches'], ['5', '5 inches'], ['6', '6 inches'], ['7', '7 inches'], ['8', '8 inches']];
                plankSelect.innerHTML = plankOptions.map(function(option, index) {
                    return '<option value="' + option[0] + '"' + (index === 1 ? ' selected' : '') + '>' + option[1] + '</option>';
                }).join('');
            }
            ['hardwoodTotalSqft','paintWallSqft','paintCeilingSqft','drywallWallSqft','drywallCeilingSqft'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.placeholder = area;
            });
            [
                ['estWidth', 'Width (' + height + ')'],
                ['estLength', 'Length (' + height + ')']
            ].forEach(function(pair) {
                var input = document.getElementById(pair[0]);
                var label = input && input.closest('div') ? input.closest('div').querySelector('label') : null;
                if (label) label.textContent = pair[1];
            });
            var ceilingOptions = calcIsMetric()
                ? [['ceil8', '2.4 m', '2.4'], ['ceil9', '2.7 m', '2.7'], ['ceil10', '3.0 m', '3.0']]
                : [['ceil8', '8 ft', '8'], ['ceil9', '9 ft', '9'], ['ceil10', '10 ft', '10']];
            ceilingOptions.forEach(function(option) {
                var input = document.getElementById(option[0]);
                var label = document.querySelector('label[for="' + option[0] + '"]');
                if (input) input.value = option[2];
                if (label) label.textContent = option[1];
            });
            var customCeiling = document.getElementById('estCeilingCustom');
            if (customCeiling) customCeiling.placeholder = height;
            var doorsText = document.getElementById('estDoors') && document.getElementById('estDoors').parentElement ? document.getElementById('estDoors').parentElement.querySelector('.form-text') : null;
            var windowsText = document.getElementById('estWindows') && document.getElementById('estWindows').parentElement ? document.getElementById('estWindows').parentElement.querySelector('.form-text') : null;
            if (doorsText) doorsText.textContent = 'Each door adds ' + calcDoorCasingLength().toFixed(calcIsMetric() ? 2 : 0) + ' ' + calcLengthUnit() + ' of casing trim';
            if (windowsText) windowsText.textContent = 'Each window adds ' + calcWindowCasingLength().toFixed(calcIsMetric() ? 2 : 0) + ' ' + calcLengthUnit() + ' of casing trim';
        }

        // -- Quick Room Quoter ----------------------------------------------

        var EST_FIELDS = [
            { key: 'flooring',     label: 'Flooring',       unit: 'sqft', defaultRate: 0 },
            { key: 'ceilingPaint', label: 'Ceiling Paint',  unit: 'sqft', defaultRate: 0 },
            { key: 'wallPaint',    label: 'Wall Paint',     unit: 'sqft', defaultRate: 0 },
            { key: 'drywall',      label: 'Drywall',        unit: 'sqft', defaultRate: 0 },
            { key: 'baseboard',    label: 'Baseboard',      unit: 'LF',   defaultRate: 0 },
            { key: 'crownMolding', label: 'Crown Molding',  unit: 'LF',   defaultRate: 0 },
            { key: 'framing',      label: 'Framing',        unit: 'LF',   defaultRate: 0 },
            { key: 'doorCasing',   label: 'Door Casing',    unit: 'LF',   defaultRate: 0 },
            { key: 'windowCasing', label: 'Window Casing',  unit: 'LF',   defaultRate: 0 },
        ];

        function loadEstimatorPricing() {
            return JSON.parse(localStorage.getItem('ald_estimator_pricing') || '{}');
        }

        function isEstimatorFieldEnabled(pricing, key) {
            var saved = pricing && pricing[key] ? pricing[key] : null;
            return !saved || saved.enabled !== false;
        }

        var _estimatorPricingItems = [];

        function calcEscapeHtml(value) {
            return String(value === undefined || value === null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getEstimatorCustomItems() {
            try {
                return (typeof customItems !== 'undefined' && customItems && typeof customItems === 'object') ? customItems : {};
            } catch(e) {
                return {};
            }
        }

        function getEstimatorLocalStorageItems() {
            try {
                var parsed = JSON.parse(localStorage.getItem('ald_custom_items') || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch(e) {
                return {};
            }
        }

        function getEstimatorPricingDatabaseItems() {
            try {
                return (typeof pricingDatabase !== 'undefined' && pricingDatabase && typeof pricingDatabase === 'object') ? pricingDatabase : {};
            } catch(e) {
                return {};
            }
        }

        function addEstimatorPricingItem(items, seen, category, item, sourceLabel) {
            var rate = parseFloat(item && item.rate) || 0;
            var name = item.name || item.description || 'Saved item';
            var unitType = item.unitType || item.unit || '';
            var key = String(category || '') + '::' + String(name || '') + '::' + String(unitType || '') + '::' + String(rate);
            if (seen[key]) return;
            seen[key] = true;
            var searchText = [
                name,
                item.description || '',
                item.serviceName || '',
                item.itemDescription || '',
                item.item_description || '',
                item.notes || '',
                category || '',
                unitType || ''
            ].join(' ').toLowerCase();
            items.push({
                id: (sourceLabel || category || 'Item') + '::' + category + '::' + name,
                category: sourceLabel || category || 'Saved Items',
                itemCategory: category || '',
                name: name,
                itemDescription: item.itemDescription || item.description || item.item_description || '',
                rate: rate,
                unitType: unitType,
                searchText: searchText
            });
        }

        function collectEstimatorItemsFromMap(items, seen, source, sourceLabel) {
            Object.keys(source || {}).sort().forEach(function(cat) {
                if (cat === '__choiceGroupTemplates') return;
                var catItems = Array.isArray(source[cat]) ? source[cat] : [];
                catItems.forEach(function(item) {
                    addEstimatorPricingItem(items, seen, cat, item, sourceLabel || cat);
                });
            });
        }

        function collectEstimatorItemsFromCurrentQuote(items, seen) {
            try {
                if (!Array.isArray(rooms)) return;
                rooms.forEach(function(room) {
                    (room.items || []).forEach(function(item) {
                        addEstimatorPricingItem(items, seen, item.category || 'Quote Items', item, 'Current Quote');
                    });
                });
            } catch(e) {}
        }

        function buildEstimatorPricingItems() {
            var items = [];
            var seen = {};
            collectEstimatorItemsFromMap(items, seen, getEstimatorCustomItems());
            collectEstimatorItemsFromMap(items, seen, getEstimatorLocalStorageItems());
            collectEstimatorItemsFromMap(items, seen, getEstimatorPricingDatabaseItems());
            collectEstimatorItemsFromCurrentQuote(items, seen);
            _estimatorPricingItems = items;
            return items;
        }

        function estimatorPricingOptionsHtml(key, query, selectedId) {
            var q = String(query || '').trim().toLowerCase();
            var filtered = _estimatorPricingItems.filter(function(item) {
                if (!q) return true;
                return (item.searchText || (item.name + ' ' + item.category + ' ' + item.unitType).toLowerCase()).indexOf(q) !== -1;
            });
            var html = '<option value="">Pick from my items...</option>';
            var lastCat = null;
            filtered.forEach(function(item) {
                if (lastCat !== item.category) {
                    if (lastCat !== null) html += '</optgroup>';
                    lastCat = item.category;
                    html += '<optgroup label="' + calcEscapeHtml(item.category) + '">';
                }
                html += '<option value="' + calcEscapeHtml(item.id) + '" data-rate="' + item.rate + '" data-category="' + calcEscapeHtml(item.category) + '" data-name="' + calcEscapeHtml(item.name) + '" data-unit="' + calcEscapeHtml(item.unitType) + '"' + (String(selectedId) === String(item.id) ? ' selected' : '') + '>' +
                    calcEscapeHtml(item.name) + ' ($' + item.rate.toFixed(2) + '/' + calcEscapeHtml(item.unitType || key) + ')' +
                    '</option>';
            });
            if (lastCat !== null) html += '</optgroup>';
            if (filtered.length === 0) html += '<option value="" disabled>No matching saved items</option>';
            return html;
        }

        function getEstimatorPricingSearchMatches(query, limit) {
            var q = String(query || '').trim().toLowerCase();
            if (!q) return [];
            return _estimatorPricingItems.filter(function(item) {
                var haystack = item.searchText || (item.name + ' ' + item.category + ' ' + item.unitType + ' ' + item.rate).toLowerCase();
                return haystack.indexOf(q) !== -1;
            }).slice(0, limit || 8);
        }

        function estimatorPricingSearchResultsHtml(key, query) {
            var q = String(query || '').trim();
            if (!q) return '';
            var matches = getEstimatorPricingSearchMatches(q, 8);
            if (!matches.length) {
                return '<div class="list-group-item small text-muted">No saved items match "' + calcEscapeHtml(q) + '". Try another word, or choose from the category dropdown.</div>';
            }
            return matches.map(function(item) {
                return '<button type="button" class="list-group-item list-group-item-action py-2" data-estimator-search-pick="1" data-estimator-key="' + calcEscapeHtml(key) + '" data-estimator-item-id="' + calcEscapeHtml(item.id) + '">' +
                    '<div class="d-flex justify-content-between gap-2">' +
                        '<span class="fw-semibold text-truncate">' + calcEscapeHtml(item.name) + '</span>' +
                        '<span class="text-success fw-semibold flex-shrink-0">$' + item.rate.toFixed(2) + '</span>' +
                    '</div>' +
                    '<div class="small text-muted text-truncate">' + calcEscapeHtml(item.category) + (item.unitType ? ' / ' + calcEscapeHtml(item.unitType) : '') + '</div>' +
                '</button>';
            }).join('');
        }

        function renderEstimatorPricingSearchResults(key) {
            var search = document.getElementById('epSearch_' + key);
            var results = document.getElementById('epResults_' + key);
            if (!results) return;
            var html = estimatorPricingSearchResultsHtml(key, search ? search.value : '');
            results.innerHTML = html;
            results.style.display = html ? 'block' : 'none';
        }

        function hideEstimatorPricingSearchResults(key) {
            var results = document.getElementById('epResults_' + key);
            if (results) results.style.display = 'none';
        }

        function toggleEstimatorPricingBrowse(key) {
            var wrap = document.getElementById('epBrowseWrap_' + key);
            var button = document.getElementById('epBrowseBtn_' + key);
            var select = document.getElementById('epItem_' + key);
            if (!wrap) return;
            var shouldShow = wrap.style.display === 'none' || !wrap.style.display;
            wrap.style.display = shouldShow ? 'block' : 'none';
            if (button) {
                button.innerHTML = shouldShow
                    ? '<i class="fas fa-chevron-up me-1"></i>Hide browse'
                    : '<i class="fas fa-list me-1"></i>Browse all items';
            }
            if (shouldShow && select) {
                select.innerHTML = estimatorPricingOptionsHtml(key, '', '');
                setTimeout(function() { select.focus(); }, 0);
            }
        }

        function findEstimatorSavedItemIds(saved) {
            if (!saved) return [];
            if (Array.isArray(saved.items)) {
                return saved.items
                    .map(function(item) { return item.itemId || item.id || ''; })
                    .filter(function(id) {
                        return id && _estimatorPricingItems.some(function(item) { return String(item.id) === String(id); });
                    });
            }
            if (saved.itemId !== undefined && _estimatorPricingItems.some(function(item) { return String(item.id) === String(saved.itemId); })) return [saved.itemId];
            if (saved.itemName) {
                var match = _estimatorPricingItems.find(function(item) {
                    return item.name === saved.itemName && (!saved.category || item.category === saved.category);
                });
                if (match) return [match.id];
            }
            return [];
        }

        function findEstimatorSavedItemId(saved) {
            var ids = findEstimatorSavedItemIds(saved);
            return ids.length ? ids[0] : '';
        }

        function getEstimatorItemById(itemId) {
            return _estimatorPricingItems.find(function(item) { return String(item.id) === String(itemId); }) || null;
        }

        function estimatorSelectedItemsHtml(key, selectedIds) {
            selectedIds = selectedIds || [];
            if (!selectedIds.length) {
                return '<div class="text-muted small" id="epSelectedEmpty_' + key + '">No saved items linked yet.</div>';
            }
            return selectedIds.map(function(itemId) {
                var item = getEstimatorItemById(itemId);
                if (!item) return '';
                return '<span class="badge rounded-pill text-bg-light border me-1 mb-1" data-ep-selected-item="' + calcEscapeHtml(item.id) + '" data-rate="' + item.rate + '" data-name="' + calcEscapeHtml(item.name) + '" data-category="' + calcEscapeHtml(item.category) + '" data-unit="' + calcEscapeHtml(item.unitType) + '">' +
                    calcEscapeHtml(item.name) +
                    ' <small class="text-muted">$' + item.rate.toFixed(2) + (item.unitType ? '/' + calcEscapeHtml(item.unitType) : '') + '</small>' +
                    ' <button type="button" class="btn-close btn-close-sm ms-1" aria-label="Remove" data-estimator-remove-item="1" data-estimator-key="' + calcEscapeHtml(key) + '" data-estimator-item-id="' + calcEscapeHtml(item.id) + '" style="font-size:0.55rem;"></button>' +
                '</span>';
            }).join('');
        }

        function estimatorSelectedItemIds(key) {
            var wrap = document.getElementById('epSelected_' + key);
            if (!wrap) return [];
            return Array.from(wrap.querySelectorAll('[data-ep-selected-item]')).map(function(el) {
                return el.getAttribute('data-ep-selected-item');
            }).filter(Boolean);
        }

        function updateEstimatorSelectedTotal(key) {
            var ids = estimatorSelectedItemIds(key);
            var total = ids.reduce(function(sum, itemId) {
                var item = getEstimatorItemById(itemId);
                return sum + (item ? parseFloat(item.rate) || 0 : 0);
            }, 0);
            var rateInput = document.getElementById('epRate_' + key);
            if (rateInput) rateInput.value = ids.length ? total.toFixed(2) : '';
        }

        function removeEstimatorPricingItem(key, itemId) {
            var selected = estimatorSelectedItemIds(key).filter(function(id) { return String(id) !== String(itemId); });
            var wrap = document.getElementById('epSelected_' + key);
            if (wrap) wrap.innerHTML = estimatorSelectedItemsHtml(key, selected);
            updateEstimatorSelectedTotal(key);
        }

        function removeEstimatorPricingItemFromButton(button) {
            if (!button || !button.dataset) return;
            removeEstimatorPricingItem(button.dataset.estimatorKey, button.dataset.estimatorItemId);
        }

        function addEstimatorPricingItemSelection(key, itemId) {
            if (!itemId) return false;
            var selected = estimatorSelectedItemIds(key);
            if (selected.indexOf(itemId) === -1) selected.push(itemId);
            var wrap = document.getElementById('epSelected_' + key);
            if (wrap) wrap.innerHTML = estimatorSelectedItemsHtml(key, selected);
            updateEstimatorSelectedTotal(key);
            return true;
        }

        function pickEstimatorPricingSearchResult(key, itemId) {
            if (!addEstimatorPricingItemSelection(key, itemId)) return;
            var search = document.getElementById('epSearch_' + key);
            var sel = document.getElementById('epItem_' + key);
            if (search) search.value = '';
            if (sel) {
                sel.innerHTML = estimatorPricingOptionsHtml(key, '', '');
                sel.value = '';
            }
            hideEstimatorPricingSearchResults(key);
            var browseWrap = document.getElementById('epBrowseWrap_' + key);
            var browseBtn = document.getElementById('epBrowseBtn_' + key);
            if (browseWrap) browseWrap.style.display = 'none';
            if (browseBtn) browseBtn.innerHTML = '<i class="fas fa-list me-1"></i>Browse all items';
        }

        function handleEstimatorPricingSearchKey(event, key) {
            if (!event) return true;
            if (event.key === 'Escape') {
                hideEstimatorPricingSearchResults(key);
                return true;
            }
            if (event.key !== 'Enter') return true;
            var search = document.getElementById('epSearch_' + key);
            var query = search ? search.value : '';
            var match = findEstimatorSearchMatch(query) || getEstimatorPricingSearchMatches(query, 1)[0];
            if (!match) return true;
            event.preventDefault();
            pickEstimatorPricingSearchResult(key, match.id);
            return false;
        }

        function pickEstimatorPricingSearchButton(button) {
            if (!button || !button.dataset) return;
            pickEstimatorPricingSearchResult(button.dataset.estimatorKey, button.dataset.estimatorItemId);
        }

        document.addEventListener('click', function(event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-estimator-remove-item="1"]') : null;
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            removeEstimatorPricingItemFromButton(button);
        });

        document.addEventListener('click', function(event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-estimator-search-pick="1"]') : null;
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            pickEstimatorPricingSearchButton(button);
        });

        document.addEventListener('pointerdown', function(event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-estimator-search-pick="1"]') : null;
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            pickEstimatorPricingSearchButton(button);
        });

        document.addEventListener('click', function(event) {
            if (event.target && event.target.closest && event.target.closest('[data-estimator-pricing-search-wrap]')) return;
            document.querySelectorAll('[data-estimator-pricing-results]').forEach(function(results) {
                results.style.display = 'none';
            });
        });

        // Re-open estimator after pricing modal closes
        document.addEventListener('hidden.bs.modal', function(e) {
            if (e.target.id === 'estimatorPricingModal') {
                setTimeout(function() { openMaterialEstimator(); }, 200);
            }
        });

        function saveEstimatorPricing() {
            var pricing = {};
            EST_FIELDS.forEach(function(f) {
                var rateEl = document.getElementById('epRate_' + f.key);
                var useEl = document.getElementById('epUse_' + f.key);
                var rate = rateEl ? parseFloat(rateEl.value) || 0 : 0;
                var selectedItems = estimatorSelectedItemIds(f.key).map(function(itemId) {
                    var item = getEstimatorItemById(itemId);
                    if (!item) return null;
                    return {
                        itemId: item.id,
                        itemName: item.name,
                        category: item.category,
                        itemCategory: item.itemCategory || '',
                        unitType: item.unitType || '',
                        itemDescription: item.itemDescription || '',
                        rate: parseFloat(item.rate) || 0
                    };
                }).filter(Boolean);
                pricing[f.key] = {
                    enabled: !useEl || useEl.checked,
                    rate: selectedItems.length ? selectedItems.reduce(function(sum, item) { return sum + (parseFloat(item.rate) || 0); }, 0) : rate,
                    unit: f.unit,
                    items: selectedItems,
                    itemId: selectedItems[0] ? selectedItems[0].itemId : '',
                    itemName: selectedItems[0] ? selectedItems[0].itemName : '',
                    category: selectedItems[0] ? selectedItems[0].category : '',
                    unitType: selectedItems[0] ? selectedItems[0].unitType : ''
                };
            });
            localStorage.setItem('ald_estimator_pricing', JSON.stringify(pricing));
            // Also save to Supabase
            if (typeof saveUserDataValue === 'function') saveUserDataValue('estimator_pricing', pricing, { entityType: 'quote_preferences', entityLabel: 'Estimator pricing', localStorageKey: 'ald_estimator_pricing', background: true });
            bootstrap.Modal.getInstance(document.getElementById('estimatorPricingModal')).hide();
            var t3 = document.createElement('div');
            t3.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#198754;color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            t3.innerHTML = '<i class="fas fa-save me-2"></i>Pricing saved! Estimates will now auto-fill rates.';
            document.body.appendChild(t3); setTimeout(function(){ t3.remove(); }, 3500);
            // Refresh banner
            document.getElementById('estPricingBanner').style.display = 'none';
        }

        function openEstimatorPricing(event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            var saved = loadEstimatorPricing();
            var items = buildEstimatorPricingItems();
            var html = '';
            EST_FIELDS.forEach(function(f) {
                var displayUnit = (f.unit === 'sqft') ? calcAreaUnit() : (f.unit === 'LF' ? calcLengthUnit() : f.unit);
                var selectedIds = findEstimatorSavedItemIds(saved[f.key]);
                var selectedTotal = selectedIds.reduce(function(sum, itemId) {
                    var item = getEstimatorItemById(itemId);
                    return sum + (item ? parseFloat(item.rate) || 0 : 0);
                }, 0);
                var savedRate = selectedIds.length ? selectedTotal.toFixed(2) : ((saved[f.key] && saved[f.key].rate) || '');
                var fieldEnabled = isEstimatorFieldEnabled(saved, f.key);
                var selectedId = selectedIds.length === 1 ? selectedIds[0] : '';
                html += '<div class="row g-3 align-items-stretch estimator-pricing-row">';
                html += '<div class="col-lg-3 estimator-pricing-field"><div class="d-flex flex-wrap align-items-center gap-2"><label class="form-label fw-semibold mb-0">' + f.label + '</label><div class="form-check form-check-inline m-0 small"><input class="form-check-input" type="checkbox" id="epUse_' + f.key + '"' + (fieldEnabled ? ' checked' : '') + '><label class="form-check-label fw-semibold" for="epUse_' + f.key + '">Use</label></div></div><div class="text-muted small">per ' + displayUnit + '</div></div>';
                html += '<div class="col-lg-9"><div class="row g-2 align-items-start estimator-pricing-controls">';
                html += '<div class="col-lg-9 position-relative" data-estimator-pricing-search-wrap="1">';
                html += '<label class="form-label small text-muted mb-1" for="epSearch_' + f.key + '">Find saved item</label>';
                html += '<input type="search" class="form-control form-control-sm" id="epSearch_' + f.key + '" data-estimator-item-search="' + f.key + '" placeholder="Start typing..." oninput="filterEstimatorPricingItems(\'' + f.key + '\')" onfocus="filterEstimatorPricingItems(\'' + f.key + '\')" onkeydown="return handleEstimatorPricingSearchKey(event, \'' + f.key + '\')" onchange="commitEstimatorPricingSearchMatch(\'' + f.key + '\')" autocomplete="off">';
                html += '<div class="list-group position-absolute w-100 shadow-sm" id="epResults_' + f.key + '" data-estimator-pricing-results="1" style="display:none;z-index:1085;max-height:240px;overflow:auto;"></div>';
                html += '<div class="mt-1" id="epSelected_' + f.key + '">' + estimatorSelectedItemsHtml(f.key, selectedIds) + '</div>';
                html += '<button type="button" class="btn btn-link btn-sm px-0 mt-1 text-decoration-none" id="epBrowseBtn_' + f.key + '" onclick="toggleEstimatorPricingBrowse(\'' + f.key + '\')"><i class="fas fa-list me-1"></i>Browse all items</button>';
                html += '<div class="mt-1" style="display:none;" id="epBrowseWrap_' + f.key + '">';
                html += '<select class="form-select form-select-sm" id="epItem_' + f.key + '" aria-label="Browse saved items for ' + calcEscapeHtml(f.label) + '" onchange="estimatorPricingItemSelected(\'' + f.key + '\')">' + estimatorPricingOptionsHtml(f.key, '', selectedId) + '</select>';
                html += '</div>';
                html += '</div>';
                html += '<div class="col-lg-3"><label class="form-label small text-muted mb-1" for="epRate_' + f.key + '">Rate</label><div class="input-group input-group-sm"><span class="input-group-text">$</span><input type="number" class="form-control" id="epRate_' + f.key + '" value="' + savedRate + '" placeholder="0.00" step="0.01" min="0"></div></div>';
                html += '</div></div>';
                html += '</div>';
            });
            if (items.length === 0) {
                html = '<div class="alert alert-info mb-0"><i class="fas fa-info-circle me-1"></i>No saved pricing items with rates yet. Add items in Manage Items, or enter manual rates here and save.</div>' + html;
            }
            document.getElementById('estPricingRows').innerHTML = html;
            // Close estimator first (Bootstrap blocks stacked modals)
            var estModal = bootstrap.Modal.getInstance(document.getElementById('materialEstimatorModal'));
            if (estModal) estModal.hide();
            setTimeout(function() {
                new bootstrap.Modal(document.getElementById('estimatorPricingModal')).show();
            }, 300);
            return false;
        }

        function estimatorPricingItemSelected(key) {
            var sel = document.getElementById('epItem_' + key);
            if (!sel || !sel.value) return;
            var opt = sel.selectedOptions ? sel.selectedOptions[0] : null;
            addEstimatorPricingItemSelection(key, sel.value);
            var search = document.getElementById('epSearch_' + key);
            if (search) search.value = '';
            sel.innerHTML = estimatorPricingOptionsHtml(key, '', '');
            sel.value = '';
        }

        function findEstimatorSearchMatch(query) {
            var q = String(query || '').trim().toLowerCase();
            if (!q) return null;
            var exact = _estimatorPricingItems.find(function(item) {
                return String(item.name || '').trim().toLowerCase() === q;
            });
            if (exact) return exact;
            return _estimatorPricingItems.find(function(item) {
                var label = (item.name + ' - ' + item.category + (item.unitType ? ' / ' + item.unitType : '')).trim().toLowerCase();
                return label === q;
            }) || null;
        }

        function commitEstimatorPricingSearchMatch(key) {
            var search = document.getElementById('epSearch_' + key);
            var sel = document.getElementById('epItem_' + key);
            var match = search ? findEstimatorSearchMatch(search.value) : null;
            if (match) {
                addEstimatorPricingItemSelection(key, match.id);
                if (search) search.value = '';
                if (sel) {
                    sel.innerHTML = estimatorPricingOptionsHtml(key, '', '');
                    sel.value = '';
                }
                hideEstimatorPricingSearchResults(key);
                return;
            }
            filterEstimatorPricingItems(key);
        }

        function filterEstimatorPricingItems(key) {
            var search = document.getElementById('epSearch_' + key);
            var sel = document.getElementById('epItem_' + key);
            if (!sel) return;
            var query = search ? search.value : '';
            var matches = _estimatorPricingItems.filter(function(item) {
                if (!query) return true;
                return (item.searchText || (item.name + ' ' + item.category + ' ' + item.unitType).toLowerCase()).indexOf(query.toLowerCase()) !== -1;
            });
            var exactMatch = query ? matches.find(function(item) { return String(item.name || '').toLowerCase() === query.toLowerCase(); }) : null;
            var selectedId = exactMatch ? exactMatch.id : '';
            sel.innerHTML = estimatorPricingOptionsHtml(key, query, selectedId);
            renderEstimatorPricingSearchResults(key);
        }

        function getEstimatorPricingSelections(pricing, key) {
            var saved = pricing[key] || {};
            if (Array.isArray(saved.items) && saved.items.length) {
                return saved.items.map(function(item) {
                    return {
                        name: item.itemName || item.name || '',
                        category: item.itemCategory || item.category || '',
                        displayCategory: item.category || item.itemCategory || '',
                        unitType: item.unitType || '',
                        itemDescription: item.itemDescription || '',
                        rate: parseFloat(item.rate) || 0
                    };
                });
            }
            if (saved.itemName || saved.itemId) {
                return [{
                    name: saved.itemName || '',
                    category: saved.itemCategory || saved.category || '',
                    displayCategory: saved.category || saved.itemCategory || '',
                    unitType: saved.unitType || '',
                    itemDescription: saved.itemDescription || '',
                    rate: parseFloat(saved.rate) || 0
                }];
            }
            return [];
        }

        function epItemSelected(key) {
            estimatorPricingItemSelected(key);
        }

        function openMaterialEstimator() {
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('quick_add_room_opened', { existing_room_count: Array.isArray(rooms) ? rooms.length : 0 });
            }
            applyCalculatorMeasurementLabels();
            // Reset to input state
            document.getElementById('estInputSection').style.display = 'block';
            document.getElementById('estResultsSection').style.display = 'none';
            document.getElementById('estRoomName').value = '';
            document.getElementById('estWidth').value = '';
            document.getElementById('estLength').value = '';
            document.getElementById('estDoors').value = '0';
            document.getElementById('estWindows').value = '0';
            if (document.getElementById('estFloorWaste')) document.getElementById('estFloorWaste').value = '10';
            if (document.getElementById('estWallPaintWaste')) document.getElementById('estWallPaintWaste').value = '0';
            if (document.getElementById('estPaintDeductOpenings')) document.getElementById('estPaintDeductOpenings').checked = true;
            if (document.getElementById('estCeilingPaint')) document.getElementById('estCeilingPaint').checked = true;
            var pricing = loadEstimatorPricing();
            var showCeilingDrywall = isEstimatorFieldEnabled(pricing, 'drywall');
            var ceilingDrywallWrap = document.getElementById('estCeilingDrywallWrap');
            var ceilingDrywallInput = document.getElementById('estCeilingDrywall');
            if (ceilingDrywallWrap) ceilingDrywallWrap.style.display = showCeilingDrywall ? '' : 'none';
            if (ceilingDrywallInput) ceilingDrywallInput.checked = showCeilingDrywall;
            document.getElementById('ceil8').checked = true;
            document.getElementById('estCeilingCustom').style.display = 'none';
            // Populate room dropdown
            var sel = document.getElementById('estTargetRoom');
            sel.innerHTML = '<option value="__new__">+ Create new room</option>';
            rooms.forEach(function(r) {
                var opt = document.createElement('option');
                opt.value = r.id; opt.textContent = r.name; sel.appendChild(opt);
            });
            sel.value = '__new__';
            // Show pricing banner if no pricing set up yet
            var hasPricing = Object.keys(pricing).length > 0;
            document.getElementById('estPricingBanner').style.display = hasPricing ? 'none' : 'block';
            new bootstrap.Modal(document.getElementById('materialEstimatorModal')).show();
        }

        function toggleCeilingCustom() {
            var isCustom = document.getElementById('ceilCustom').checked;
            document.getElementById('estCeilingCustom').style.display = isCustom ? 'inline-block' : 'none';
        }

        function calculateEstimate() {
            var name = document.getElementById('estRoomName').value.trim() || 'Room';
            var w = parseFloat(document.getElementById('estWidth').value);
            var l = parseFloat(document.getElementById('estLength').value);
            var doors = parseInt(document.getElementById('estDoors').value) || 0;
            var windows = parseInt(document.getElementById('estWindows').value) || 0;
            if (!w || !l || w <= 0 || l <= 0) { qdAlert('Please enter valid width and length.'); return; }
            var ceilVal = document.querySelector('input[name="ceilingHeight"]:checked').value;
            var ceilH = ceilVal === 'custom' ? parseFloat(document.getElementById('estCeilingCustom').value) : parseFloat(ceilVal);
            if (!ceilH || ceilH <= 0) { qdAlert('Please enter a valid ceiling height.'); return; }

            var floorWaste = calcPercentInput('estFloorWaste', 10);
            var paintWaste = calcPercentInput('estWallPaintWaste', 0);
            var deductOpeningsEl = document.getElementById('estPaintDeductOpenings');
            var includeCeilingEl = document.getElementById('estCeilingPaint');
            var includeCeilingDrywallEl = document.getElementById('estCeilingDrywall');
            var deductOpenings = !deductOpeningsEl || deductOpeningsEl.checked;
            var includeCeilingPaint = !includeCeilingEl || includeCeilingEl.checked;
            var includeCeilingDrywall = !includeCeilingDrywallEl || includeCeilingDrywallEl.checked;
            var baseFloorSqft = Math.round(w * l * 10) / 10;
            var floorSqft = Math.round(baseFloorSqft * (1 + floorWaste / 100) * 10) / 10;
            var wallGrossSqft = Math.round((2 * w + 2 * l) * ceilH * 10) / 10;
            var openingDeduction = deductOpenings ? Math.round((doors * calcDoorAreaDeduction() + windows * calcWindowAreaDeduction()) * 10) / 10 : 0;
            var wallNetSqft = Math.max(0, wallGrossSqft - openingDeduction);
            var wallSqft = Math.round(wallNetSqft * (1 + paintWaste / 100) * 10) / 10;
            var drywallBaseSqft = wallGrossSqft + (includeCeilingDrywall ? baseFloorSqft : 0);
            var drywallSqft = Math.round(Math.max(0, drywallBaseSqft - openingDeduction) * 10) / 10;
            var perimeter = Math.round((2 * w + 2 * l) * 10) / 10;
            var doorCasing = doors * calcDoorCasingLength();
            var windowCasing = windows * calcWindowCasingLength();

            var pricing = loadEstimatorPricing();
            var hasPricing = Object.keys(pricing).length > 0;
            document.getElementById('estPricingBanner').style.display = hasPricing ? 'none' : 'block';

            function getRate(key) { return (pricing[key] && pricing[key].rate) ? pricing[key].rate : 0; }
            function noteList(parts) { return parts.filter(Boolean).join('; '); }
            function estimateLineHtml(line) {
                line.rate = parseFloat(line.rate) || 0;
                var total = Math.round(line.qty * line.rate * 100) / 100;
                subtotal += total;
                var label = line.label || line.itemName;
                var notes = line.notes || '';
                var itemName = line.itemName || label;
                var itemDescription = line.itemDescription || '';
                html += '<tr data-cat="' + calcEscapeHtml(line.cat) + '" data-name="' + calcEscapeHtml(itemName) + '" data-item-description="' + calcEscapeHtml(itemDescription) + '" data-unit="' + calcEscapeHtml(line.unit) + '" data-qty="' + line.qty + '" data-rate="' + line.rate + '" data-notes="' + calcEscapeHtml(notes) + '">';
                html += '<td><input type="checkbox" class="form-check-input est-check" checked></td>';
                html += '<td>' + calcEscapeHtml(label) + (notes ? '<div class="text-muted small">' + calcEscapeHtml(notes) + '</div>' : '') + '</td>';
                html += '<td>' + calcFormatQuantity(line.qty, line.unit) + '</td>';
                html += '<td class="text-muted">' + line.unit + '</td>';
                html += '<td>' + (line.rate > 0 ? '$' + line.rate.toFixed(2) : '<span class="text-muted">-</span>') + '</td>';
                html += '<td>' + (total > 0 ? '$' + total.toFixed(2) : '<span class="text-muted">-</span>') + '</td>';
                html += '</tr>';
            }

            document.getElementById('estResultRoomName').textContent = name;
            var rows = [
                { key: 'flooring',     label: 'Flooring',       qty: floorSqft,    unit: calcAreaUnit(),   cat: 'Flooring',        itemName: 'Flooring - ' + name, notes: noteList([floorWaste > 0 ? floorWaste + '% waste added' : '']) },
                { key: 'ceilingPaint', label: 'Ceiling Paint',  qty: baseFloorSqft, unit: calcAreaUnit(),  cat: 'Painting',        itemName: 'Ceiling Paint - ' + name, hide: !includeCeilingPaint },
                { key: 'wallPaint',    label: 'Wall Paint',     qty: wallSqft,     unit: calcAreaUnit(),   cat: 'Painting',        itemName: 'Wall Paint - ' + name, notes: noteList([openingDeduction > 0 ? openingDeduction + ' ' + calcAreaUnit() + ' openings deducted' : '', paintWaste > 0 ? paintWaste + '% paint waste added' : '']) },
                { key: 'drywall',      label: 'Drywall',        qty: drywallSqft,  unit: calcAreaUnit(),   cat: 'Drywall',         itemName: 'Drywall - ' + name, notes: noteList([includeCeilingDrywall ? 'walls and ceiling calculated' : 'walls only calculated', openingDeduction > 0 ? openingDeduction + ' ' + calcAreaUnit() + ' openings deducted' : '']) },
                { key: 'baseboard',    label: 'Baseboard',      qty: perimeter,    unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Baseboard - ' + name },
                { key: 'crownMolding', label: 'Crown Molding',  qty: perimeter,    unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Crown Molding - ' + name },
                { key: 'framing',      label: 'Framing',        qty: perimeter,    unit: calcLengthUnit(), cat: 'Framing',         itemName: 'Framing - ' + name },
                { key: 'doorCasing',   label: 'Door Casing',    qty: doorCasing,   unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Door Casing - ' + name, hide: doors === 0 },
                { key: 'windowCasing', label: 'Window Casing',  qty: windowCasing, unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Window Casing - ' + name, hide: windows === 0 },
            ];

            var html = '';
            var subtotal = 0;
            var resultCount = 0;
            rows.forEach(function(r) {
                if (!isEstimatorFieldEnabled(pricing, r.key)) return;
                if (r.hide) return;
                var selections = getEstimatorPricingSelections(pricing, r.key);
                if (selections.length) {
                    selections.forEach(function(selection) {
                        estimateLineHtml({
                            label: selection.name || r.label,
                            itemName: selection.name || r.itemName,
                            cat: selection.category || r.cat,
                            qty: r.qty,
                            unit: r.unit,
                            rate: parseFloat(selection.rate) || 0,
                            itemDescription: selection.itemDescription || '',
                            notes: r.notes || ''
                        });
                        resultCount++;
                    });
                    return;
                }
                estimateLineHtml({
                    label: r.label,
                    itemName: r.itemName,
                    cat: r.cat,
                    qty: r.qty,
                    unit: r.unit,
                    rate: getRate(r.key),
                    itemDescription: '',
                    notes: r.notes || ''
                });
                resultCount++;
            });
            document.getElementById('estResultsBody').innerHTML = html;
            document.getElementById('estSubtotal').textContent = subtotal > 0 ? '$' + subtotal.toFixed(2) : '-';
            document.getElementById('estInputSection').style.display = 'none';
            document.getElementById('estResultsSection').style.display = 'block';
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('quick_add_room_calculated', {
                    item_count: resultCount,
                    total_bucket: typeof qdAnalyticsBucketMoney === 'function' ? qdAnalyticsBucketMoney(subtotal) : undefined,
                    has_pricing: hasPricing,
                    doors: doors,
                    windows: windows
                });
            }
        }

        async function addEstimateToQuote() {
            var roomId = document.getElementById('estTargetRoom').value;
            var roomName = document.getElementById('estResultRoomName').textContent;
            var createdRoom = roomId === '__new__';

            if (createdRoom) {
                // Create new room with the estimator room name
                var newRoom = { id: Date.now(), name: roomName, items: [], notes: '', scopeNotes: '' };
                rooms.push(newRoom);
                roomId = newRoom.id;
                renderRooms();
                if (typeof saveQuoteToSupabase === 'function') saveQuoteToSupabase();
            } else {
                roomId = parseInt(roomId);
            }

            var checked = document.querySelectorAll('#estResultsBody tr');
            var added = 0;
            checked.forEach(function(row) {
                if (!row.querySelector('.est-check').checked) return;
                var rate = parseFloat(row.dataset.rate) || 0;
                var qty = parseFloat(row.dataset.qty) || 0;
                var itemName = row.dataset.name || '';
                var item = {
                    category: row.dataset.cat,
                    name: itemName,
                    description: itemName,
                    itemDescription: row.dataset.itemDescription || '',
                    quantity: qty,
                    unit: row.dataset.unit,
                    unitType: row.dataset.unit,
                    rate: rate,
                    total: Math.round(qty * rate * 100) / 100,
                    notes: row.dataset.notes || ''
                };
                var room = rooms.find(function(r) { return r.id === roomId; });
                if (room) { room.items.push(item); added++; }
            });

            renderRooms();
            if (typeof saveQuoteToSupabase === 'function') saveQuoteToSupabase();
            bootstrap.Modal.getInstance(document.getElementById('materialEstimatorModal')).hide();
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('quick_add_room_added', {
                    item_count: added,
                    target: createdRoom ? 'new_room' : 'existing_room'
                });
            }
            showToast(added + ' items added to ' + roomName, 'success');
        }

// === MATERIAL CALCULATORS (Hardwood/LVP, Paint, Drywall) ===
// Hardwood/LVP Calculator Functions
function openHardwoodCalc() {
    applyCalculatorMeasurementLabels();
    var modal = new bootstrap.Modal(document.getElementById('hardwoodCalcModal'));
    modal.show();

    // Reset form
    document.getElementById('hardwoodRoomName').value = 'Floor';
    document.getElementById('hardwoodWidth').value = '';
    document.getElementById('hardwoodLength').value = '';
    document.getElementById('hardwoodTotalSqft').value = '';
    document.getElementById('hardwoodPlankWidth').value = '4';
    document.getElementById('hardwoodWaste').value = '10';
    document.getElementById('hardwoodSqftPerBox').value = calcIsMetric() ? '1.86' : '20';
    document.getElementById('hardwoodCostPerBox').value = '';

    // Reset results
    document.getElementById('hardwoodResults').classList.add('d-none');
    document.getElementById('hardwoodAddToQuoteBtn').disabled = true;

    // Reset scan results
    document.getElementById('hardwoodScanResults').classList.add('d-none');
    document.getElementById('hardwoodToggleDimensions').checked = false;
    toggleHardwoodDimensions();
}

function toggleHardwoodDimensions() {
    const dimensionsGroup = document.getElementById('hardwoodDimensionsGroup');
    const sqftGroup = document.getElementById('hardwoodSqftGroup');

    if (document.getElementById('hardwoodToggleDimensions').checked) {
        dimensionsGroup.classList.remove('d-none');
        sqftGroup.classList.add('d-none');
    } else {
        dimensionsGroup.classList.add('d-none');
        sqftGroup.classList.remove('d-none');
    }
}

function calculateHardwood() {
    let roomName = document.getElementById('hardwoodRoomName').value || 'Floor';
    let width, length, totalSqft;

    if (document.getElementById('hardwoodToggleDimensions').checked) {
        width = parseFloat(document.getElementById('hardwoodWidth').value) || 0;
        length = parseFloat(document.getElementById('hardwoodLength').value) || 0;
        totalSqft = width * length;
    } else {
        totalSqft = parseFloat(document.getElementById('hardwoodTotalSqft').value) || 0;
    }

    if (totalSqft <= 0) {
        qdAlert("Please enter valid dimensions or square footage.");
        return;
    }

    const plankWidth = parseFloat(document.getElementById('hardwoodPlankWidth').value);
    const wastePercent = parseFloat(document.getElementById('hardwoodWaste').value) || 10;
    const sqftPerBox = parseFloat(document.getElementById('hardwoodSqftPerBox').value) || 20;
    const costPerBox = parseFloat(document.getElementById('hardwoodCostPerBox').value) || 0;

    // Calculate with waste
    const totalWithWaste = totalSqft * (1 + wastePercent / 100);
    const boxesNeeded = Math.ceil(totalWithWaste / sqftPerBox);
    const materialCost = costPerBox > 0 ? boxesNeeded * costPerBox : 0;

    // Display results
    let resultText = `Total ${calcAreaUnit()} (with ${wastePercent}% waste): ${totalWithWaste.toFixed(1)} ${calcAreaUnit()} (${totalSqft.toFixed(1)} + ${wastePercent}% waste)<br>`;
    resultText += `Boxes needed: ${boxesNeeded}<br>`;

    if (costPerBox > 0) {
        resultText += `Material cost: $${materialCost.toFixed(2)}<br>`;
    }

    document.getElementById('hardwoodResultText').innerHTML = resultText;
    document.getElementById('hardwoodResults').classList.remove('d-none');
    document.getElementById('hardwoodAddToQuoteBtn').disabled = false;
}

function addToHardwoodQuote() {
    let roomName = document.getElementById('hardwoodRoomName').value || 'Floor';
    const totalSqft = parseFloat(document.getElementById('hardwoodTotalSqft').value) ||
                     (parseFloat(document.getElementById('hardwoodWidth').value) * parseFloat(document.getElementById('hardwoodLength').value));

    if (totalSqft <= 0) {
        qdAlert("Please calculate before adding to quote.");
        return;
    }

    // Find or create a room
    var room = rooms[0];
    if (!room) { qdAlert('Please create a room in the quote first.'); return; }

    // Add item to room
    room.items.push({
        description: `Hardwood/LVP - ${roomName}`,
        category: 'Flooring',
        unitType: calcAreaUnit(),
        quantity: totalSqft,
        rate: 0,
        total: 0,
        notes: 'Auto-calculated',
        itemDescription: ''
    });

    renderQuote();

    // Close modal
    var modal = bootstrap.Modal.getInstance(document.getElementById('hardwoodCalcModal'));
    modal.hide();

    qdAlert("Hardwood/LVP item added to quote!");
}

function scanHardwoodQuote() {
    if (!rooms || rooms.length === 0) {
        try { var s = JSON.parse(localStorage.getItem('ald_session_quote')); if (s && s.rooms && s.rooms.length > 0) { rooms = s.rooms; } } catch(e) {}
    }
    let totalSqft = 0;
    let roomMap = {};

    rooms.forEach(room => {
        room.items.forEach(item => {
            var normalizedCatF = (item.category || '').trim().toLowerCase();
            var isFlooring = normalizedCatF === 'flooring' || normalizedCatF === 'subflooring' || normalizedCatF.includes('floor') || (item.description && /flooring|hardwood|lvp|laminate|vinyl|tile/i.test(item.description));
            var normalizedUnitF = (item.unitType || '').trim().toLowerCase().replace(/\s+/g, '');
            var isSqft = !item.unitType || normalizedUnitF === 'sqft' || normalizedUnitF === 'sf' || normalizedUnitF === 'm²' || normalizedUnitF === 'm2';
            if (isFlooring && isSqft) {
                totalSqft += item.quantity;
                if (!roomMap[room.name]) {
                    roomMap[room.name] = 0;
                }
                roomMap[room.name] += item.quantity;
            }
        });
    });

    // Update UI
    document.getElementById('hardwoodScanTotal').textContent = totalSqft.toFixed(1);
    document.getElementById('hardwoodScanRooms').textContent = Object.keys(roomMap).length;

    let details = '';
    for (let room in roomMap) {
        details += `${room} (${roomMap[room].toFixed(1)} ${calcAreaUnit()}), `;
    }
    document.getElementById('hardwoodScanDetails').textContent = details.slice(0, -2);

    // Set scanned value
    document.getElementById('hardwoodScanSqft').value = totalSqft.toFixed(1);

    // Show results and switch to sqft mode
    document.getElementById('hardwoodScanResults').classList.remove('d-none');
    document.getElementById('hardwoodToggleDimensions').checked = false;
    toggleHardwoodDimensions();
}

// Paint Calculator Functions
function openPaintCalc() {
    applyCalculatorMeasurementLabels();
    var modal = new bootstrap.Modal(document.getElementById('paintCalcModal'));
    modal.show();

    // Reset form
    document.getElementById('paintRoomName').value = 'Living Room';
    document.getElementById('paintWidth').value = '';
    document.getElementById('paintLength').value = '';
    document.getElementById('paintHeight').value = calcIsMetric() ? '2.7' : '9';
    document.getElementById('paintWallSqft').value = '';
    document.getElementById('paintCeilingSqft').value = '';
    document.getElementById('paintDoors').value = '0';
    document.getElementById('paintWindows').value = '0';
    document.getElementById('paintCoats1').checked = true;
    document.getElementById('paintIncludeCeiling').checked = true;
    document.getElementById('paintIncludePrimer').checked = false;
    document.getElementById('paintCoverage').value = calcIsMetric() ? '37' : '400';

    // Reset results
    document.getElementById('paintResults').classList.add('d-none');
    document.getElementById('paintAddToQuoteBtn').disabled = true;

    // Reset scan results
    document.getElementById('paintScanResults').classList.add('d-none');
    document.getElementById('paintToggleDimensions').checked = false;
    togglePaintDimensions();
}

function togglePaintDimensions() {
    const dimensionsGroup = document.getElementById('paintDimensionsGroup');
    const sqftGroup = document.getElementById('paintSqftGroup');

    if (document.getElementById('paintToggleDimensions').checked) {
        dimensionsGroup.classList.remove('d-none');
        sqftGroup.classList.add('d-none');
    } else {
        dimensionsGroup.classList.add('d-none');
        sqftGroup.classList.remove('d-none');
    }
}

function calculatePaint() {
    let roomName = document.getElementById('paintRoomName').value || 'Living Room';
    let wallSqft, ceilingSqft;

    if (document.getElementById('paintToggleDimensions').checked) {
        const width = parseFloat(document.getElementById('paintWidth').value) || 0;
        const length = parseFloat(document.getElementById('paintLength').value) || 0;
        const height = parseFloat(document.getElementById('paintHeight').value) || 9;
        const doors = parseInt(document.getElementById('paintDoors').value) || 0;
        const windows = parseInt(document.getElementById('paintWindows').value) || 0;

        // Calculate wall area
        wallSqft = 2 * (width + length) * height;
        // Subtract doors and windows
        wallSqft -= doors * calcDoorAreaDeduction();
        wallSqft -= windows * calcWindowAreaDeduction();
        if (wallSqft < 0) wallSqft = 0;

        ceilingSqft = width * length;
    } else {
        wallSqft = parseFloat(document.getElementById('paintWallSqft').value) || 0;
        ceilingSqft = parseFloat(document.getElementById('paintCeilingSqft').value) || 0;
    }

    if (wallSqft <= 0 && ceilingSqft <= 0) {
        qdAlert("Please enter valid dimensions or square footage.");
        return;
    }

    const coats = parseInt(document.querySelector('input[name="paintCoats"]:checked').value) || 1;
    const includeCeiling = document.getElementById('paintIncludeCeiling').checked;
    const includePrimer = document.getElementById('paintIncludePrimer').checked;
    const coverage = parseFloat(document.getElementById('paintCoverage').value) || 400;

    // Calculate gallons needed
    let wallGallons = 0;
    if (wallSqft > 0) {
        wallGallons = Math.ceil((wallSqft * coats) / coverage);
    }

    let ceilingGallons = 0;
    if (includeCeiling && ceilingSqft > 0) {
        ceilingGallons = Math.ceil((ceilingSqft * coats) / coverage);
    }

    let primerGallons = 0;
    if (includePrimer) {
        const totalSqft = wallSqft + ceilingSqft;
        primerGallons = Math.ceil(totalSqft / coverage);
    }

    const totalGallons = wallGallons + ceilingGallons + primerGallons;

    // Display results
    let resultText = `Wall ${calcAreaUnit()}: ${wallSqft.toFixed(1)}<br>`;
    if (includeCeiling && ceilingSqft > 0) {
        resultText += `Ceiling ${calcAreaUnit()}: ${ceilingSqft.toFixed(1)}<br>`;
    }

    if (wallGallons > 0) {
        resultText += `Wall paint gallons needed: ${wallGallons}<br>`;
    }

    if (ceilingGallons > 0) {
        resultText += `Ceiling paint gallons needed: ${ceilingGallons}<br>`;
    }

    if (primerGallons > 0) {
        resultText += `Primer gallons needed: ${primerGallons}<br>`;
    }

    resultText += `Total gallons needed: ${totalGallons}`;

    document.getElementById('paintResultText').innerHTML = resultText;
    document.getElementById('paintResults').classList.remove('d-none');
    document.getElementById('paintAddToQuoteBtn').disabled = false;
}

function addToPaintQuote() {
    let roomName = document.getElementById('paintRoomName').value || 'Living Room';
    const wallSqft = parseFloat(document.getElementById('paintWallSqft').value) ||
                     (parseFloat(document.getElementById('paintWidth').value) * 2 * (parseFloat(document.getElementById('paintHeight').value) || 9) +
                      parseFloat(document.getElementById('paintLength').value) * 2 * (parseFloat(document.getElementById('paintHeight').value) || 9));

    if (wallSqft <= 0) {
        qdAlert("Please calculate before adding to quote.");
        return;
    }

    // Find or create a room
    var room = rooms[0];
    if (!room) { qdAlert('Please create a room in the quote first.'); return; }

    // Add wall paint item
    room.items.push({
        description: `Wall Paint - ${roomName}`,
        category: 'Painting',
        unitType: calcAreaUnit(),
        quantity: wallSqft,
        rate: 0,
        total: 0,
        notes: 'Auto-calculated',
        itemDescription: ''
    });

    // Add ceiling paint if checked
    if (document.getElementById('paintIncludeCeiling').checked) {
        const ceilingSqft = parseFloat(document.getElementById('paintCeilingSqft').value) ||
                           (parseFloat(document.getElementById('paintWidth').value) * parseFloat(document.getElementById('paintLength').value));

        room.items.push({
            description: `Ceiling Paint - ${roomName}`,
            category: 'Painting',
            unitType: calcAreaUnit(),
            quantity: ceilingSqft,
            rate: 0,
            total: 0,
            notes: 'Auto-calculated',
            itemDescription: ''
        });
    }

    renderQuote();

    // Close modal
    var modal = bootstrap.Modal.getInstance(document.getElementById('paintCalcModal'));
    modal.hide();

    qdAlert("Paint items added to quote!");
}

function scanPaintQuote() {
    if (!rooms || rooms.length === 0) {
        try { var s = JSON.parse(localStorage.getItem('ald_session_quote')); if (s && s.rooms && s.rooms.length > 0) { rooms = s.rooms; } } catch(e) {}
    }
    let totalSqft = 0;
    let roomMap = {};

    rooms.forEach(room => {
        room.items.forEach(item => {
            var normalizedCatP = (item.category || '').trim().toLowerCase();
            var isPainting = normalizedCatP === 'painting' || normalizedCatP.includes('paint') || (item.description && /paint/i.test(item.description));
            var normalizedUnitP = (item.unitType || '').trim().toLowerCase().replace(/\s+/g, '');
            var isSqftP = !item.unitType || normalizedUnitP === 'sqft' || normalizedUnitP === 'sf' || normalizedUnitP === 'm²' || normalizedUnitP === 'm2';
            if (isPainting && isSqftP) {
                totalSqft += item.quantity;
                if (!roomMap[room.name]) {
                    roomMap[room.name] = 0;
                }
                roomMap[room.name] += item.quantity;
            }
        });
    });

    // Update UI
    document.getElementById('paintScanTotal').textContent = totalSqft.toFixed(1);
    document.getElementById('paintScanRooms').textContent = Object.keys(roomMap).length;

    let details = '';
    for (let room in roomMap) {
        details += `${room} (${roomMap[room].toFixed(1)} ${calcAreaUnit()}), `;
    }
    document.getElementById('paintScanDetails').textContent = details.slice(0, -2);

    // Set scanned value
    document.getElementById('paintScanSqft').value = totalSqft.toFixed(1);

    // Show results and switch to sqft mode
    document.getElementById('paintScanResults').classList.remove('d-none');
    document.getElementById('paintToggleDimensions').checked = false;
    togglePaintDimensions();
}

// Drywall Calculator Functions
function openDrywallCalc() {
    applyCalculatorMeasurementLabels();
    var modal = new bootstrap.Modal(document.getElementById('drywallCalcModal'));
    modal.show();
    document.getElementById('drywallRoomName').value = 'Living Room';
    document.getElementById('drywallWidth').value = '';
    document.getElementById('drywallLength').value = '';
    document.getElementById('drywallHeight').value = calcIsMetric() ? '2.7' : '9';
    document.getElementById('drywallWallSqft').value = '';
    document.getElementById('drywallCeilingSqft').value = '';
    document.getElementById('drywallDoors').value = '0';
    document.getElementById('drywallWindows').value = '0';
    document.getElementById('drywallIncludeCeiling').checked = true;
    document.getElementById('drywallWaste').value = '10';
    document.getElementById('drywallSheetSize').value = '32';
    document.getElementById('drywallResults').classList.add('d-none');
    document.getElementById('drywallScanResults').classList.add('d-none');
    document.getElementById('drywallToggleDimensions').checked = false;
    toggleDrywallDimensions();
}

function toggleDrywallDimensions() {
    var dim = document.getElementById('drywallDimensionsGroup');
    var sqft = document.getElementById('drywallSqftGroup');
    if (document.getElementById('drywallToggleDimensions').checked) {
        dim.classList.remove('d-none'); sqft.classList.add('d-none');
    } else {
        dim.classList.add('d-none'); sqft.classList.remove('d-none');
    }
}

function calculateDrywall() {
    var wallSqft, ceilingSqft;
    var doors = 0, windows = 0;
    if (document.getElementById('drywallToggleDimensions').checked) {
        var w = parseFloat(document.getElementById('drywallWidth').value) || 0;
        var l = parseFloat(document.getElementById('drywallLength').value) || 0;
        var h = parseFloat(document.getElementById('drywallHeight').value) || 9;
        doors = parseInt(document.getElementById('drywallDoors').value) || 0;
        windows = parseInt(document.getElementById('drywallWindows').value) || 0;
        wallSqft = 2 * (w + l) * h - (doors * calcDoorAreaDeduction()) - (windows * calcWindowAreaDeduction());
        if (wallSqft < 0) wallSqft = 0;
        ceilingSqft = w * l;
    } else {
        wallSqft = parseFloat(document.getElementById('drywallWallSqft').value) || 0;
        ceilingSqft = parseFloat(document.getElementById('drywallCeilingSqft').value) || 0;
        doors = parseInt(document.getElementById('drywallDoors').value) || 0;
    }
    var includeCeiling = document.getElementById('drywallIncludeCeiling').checked;
    var waste = parseFloat(document.getElementById('drywallWaste').value) || 10;
    var finishLevel = document.getElementById('drywallFinishLevel') ? document.getElementById('drywallFinishLevel').value : 'standard';
    var sheetSelect = document.getElementById('drywallSheetSize');
    var sheetSqft = parseFloat(document.getElementById('drywallSheetSize').value) || 32;
    var sheetLabel = sheetSelect && sheetSelect.options[sheetSelect.selectedIndex] ? sheetSelect.options[sheetSelect.selectedIndex].text.replace(' sheets', '') : '4x8';
    var roomName = document.getElementById('drywallRoomName').value || 'Room';
    var totalSqft = wallSqft + (includeCeiling ? ceilingSqft : 0);
    if (totalSqft <= 0) { qdAlert('Please enter valid dimensions or square footage.'); return; }
    var totalWithWaste = totalSqft * (1 + waste / 100);
    var sheets = Math.ceil(totalWithWaste / sheetSqft);
    // Standard 3-coat: 4.5 gal bucket covers ~950 sqft total
    // Level 5 finish: 0.05 gal/sqft = 4.5 gal covers ~90 sqft
    var mudBuckets = finishLevel === 'level5' ? Math.ceil(totalWithWaste * 0.05 / 4.5) : Math.ceil(totalWithWaste / 950);
    var tapeLinearFeet = Math.ceil(totalWithWaste * 0.4);
    var tapeRolls = Math.ceil(tapeLinearFeet / 500);
    var drywallScrews = Math.ceil(totalWithWaste * 1.25);
    var txt = '<table class="table table-sm table-bordered mb-0">';
    txt += '<tr><th colspan="2">Drywall Materials &mdash; ' + roomName + ' (' + (finishLevel === 'level5' ? 'Level 5 finish' : 'Standard 3-coat') + ')</th></tr>';
    txt += '<tr><td>Total ' + calcAreaUnit() + ' (with ' + waste + '% waste)</td><td><strong>' + totalWithWaste.toFixed(1) + ' ' + calcAreaUnit() + '</strong> <small class="text-muted">(' + totalSqft.toFixed(1) + ' base)</small></td></tr>';
    txt += '<tr><td>Sheets of ' + sheetLabel + ' drywall</td><td><strong>' + sheets + ' sheets</strong></td></tr>';
    txt += '<tr><td>Joint compound (4.5 gal buckets/17L boxes)</td><td><strong>' + mudBuckets + ' buckets</strong></td></tr>';
    txt += '<tr><td>Paper tape (400 linear ft per 1,000 sqft)</td><td><strong>' + tapeLinearFeet.toLocaleString() + ' linear ft</strong> <small class="text-muted">(' + tapeRolls + ' ' + (tapeRolls === 1 ? 'roll' : 'rolls') + ' @ 500ft)</small></td></tr>';
    txt += '<tr><td>Drywall screws</td><td><strong>' + drywallScrews.toLocaleString() + ' screws</strong></td></tr>';
    txt += '</table>';
    document.getElementById('drywallResultText').innerHTML = txt;
    document.getElementById('drywallResults').classList.remove('d-none');
    document.getElementById('drywallCalcModal').dataset.calcSqft = totalSqft.toFixed(1);
}

function scanDrywallQuote() {
    // If rooms not loaded yet, try pulling from session storage
    if (!rooms || rooms.length === 0) {
        try {
            var session = JSON.parse(localStorage.getItem('ald_session_quote'));
            if (session && session.rooms && session.rooms.length > 0) {
                rooms = session.rooms;
                roomCounter = session.roomCounter || rooms.length;
            }
        } catch(e) {}
    }
    var totalSqft = 0, roomMap = {};
    var allCategories = new Set();
    var foundItems = [];

    rooms.forEach(function(room) {
        room.items.forEach(function(item) {
            allCategories.add(item.category || '');
            var normalizedCategory = (item.category || '').trim().toLowerCase();
            var isDrywall = normalizedCategory === 'drywall' || normalizedCategory.includes('drywall') ||
                            (item.description && /drywall/i.test(item.description));
            var normalizedUnitType = (item.unitType || '').trim().toLowerCase().replace(/\s+/g, '');
            var isSqft = !item.unitType || normalizedUnitType === 'sqft' || normalizedUnitType === 'sf' || normalizedUnitType === 'm²' || normalizedUnitType === 'm2';
            if (isDrywall && isSqft) {
                totalSqft += item.quantity;
                if (!roomMap[room.name]) roomMap[room.name] = 0;
                roomMap[room.name] += item.quantity;
                foundItems.push(item);
            }
        });
    });

    if (totalSqft === 0 && foundItems.length === 0) {
        var categoriesList = Array.from(allCategories).filter(function(c) { return c; }).join(', ') || 'None';
        document.getElementById('drywallScanResults').innerHTML =
            '<div class="alert alert-warning">No drywall items found. Categories in your quote: <strong>' + categoriesList + '</strong></div>';
        document.getElementById('drywallScanResults').classList.remove('d-none');
    } else {
        document.getElementById('drywallScanTotal').textContent = totalSqft.toFixed(1);
        document.getElementById('drywallScanRooms').textContent = Object.keys(roomMap).length;
        var details = Object.keys(roomMap).map(function(r) { return r + ' (' + roomMap[r].toFixed(1) + ' ' + calcAreaUnit() + ')'; }).join(', ');
        document.getElementById('drywallScanDetails').textContent = details;
        document.getElementById('drywallScanSqft').value = totalSqft.toFixed(1);
        document.getElementById('drywallScanResults').classList.remove('d-none');
    }
    document.getElementById('drywallToggleDimensions').checked = false;
    toggleDrywallDimensions();
}
