// Quote Dr material estimator and calculator helpers.
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

        // -- Material Estimator ---------------------------------------------

        var EST_FIELDS = [
            { key: 'flooring',     label: 'Flooring',       unit: 'sqft', defaultRate: 0 },
            { key: 'ceilingPaint', label: 'Ceiling Paint',  unit: 'sqft', defaultRate: 0 },
            { key: 'wallPaint',    label: 'Wall Paint',     unit: 'sqft', defaultRate: 0 },
            { key: 'baseboard',    label: 'Baseboard',      unit: 'LF',   defaultRate: 0 },
            { key: 'doorCasing',   label: 'Door Casing',    unit: 'LF',   defaultRate: 0 },
            { key: 'windowCasing', label: 'Window Casing',  unit: 'LF',   defaultRate: 0 },
        ];

        function loadEstimatorPricing() {
            return JSON.parse(localStorage.getItem('ald_estimator_pricing') || '{}');
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

        function buildEstimatorPricingItems() {
            var items = [];
            var source = getEstimatorCustomItems();
            Object.keys(source).sort().forEach(function(cat) {
                var catItems = Array.isArray(source[cat]) ? source[cat] : [];
                catItems.forEach(function(item) {
                    var rate = parseFloat(item && item.rate) || 0;
                    if (rate <= 0) return;
                    var name = item.name || item.description || 'Saved item';
                    items.push({
                        id: cat + '::' + name,
                        category: cat,
                        name: name,
                        rate: rate,
                        unitType: item.unitType || item.unit || ''
                    });
                });
            });
            _estimatorPricingItems = items;
            return items;
        }

        function estimatorPricingOptionsHtml(key, query, selectedId) {
            var q = String(query || '').trim().toLowerCase();
            var filtered = _estimatorPricingItems.filter(function(item) {
                if (!q) return true;
                return (item.name + ' ' + item.category + ' ' + item.unitType).toLowerCase().indexOf(q) !== -1;
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

        function findEstimatorSavedItemId(saved) {
            if (!saved) return '';
            if (saved.itemId !== undefined && _estimatorPricingItems.some(function(item) { return String(item.id) === String(saved.itemId); })) return saved.itemId;
            if (saved.itemName) {
                var match = _estimatorPricingItems.find(function(item) {
                    return item.name === saved.itemName && (!saved.category || item.category === saved.category);
                });
                if (match) return match.id;
            }
            return '';
        }

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
                var rate = rateEl ? parseFloat(rateEl.value) || 0 : 0;
                var sel = document.getElementById('epItem_' + f.key);
                var opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
                pricing[f.key] = {
                    rate: rate,
                    unit: f.unit,
                    itemId: sel && sel.value ? sel.value : '',
                    itemName: opt && opt.dataset ? (opt.dataset.name || '') : '',
                    category: opt && opt.dataset ? (opt.dataset.category || '') : '',
                    unitType: opt && opt.dataset ? (opt.dataset.unit || '') : ''
                };
            });
            localStorage.setItem('ald_estimator_pricing', JSON.stringify(pricing));
            // Also save to Supabase
            if (typeof saveItemsToSupabase === 'function') {
                getCurrentUser && getCurrentUser().then(function(u) {
                    if (u && typeof _supabase !== 'undefined') {
                        _supabase.from('user_data').upsert({ user_id: u.id, key: 'estimator_pricing', value: pricing, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
                    }
                });
            }
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
                var savedRate = (saved[f.key] && saved[f.key].rate) || '';
                var displayUnit = (f.unit === 'sqft') ? calcAreaUnit() : (f.unit === 'LF' ? calcLengthUnit() : f.unit);
                var selectedId = findEstimatorSavedItemId(saved[f.key]);
                html += '<div class="row g-2 align-items-end mb-3">';
                html += '<div class="col-lg-3"><label class="form-label fw-semibold mb-0">' + f.label + '</label><div class="text-muted small">per ' + displayUnit + '</div></div>';
                html += '<div class="col-lg-4">';
                html += '<label class="form-label small text-muted mb-1" for="epSearch_' + f.key + '">Find saved item</label>';
                html += '<input type="search" class="form-control form-control-sm" id="epSearch_' + f.key + '" data-estimator-item-search="' + f.key + '" placeholder="Start typing..." oninput="filterEstimatorPricingItems(\'' + f.key + '\')" autocomplete="off">';
                html += '</div>';
                html += '<div class="col-lg-3">';
                html += '<label class="form-label small text-muted mb-1" for="epItem_' + f.key + '">Category items</label>';
                html += '<select class="form-select form-select-sm" id="epItem_' + f.key + '" onchange="estimatorPricingItemSelected(\'' + f.key + '\')">' + estimatorPricingOptionsHtml(f.key, '', selectedId) + '</select>';
                html += '</div>';
                html += '<div class="col-lg-2"><label class="form-label small text-muted mb-1" for="epRate_' + f.key + '">Rate</label><div class="input-group input-group-sm"><span class="input-group-text">$</span><input type="number" class="form-control" id="epRate_' + f.key + '" value="' + savedRate + '" placeholder="0.00" step="0.01" min="0"></div></div>';
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
            var rate = opt && opt.dataset ? opt.dataset.rate : '';
            if (rate) document.getElementById('epRate_' + key).value = rate;
            var search = document.getElementById('epSearch_' + key);
            if (search && opt && opt.dataset) search.value = opt.dataset.name || '';
        }

        function filterEstimatorPricingItems(key) {
            var search = document.getElementById('epSearch_' + key);
            var sel = document.getElementById('epItem_' + key);
            if (!sel) return;
            var query = search ? search.value : '';
            var matches = _estimatorPricingItems.filter(function(item) {
                if (!query) return true;
                return (item.name + ' ' + item.category + ' ' + item.unitType).toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });
            var selectedId = matches.length === 1 ? matches[0].id : '';
            sel.innerHTML = estimatorPricingOptionsHtml(key, query, selectedId);
            if (matches.length === 1) estimatorPricingItemSelected(key);
        }

        function epItemSelected(key) {
            estimatorPricingItemSelected(key);
        }

        function openMaterialEstimator() {
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
            document.getElementById('ceil8').checked = true;
            document.getElementById('estCeilingCustom').style.display = 'none';
            // Populate room dropdown
            var sel = document.getElementById('estTargetRoom');
            sel.innerHTML = '<option value="__new__">+ Create new room</option>';
            rooms.forEach(function(r) {
                var opt = document.createElement('option');
                opt.value = r.id; opt.textContent = r.name; sel.appendChild(opt);
            });
            if (rooms.length > 0) sel.value = rooms[rooms.length - 1].id;
            // Show pricing banner if no pricing set up yet
            var hasPricing = Object.keys(loadEstimatorPricing()).length > 0;
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
            var deductOpenings = !deductOpeningsEl || deductOpeningsEl.checked;
            var includeCeilingPaint = !includeCeilingEl || includeCeilingEl.checked;
            var baseFloorSqft = Math.round(w * l * 10) / 10;
            var floorSqft = Math.round(baseFloorSqft * (1 + floorWaste / 100) * 10) / 10;
            var wallGrossSqft = Math.round((2 * w + 2 * l) * ceilH * 10) / 10;
            var openingDeduction = deductOpenings ? Math.round((doors * calcDoorAreaDeduction() + windows * calcWindowAreaDeduction()) * 10) / 10 : 0;
            var wallNetSqft = Math.max(0, wallGrossSqft - openingDeduction);
            var wallSqft = Math.round(wallNetSqft * (1 + paintWaste / 100) * 10) / 10;
            var perimeter = Math.round((2 * w + 2 * l) * 10) / 10;
            var doorCasing = doors * calcDoorCasingLength();
            var windowCasing = windows * calcWindowCasingLength();

            var pricing = loadEstimatorPricing();
            var hasPricing = Object.keys(pricing).length > 0;
            document.getElementById('estPricingBanner').style.display = hasPricing ? 'none' : 'block';

            function getRate(key) { return (pricing[key] && pricing[key].rate) ? pricing[key].rate : 0; }
            function noteList(parts) { return parts.filter(Boolean).join('; '); }

            document.getElementById('estResultRoomName').textContent = name;
            var rows = [
                { key: 'flooring',     label: 'Flooring',       qty: floorSqft,    unit: calcAreaUnit(),   cat: 'Flooring',        itemName: 'Flooring - ' + name, notes: noteList([floorWaste > 0 ? floorWaste + '% waste added' : '']) },
                { key: 'ceilingPaint', label: 'Ceiling Paint',  qty: baseFloorSqft, unit: calcAreaUnit(),  cat: 'Painting',        itemName: 'Ceiling Paint - ' + name, hide: !includeCeilingPaint },
                { key: 'wallPaint',    label: 'Wall Paint',     qty: wallSqft,     unit: calcAreaUnit(),   cat: 'Painting',        itemName: 'Wall Paint - ' + name, notes: noteList([openingDeduction > 0 ? openingDeduction + ' ' + calcAreaUnit() + ' openings deducted' : '', paintWaste > 0 ? paintWaste + '% paint waste added' : '']) },
                { key: 'baseboard',    label: 'Baseboard',      qty: perimeter,    unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Baseboard - ' + name },
                { key: 'doorCasing',   label: 'Door Casing',    qty: doorCasing,   unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Door Casing - ' + name, hide: doors === 0 },
                { key: 'windowCasing', label: 'Window Casing',  qty: windowCasing, unit: calcLengthUnit(), cat: 'Trim & Millwork', itemName: 'Window Casing - ' + name, hide: windows === 0 },
            ];

            var html = '';
            var subtotal = 0;
            rows.forEach(function(r) {
                if (r.hide) return;
                var rate = getRate(r.key);
                var total = Math.round(r.qty * rate * 100) / 100;
                subtotal += total;
                html += '<tr data-cat="' + calcEscapeHtml(r.cat) + '" data-name="' + calcEscapeHtml(r.itemName) + '" data-unit="' + calcEscapeHtml(r.unit) + '" data-qty="' + r.qty + '" data-rate="' + rate + '" data-notes="' + calcEscapeHtml(r.notes || '') + '">';
                html += '<td><input type="checkbox" class="form-check-input est-check" checked></td>';
                html += '<td>' + r.label + (r.notes ? '<div class="text-muted small">' + calcEscapeHtml(r.notes) + '</div>' : '') + '</td>';
                html += '<td>' + calcFormatQuantity(r.qty, r.unit) + '</td>';
                html += '<td class="text-muted">' + r.unit + '</td>';
                html += '<td>' + (rate > 0 ? '$' + rate.toFixed(2) : '<span class="text-muted">-</span>') + '</td>';
                html += '<td>' + (total > 0 ? '$' + total.toFixed(2) : '<span class="text-muted">-</span>') + '</td>';
                html += '</tr>';
            });
            document.getElementById('estResultsBody').innerHTML = html;
            document.getElementById('estSubtotal').textContent = subtotal > 0 ? '$' + subtotal.toFixed(2) : '-';
            document.getElementById('estInputSection').style.display = 'none';
            document.getElementById('estResultsSection').style.display = 'block';
        }

        async function addEstimateToQuote() {
            var roomId = document.getElementById('estTargetRoom').value;
            var roomName = document.getElementById('estResultRoomName').textContent;

            if (roomId === '__new__') {
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
                var item = {
                    category: row.dataset.cat,
                    name: row.dataset.name,
                    description: '',
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
    document.getElementById('drywallResults').classList.add('d-none');
    document.getElementById('drywallAddToQuoteBtn').disabled = true;
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
    var roomName = document.getElementById('drywallRoomName').value || 'Room';
    var totalSqft = wallSqft + (includeCeiling ? ceilingSqft : 0);
    if (totalSqft <= 0) { qdAlert('Please enter valid dimensions or square footage.'); return; }
    var totalWithWaste = totalSqft * (1 + waste / 100);
    var sheets = Math.ceil(totalWithWaste / 32);
    // Standard 3-coat: 4.5 gal bucket covers ~950 sqft total
    // Level 5 finish: 0.05 gal/sqft = 4.5 gal covers ~90 sqft
    var mudBuckets = finishLevel === 'level5' ? Math.ceil(totalWithWaste * 0.05 / 4.5) : Math.ceil(totalWithWaste / 950);
    var tapeRolls = Math.ceil(totalWithWaste / 500);
    var cornerBead = (doors * 2) + (windows * 4) + 2;
    var screwBoxes = Math.ceil(totalWithWaste / 200);
    var txt = '<table class="table table-sm table-bordered mb-0">';
    txt += '<tr><th colspan="2">Drywall Materials &mdash; ' + roomName + ' (' + (finishLevel === 'level5' ? 'Level 5 finish' : 'Standard 3-coat') + ')</th></tr>';
    txt += '<tr><td>Total ' + calcAreaUnit() + ' (with ' + waste + '% waste)</td><td><strong>' + totalWithWaste.toFixed(1) + ' ' + calcAreaUnit() + '</strong> <small class="text-muted">(' + totalSqft.toFixed(1) + ' base)</small></td></tr>';
    txt += '<tr><td>Sheets of 4&times;8 drywall</td><td><strong>' + sheets + ' sheets</strong></td></tr>';
    txt += '<tr><td>Joint compound (4.5 gal buckets)</td><td><strong>' + mudBuckets + ' buckets</strong></td></tr>';
    txt += '<tr><td>Paper tape rolls (500ft)</td><td><strong>' + tapeRolls + ' rolls</strong></td></tr>';
    txt += '<tr><td>Corner bead pieces (8ft)</td><td><strong>' + cornerBead + ' pieces</strong></td></tr>';
    txt += '<tr><td>Drywall screws (1lb boxes)</td><td><strong>' + screwBoxes + ' boxes</strong></td></tr>';
    txt += '</table>';
    document.getElementById('drywallResultText').innerHTML = txt;
    document.getElementById('drywallResults').classList.remove('d-none');
    document.getElementById('drywallAddToQuoteBtn').disabled = false;
    document.getElementById('drywallCalcModal').dataset.calcSqft = totalSqft.toFixed(1);
}

function addToDrywallQuote() {
    var roomName = document.getElementById('drywallRoomName').value || 'Room';
    var totalSqft = parseFloat(document.getElementById('drywallCalcModal').dataset.calcSqft) || 0;
    if (totalSqft <= 0) { qdAlert('Please calculate before adding to quote.'); return; }
    var room = rooms[0];
    if (!room) { qdAlert('Please create a room in the quote first.'); return; }
    room.items.push({ description: 'Drywall Hang \u2014 ' + roomName, category: 'Drywall', unitType: calcAreaUnit(), quantity: totalSqft, rate: 0, total: 0, notes: 'Auto-calculated', itemDescription: '' });
    room.items.push({ description: 'Drywall Mud & Tape \u2014 ' + roomName, category: 'Drywall', unitType: calcAreaUnit(), quantity: totalSqft, rate: 0, total: 0, notes: 'Auto-calculated', itemDescription: '' });
    renderQuote();
    bootstrap.Modal.getInstance(document.getElementById('drywallCalcModal')).hide();
    qdAlert('Drywall items added to quote!');
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
