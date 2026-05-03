// Quote Dr floor plan scanner.
// Extracted from quote-builder.html while preserving the existing global API.

        // -- Floor Plan Scanner ------------------------------------------------------
        var _fpImageBase64 = null;
        var _fpMimeType = 'image/jpeg';
        var _fpImageUrl = null;
        var _fpResults = null;
        var _fpPdfDoc = null;
        var _fpCurrentPage = 1;
        var _fpRooms = [];
        var _fpMapping = null;
        var _fpSuggestedRoomNames = [];
        var _fpCeilingHeight = 9;
        var _fpScale = null;
        var _fpShapes = [];
        var _fpTool = 'calibrate';
        var _fpDraft = null;
        var _fpPolygonDraft = [];
        var _fpCanvas = null;
        var _fpCtx = null;
        var _fpPlanImg = null;
        var _fpGlobalCanvasEventsAttached = false;
        var _fpCanvasPixelRatio = 1;
        var _fpCanvasBaseDisplayWidth = 0;
        var _fpCanvasBaseDisplayHeight = 0;
        var _fpCanvasZoom = 1;
        var _fpCanvasScrollLeft = 0;
        var _fpCanvasScrollTop = 0;
        var _fpCanvasReady = false;
        var _fpMouseDown = false;
        var _fpPanActive = false;
        var _fpPanStarted = false;
        var _fpPanStartX = 0;
        var _fpPanStartY = 0;
        var _fpPanStartScrollLeft = 0;
        var _fpPanStartScrollTop = 0;
        var _fpShapeCounter = 1;
        var _fpActiveShapeIndex = -1;
        var _fpPendingRoomName = '';
        var _fpPendingTrades = {};
        var _fpCalibrationIntroShown = false;

        var _fpTradeConfig = [
            { key: 'flooring',    label: 'Flooring',       icon: 'fa-layer-group',     qtyMode: 'area',      defaultEnabled: true },
            { key: 'drywall',     label: 'Drywall',        icon: 'fa-border-all',      qtyMode: 'wallArea',  defaultEnabled: true },
            { key: 'paint',       label: 'Paint',          icon: 'fa-paint-roller',    qtyMode: 'wallArea',  defaultEnabled: true },
            { key: 'framing',     label: 'Framing',        icon: 'fa-ruler-combined',  qtyMode: 'perimeter', defaultEnabled: true },
            { key: 'tile',        label: 'Tile',           icon: 'fa-th-large',        qtyMode: 'area',      defaultEnabled: true },
            { key: 'trim',        label: 'Trim/Baseboard', icon: 'fa-ruler-horizontal',qtyMode: 'perimeter', defaultEnabled: false },
            { key: 'ceiling',     label: 'Ceiling',        icon: 'fa-square',          qtyMode: 'area',      defaultEnabled: false },
            { key: 'insulation',  label: 'Insulation',     icon: 'fa-temperature-low', qtyMode: 'wallArea',  defaultEnabled: false },
            { key: 'demolition',  label: 'Demolition',     icon: 'fa-hammer',          qtyMode: 'area',      defaultEnabled: false },
            { key: 'doors',       label: 'Doors',          icon: 'fa-door-open',       qtyMode: 'each',      defaultEnabled: false },
            { key: 'windows',     label: 'Windows',        icon: 'fa-table-columns',   qtyMode: 'each',      defaultEnabled: false },
            { key: 'cabinets',    label: 'Cabinets',       icon: 'fa-kitchen-set',     qtyMode: 'perimeter', defaultEnabled: false },
            { key: 'electrical',  label: 'Electrical',     icon: 'fa-bolt',            qtyMode: 'each',      defaultEnabled: false },
            { key: 'plumbing',    label: 'Plumbing',       icon: 'fa-faucet',          qtyMode: 'each',      defaultEnabled: false }
        ];

        function _fpStepBadges(active, labels) {
            return labels.map(function(s, i) {
                return '<span class="badge ' + (i+1 === active ? 'bg-primary' : 'bg-secondary') + ' me-1">' + (i+1) + ' ' + s + '</span>';
            }).join('');
        }

        function _fpEscapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, function(ch) {
                return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
            });
        }

        function _fpRound(value, places) {
            var p = Math.pow(10, places || 1);
            return Math.round((parseFloat(value) || 0) * p) / p;
        }

        function _fpDistance(a, b) {
            var dx = (a.x || 0) - (b.x || 0);
            var dy = (a.y || 0) - (b.y || 0);
            return Math.sqrt(dx * dx + dy * dy);
        }

        function _fpEnsureMapping() {
            if (!_fpMapping || Array.isArray(_fpMapping)) _fpMapping = {};
            if (!_fpMapping.enabledTrades) _fpMapping.enabledTrades = {};
            _fpTradeConfig.forEach(function(tc) {
                if (!Array.isArray(_fpMapping[tc.key])) _fpMapping[tc.key] = [];
                if (_fpMapping.enabledTrades[tc.key] === undefined) {
                    _fpMapping.enabledTrades[tc.key] = tc.defaultEnabled !== false || _fpMapping[tc.key].length > 0;
                }
            });
        }

        function _fpIsTradeEnabled(tradeKey) {
            _fpEnsureMapping();
            return _fpMapping.enabledTrades[tradeKey] !== false;
        }

        function _fpSetTradeEnabled(tradeKey, enabled) {
            _fpEnsureMapping();
            _fpMapping.enabledTrades[tradeKey] = !!enabled;
        }

        function _fpEnabledTradeConfig() {
            _fpEnsureMapping();
            return _fpTradeConfig.filter(function(tc) { return _fpIsTradeEnabled(tc.key); });
        }

        function _fpSetupTradeToggleHtml(tc) {
            var checked = _fpIsTradeEnabled(tc.key) ? ' checked' : '';
            return '<div class="form-check form-switch mb-2 p-2 border rounded bg-light">' +
                '<input class="form-check-input" type="checkbox" role="switch" id="fpTradeEnabled_' + tc.key + '"' + checked + ' onchange="_fpSetTradeEnabled(\'' + tc.key + '\',this.checked)">' +
                '<label class="form-check-label small" for="fpTradeEnabled_' + tc.key + '">Show ' + _fpEscapeHtml(tc.label) + ' in the measuring panel</label>' +
                '</div>';
        }

        function _fpAllItems() {
            var all = [];
            var seen = {};
            var db = (typeof customItems === 'object') ? customItems : {};
            for (var cat in db) {
                if (!db.hasOwnProperty(cat) || !Array.isArray(db[cat])) continue;
                db[cat].forEach(function(item) {
                    if (!item || !item.name) return;
                    var key = cat + '||' + item.name;
                    if (!seen[key]) {
                        seen[key] = true;
                        all.push({ category: cat, name: item.name, unitType: item.unitType || 'sqft', rate: item.rate || 0, materialCost: item.materialCost || 0 });
                    }
                });
            }
            return all;
        }

        function openFloorPlanModal() {
            _fpImageBase64 = null; _fpMimeType = 'image/jpeg'; _fpImageUrl = null; _fpResults = null; _fpRooms = [];
            _fpSuggestedRoomNames = []; _fpCeilingHeight = 9; _fpScale = null; _fpShapes = []; _fpDraft = null; _fpPolygonDraft = [];
            _fpCanvasReady = false; _fpCanvasZoom = 1; _fpCanvasScrollLeft = 0; _fpCanvasScrollTop = 0; _fpTool = 'calibrate'; _fpShapeCounter = 1; _fpActiveShapeIndex = -1; _fpPendingRoomName = ''; _fpPendingTrades = {}; _fpCalibrationIntroShown = false;
            var modal = new bootstrap.Modal(document.getElementById('floorPlanModal'));
            modal.show();
            setTimeout(_fpMaybeShowIntroPopup, 250);
            _supabase.auth.getUser().then(function(r) {
                var uid = r.data && r.data.user ? r.data.user.id : null;
                if (!uid) { _fpRenderSetup(1); return; }
                _supabase.from('user_data').select('value').eq('user_id', uid).eq('key', 'fp_scanner_mapping').maybeSingle()
                    .then(function(res) {
                        if (res.data && res.data.value) {
                            try { _fpMapping = typeof res.data.value === 'string' ? JSON.parse(res.data.value) : res.data.value; }
                            catch(e) { _fpMapping = null; }
                        }
                        if (!_fpMapping) { _fpRenderSetup(1); } else { _fpRenderStep1(); }
                    }).catch(function() { _fpRenderSetup(1); });
            });
        }

        function openFpScannerSetup() {
            var modal = new bootstrap.Modal(document.getElementById('floorPlanModal'));
            modal.show();
            _fpRenderSetup(1);
        }

        function _fpMaybeShowIntroPopup() {
            if (localStorage.getItem('fp_scanner_intro_hidden') === '1') return;
            if (document.getElementById('fpIntroOverlay')) return;
            var overlay = document.createElement('div');
            overlay.id = 'fpIntroOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;';
            overlay.innerHTML =
                '<div style="background:white;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,0.28);max-width:520px;width:100%;overflow:hidden;">' +
                '<div style="background:#1f5ea8;color:white;padding:14px 18px;font-weight:700;"><i class="fas fa-drafting-compass me-2"></i>Floor Plan Scanner Flow</div>' +
                '<div style="padding:18px;">' +
                '<ol class="mb-3 ps-3">' +
                '<li class="mb-2">Set the scale by drawing over a known dimension and entering the real feet.</li>' +
                '<li class="mb-2">Pick a room name or type your own.</li>' +
                '<li class="mb-2">Choose the line items you want calculated for that room.</li>' +
                '<li class="mb-2">Measure with a line, box, or polygon. Click a saved measurement later to edit it.</li>' +
                '<li>When all rooms look right, hit Review and add the quantities to the quote.</li>' +
                '</ol>' +
                '<div class="d-flex align-items-center justify-content-between gap-3">' +
                '<button class="btn btn-primary" onclick="_fpCloseIntroPopup()"><i class="fas fa-check me-1"></i>Got it</button>' +
                '<label class="form-check-label small text-muted ms-auto"><input class="form-check-input me-1" type="checkbox" id="fpIntroDontShow"> Do not show this message again</label>' +
                '</div>' +
                '</div></div>';
            document.body.appendChild(overlay);
        }

        function _fpCloseIntroPopup() {
            var dontShow = document.getElementById('fpIntroDontShow');
            if (dontShow && dontShow.checked) localStorage.setItem('fp_scanner_intro_hidden', '1');
            var overlay = document.getElementById('fpIntroOverlay');
            if (overlay) overlay.remove();
        }

        var _fpSetupCurrent = 1;

        function _fpRenderSetup(step) {
            _fpSetupCurrent = step;
            _fpEnsureMapping();
            var tc = _fpTradeConfig[step-1];
            var stepLabels = _fpTradeConfig.map(function(t) { return t.label; });
            var isLast = step === _fpTradeConfig.length;

            document.getElementById('floorPlanModalBody').innerHTML =
                '<div class="d-flex justify-content-center gap-1 mb-3">' + _fpStepBadges(step, stepLabels) + '</div>' +
                '<h5><i class="fas ' + tc.icon + ' me-2 text-primary"></i>' + tc.label + ' - link your line items</h5>' +
                '<p class="text-muted small">Select all items you use for ' + tc.label.toLowerCase() + '. You can link multiple supply and labor items.</p>' +
                _fpSetupTradeToggleHtml(tc) +
                '<input type="text" class="form-control form-control-sm mb-2" id="fpSetupSearch" placeholder="Search items..." oninput="_fpSetupRenderList(' + step + ')">' +
                '<div id="fpSetupList" style="max-height:calc(100vh - 340px);overflow-y:auto;border:1px solid #dee2e6;border-radius:8px;padding:8px;"></div>' +
                '<p class="text-muted small mt-3"><i class="fas fa-info-circle me-1"></i>These settings can be changed later in <strong>Settings &rarr; Floor Plan Scanner</strong></p>' +
                '<div class="d-flex justify-content-between mt-3">' +
                (step > 1 ? '<button class="btn btn-outline-secondary" onclick="_fpRenderSetup(' + (step-1) + ')"><i class="fas fa-arrow-left me-1"></i>Back</button>' : '<div></div>') +
                (isLast
                    ? '<button class="btn btn-success" onclick="_fpSetupSave()"><i class="fas fa-check me-1"></i>Save &amp; Start</button>'
                    : '<button class="btn btn-primary" onclick="_fpRenderSetup(' + (step+1) + ')">Next <i class="fas fa-arrow-right ms-1"></i></button>') +
                '</div>';
            _fpSetupRenderList(step);
        }

        function _fpSetupRenderList(step) {
            _fpEnsureMapping();
            var tc = _fpTradeConfig[step-1];
            var filter = (document.getElementById('fpSetupSearch') ? document.getElementById('fpSetupSearch').value : '').toLowerCase();
            var linked = (_fpMapping[tc.key] || []).map(function(i) { return i.category + '||' + i.name; });
            var items = _fpAllItems().filter(function(i) {
                return !filter || (i.name + ' ' + i.category).toLowerCase().indexOf(filter) >= 0;
            });
            items.sort(function(a, b) {
                var aL = linked.indexOf(a.category+'||'+a.name) >= 0;
                var bL = linked.indexOf(b.category+'||'+b.name) >= 0;
                return aL === bL ? 0 : aL ? -1 : 1;
            });
            var html = items.map(function(item) {
                var key = item.category + '||' + item.name;
                var chk = linked.indexOf(key) >= 0 ? ' checked' : '';
                var safeKey = key.replace(/'/g, "\\'");
                return '<div class="d-flex align-items-center gap-2 py-1 border-bottom">' +
                    '<input type="checkbox" class="form-check-input"' + chk + ' onchange="_fpSetupToggle(\'' + tc.key + '\',\'' + safeKey + '\',this.checked)">' +
                    '<span class="badge bg-light text-dark me-1" style="font-size:0.7rem;">' + _fpEscapeHtml(item.category) + '</span>' +
                    '<span class="small flex-grow-1">' + _fpEscapeHtml(item.name) + '</span>' +
                    '<span class="text-muted small">$' + (item.rate||0) + '/' + _fpEscapeHtml(item.unitType||'sqft') + '</span>' +
                    '</div>';
            }).join('');
            document.getElementById('fpSetupList').innerHTML = html || '<p class="text-muted small p-2">No items found. Add items in the quote builder first.</p>';
        }

        function _fpSetupToggle(tradeKey, itemKey, checked) {
            _fpEnsureMapping();
            if (!_fpMapping[tradeKey]) _fpMapping[tradeKey] = [];
            var parts = itemKey.split('||');
            var cat = parts[0], name = parts.slice(1).join('||');
            if (checked) {
                var item = _fpAllItems().find(function(i) { return i.category === cat && i.name === name; });
                if (item && !_fpMapping[tradeKey].find(function(i) { return i.category === cat && i.name === name; })) {
                    _fpMapping[tradeKey].push(item);
                }
            } else {
                _fpMapping[tradeKey] = _fpMapping[tradeKey].filter(function(i) { return !(i.category === cat && i.name === name); });
            }
        }

        function _fpSetupSave() {
            _supabase.auth.getUser().then(function(r) {
                var uid = r.data && r.data.user ? r.data.user.id : null;
                _fpEnsureMapping();
                if (!uid) { _fpRenderStep1(); return; }
                _supabase.from('user_data').upsert(
                    { user_id: uid, key: 'fp_scanner_mapping', value: _fpMapping, updated_at: new Date().toISOString() },
                    { onConflict: 'user_id,key' }
                ).then(function() { _fpRenderStep1(); });
            });
        }

        function _fpRenderStep1() {
            document.getElementById('floorPlanModalBody').innerHTML =
                '<div class="text-center mb-3">' +
                '<div class="d-flex justify-content-center gap-1 mb-3">' + _fpStepBadges(1, ['Upload','Calibrate','Review']) + '</div>' +
                '<p class="text-muted small">Upload a floor plan, then calibrate the scale from one known dimension. AI will only suggest room names.</p>' +
                '</div>' +
                '<div id="fpDropZone" onclick="document.getElementById(\'fpFileInput\').click()" style="border:2px dashed #1a56a0;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;background:#f8f9ff;" ondragover="event.preventDefault();this.style.background=\'#e8f0ff\'" ondragleave="this.style.background=\'#f8f9ff\'" ondrop="event.preventDefault();_fpHandleFile(event.dataTransfer.files[0])">' +
                '<i class="fas fa-cloud-upload-alt fa-3x mb-3" style="color:#1a56a0;"></i>' +
                '<div class="fw-semibold">Click or drag &amp; drop your floor plan</div>' +
                '<div class="text-muted small mt-1">Supports JPG, PNG, WebP, PDF</div>' +
                '<input type="file" id="fpFileInput" accept="image/*,application/pdf" style="display:none" onchange="_fpHandleFile(this.files[0])">' +
                '</div>' +
                '<div id="fpPreviewArea" style="display:none;" class="mt-3 text-center">' +
                '<img id="fpPreviewImg" style="max-width:100%;max-height:min(68vh,760px);width:auto;height:auto;object-fit:contain;border-radius:8px;border:1px solid #dee2e6;" alt="Floor plan preview">' +
                '<div class="mt-2 text-success small" id="fpPreviewLabel"></div>' +
                '<div id="fpPagePicker" style="display:none;" class="mt-2 d-flex align-items-center justify-content-center gap-2">' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="_fpChangePage(-1)"><i class="fas fa-chevron-left"></i></button>' +
                '<span class="small">Page</span>' +
                '<input type="number" id="fpPageInput" class="form-control form-control-sm text-center" style="width:60px;" min="1" value="1" onchange="_fpChangePage(0, parseInt(this.value))">' +
                '<span class="small" id="fpPageTotal">of ?</span>' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="_fpChangePage(1)"><i class="fas fa-chevron-right"></i></button>' +
                '</div>' +
                '</div>' +
                '<div id="fpStep1Error" class="alert alert-danger mt-3" style="display:none;"></div>' +
                '<div class="d-flex justify-content-between mt-3">' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="openFpScannerSetup()"><i class="fas fa-cog me-1"></i>Reconfigure items</button>' +
                '<button class="btn btn-primary" id="fpNext1Btn" onclick="_fpGoToMeasureTool()" disabled>Measure <i class="fas fa-ruler-combined ms-1"></i></button>' +
                '</div>';
        }

        async function _fpHandleFile(file) {
            if (!file) return;
            var errEl = document.getElementById('fpStep1Error');
            errEl.style.display = 'none';
            if (file.type === 'application/pdf') {
                try {
                    if (!window.pdfjsLib) {
                        await new Promise(function(resolve, reject) {
                            var s = document.createElement('script');
                            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                            s.onload = resolve; s.onerror = reject;
                            document.head.appendChild(s);
                        });
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    }
                    var arrayBuffer = await file.arrayBuffer();
                    _fpPdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    _fpCurrentPage = 1;
                    _fpCanvasZoom = 1; _fpCanvasScrollLeft = 0; _fpCanvasScrollTop = 0;
                    await _fpRenderPdfPage(_fpCurrentPage);
                    document.getElementById('fpPreviewArea').style.display = '';
                    document.getElementById('fpNext1Btn').disabled = false;
                    return;
                } catch(e) {
                    errEl.textContent = 'Could not read PDF: ' + e.message;
                    errEl.style.display = ''; return;
                }
            } else if (file.type.startsWith('image/')) {
                _fpMimeType = file.type;
                var reader = new FileReader();
                reader.onload = function(e) {
                    _fpImageUrl = e.target.result;
                    _fpImageBase64 = _fpImageUrl.split(',')[1];
                    _fpCanvasZoom = 1; _fpCanvasScrollLeft = 0; _fpCanvasScrollTop = 0;
                    document.getElementById('fpPreviewImg').src = _fpImageUrl;
                    document.getElementById('fpPreviewLabel').textContent = file.name + ' ready';
                    document.getElementById('fpPreviewArea').style.display = '';
                    document.getElementById('fpNext1Btn').disabled = false;
                };
                reader.readAsDataURL(file); return;
            } else {
                errEl.textContent = 'Please upload an image or PDF.';
                errEl.style.display = ''; return;
            }
        }

        async function _fpRenderPdfPage(pageNum) {
            if (!_fpPdfDoc) return;
            var page = await _fpPdfDoc.getPage(pageNum);
            var baseViewport = page.getViewport({ scale: 1 });
            var desiredScale = Math.min(4, Math.max(2.5, (window.devicePixelRatio || 1) * 2));
            var maxRenderSide = 4096;
            var renderScale = Math.max(1.5, Math.min(desiredScale, maxRenderSide / Math.max(baseViewport.width, baseViewport.height)));
            var viewport = page.getViewport({ scale: renderScale });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            _fpImageUrl = canvas.toDataURL('image/jpeg', 0.96);
            _fpImageBase64 = _fpImageUrl.split(',')[1]; _fpMimeType = 'image/jpeg';
            var imgEl = document.getElementById('fpPreviewImg');
            var labelEl = document.getElementById('fpPreviewLabel');
            var pickerEl = document.getElementById('fpPagePicker');
            var pageInput = document.getElementById('fpPageInput');
            var pageTotalEl = document.getElementById('fpPageTotal');
            if (imgEl) imgEl.src = _fpImageUrl;
            if (labelEl) labelEl.textContent = 'Page ' + pageNum + ' of ' + _fpPdfDoc.numPages + ' ready';
            if (pickerEl) pickerEl.style.display = _fpPdfDoc.numPages > 1 ? 'flex' : 'none';
            if (pageInput) { pageInput.value = pageNum; pageInput.max = _fpPdfDoc.numPages; }
            if (pageTotalEl) pageTotalEl.textContent = 'of ' + _fpPdfDoc.numPages;
        }

        async function _fpChangePage(delta, absolute) {
            if (!_fpPdfDoc) return;
            var newPage = absolute !== undefined ? Math.max(1, Math.min(_fpPdfDoc.numPages, absolute)) : Math.max(1, Math.min(_fpPdfDoc.numPages, _fpCurrentPage + delta));
            if (newPage === _fpCurrentPage && absolute === undefined) return;
            _fpCurrentPage = newPage;
            _fpCanvasZoom = 1; _fpCanvasScrollLeft = 0; _fpCanvasScrollTop = 0;
            var labelEl = document.getElementById('fpPreviewLabel');
            if (labelEl) labelEl.textContent = 'Loading page ' + newPage + '...';
            await _fpRenderPdfPage(newPage);
        }

        async function _fpGoToMeasureTool() {
            if (!_fpImageBase64 || !_fpImageUrl) return;
            _fpRenderMeasureTool();
            _fpLoadCanvas();
            _fpLoadRoomSuggestions();
        }

        function _fpToolLabel() {
            if (_fpTool === 'calibrate') return 'Draw over a known dimension, then enter its real length.';
            if (_fpTool === 'line') return 'Drag a line for linear footage.';
            if (_fpTool === 'box') return 'Drag a rectangle around a room.';
            return 'Click room corners, then finish the polygon.';
        }

        function _fpRenderMeasureTool() {
            var oldCanvasWrap = document.getElementById('fpMeasureCanvasWrap');
            if (oldCanvasWrap) {
                _fpCanvasScrollLeft = oldCanvasWrap.scrollLeft || 0;
                _fpCanvasScrollTop = oldCanvasWrap.scrollTop || 0;
            }
            var state = _fpCurrentFormState();
            var selectedName = state.name || '';
            var selectedFromList = _fpSuggestedRoomNames.indexOf(selectedName) >= 0;
            var nameOptions = _fpSuggestedRoomNames.map(function(n) {
                return '<option value="' + _fpEscapeHtml(n) + '"' + (selectedName === n ? ' selected' : '') + '>' + _fpEscapeHtml(n) + '</option>';
            }).join('');
            var activeTrades = _fpTradeConfig.filter(function(tc) { return _fpIsTradeEnabled(tc.key) && _fpMapping && _fpMapping[tc.key] && _fpMapping[tc.key].length > 0; });
            var tradeControls = activeTrades.map(function(tc) {
                var selectedTrade = (state.trades && state.trades[tc.key]) || '';
                var opts = '<option value="">Skip</option>' + (_fpMapping[tc.key] || []).map(function(item) {
                    return '<option value="' + _fpEscapeHtml(item.name) + '"' + (selectedTrade === item.name ? ' selected' : '') + '>' + _fpEscapeHtml(item.name) + '</option>';
                }).join('');
                return '<label class="form-label small mb-1"><i class="fas ' + tc.icon + ' me-1"></i>' + tc.label + '</label><select class="form-select form-select-sm mb-2" id="fpTrade_' + tc.key + '" onchange="_fpSaveMeasureForm()">' + opts + '</select>';
            }).join('');
            var scaleText = _fpScale ? (_fpRound(_fpScale.pxPerFt, 2) + ' px/ft') : 'Not calibrated';
            var editorTitle = _fpActiveShapeIndex >= 0 && _fpShapes[_fpActiveShapeIndex] ? 'Editing: ' + _fpEscapeHtml(_fpShapes[_fpActiveShapeIndex].name) : 'New Measurement';
            document.getElementById('floorPlanModalBody').innerHTML =
                '<div class="d-flex justify-content-center gap-1 mb-2">' + _fpStepBadges(2, ['Upload','Calibrate','Review']) + '</div>' +
                '<div class="row g-2" style="height:calc(100vh - 138px);">' +
                '<div class="col-lg-8 d-flex flex-column" style="min-height:420px;">' +
                '<div class="d-flex flex-wrap align-items-center gap-1 mb-2">' +
                _fpToolButton('calibrate', 'fa-arrows-left-right', 'Scale') +
                _fpToolButton('line', 'fa-ruler-horizontal', 'Line') +
                _fpToolButton('box', 'fa-vector-square', 'Box') +
                _fpToolButton('polygon', 'fa-draw-polygon', 'Polygon') +
                '<div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Zoom controls">' +
                '<button class="btn btn-outline-secondary" onclick="_fpZoomCanvasButton(0.85)" title="Zoom out"><i class="fas fa-magnifying-glass-minus"></i></button>' +
                '<button class="btn btn-outline-secondary" onclick="_fpResetCanvasZoom()" title="Reset zoom"><span id="fpZoomBadge">' + Math.round((_fpCanvasZoom || 1) * 100) + '%</span></button>' +
                '<button class="btn btn-outline-secondary" onclick="_fpZoomCanvasButton(1.18)" title="Zoom in"><i class="fas fa-magnifying-glass-plus"></i></button>' +
                '</div>' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="_fpUndoShape()" title="Undo"><i class="fas fa-undo"></i></button>' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="_fpClearShapes()" title="Clear"><i class="fas fa-trash"></i></button>' +
                '<button class="btn btn-outline-primary btn-sm" onclick="_fpFinishPolygon()" id="fpFinishPolyBtn"><i class="fas fa-check me-1"></i>Finish Polygon</button>' +
                '</div>' +
                '<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">' +
                '<div class="small text-muted" id="fpToolHelp">' + _fpToolLabel() + '</div>' +
                '<div class="small text-primary fw-semibold" id="fpPanHint" style="display:' + ((_fpCanvasZoom || 1) > 1.01 ? 'block' : 'none') + ';"><i class="fas fa-hand me-1"></i>Right-click + drag to pan</div>' +
                '</div>' +
                '<div id="fpMeasureCanvasWrap" style="flex:1;overflow:auto;border:1px solid #ced4da;border-radius:8px;background:#f8f9fa;">' +
                '<canvas id="fpMeasureCanvas" style="display:block;max-width:none;cursor:crosshair;user-select:none;"></canvas>' +
                '</div>' +
                '</div>' +
                '<div class="col-lg-4 d-flex flex-column">' +
                '<div class="border rounded p-2 mb-2" id="fpScalePanel">' +
                '<div class="d-flex align-items-center justify-content-between mb-2"><strong class="small">Scale</strong><span class="badge bg-light text-dark">' + _fpEscapeHtml(scaleText) + '</span></div>' +
                '<label class="form-label small mb-1">Known line length in feet</label>' +
                '<div class="input-group input-group-sm"><input type="number" id="fpKnownLength" class="form-control" min="0.1" step="0.1" placeholder="e.g. 12"><span class="input-group-text">ft</span><button class="btn btn-primary" onclick="_fpApplyScale()">Set</button></div>' +
                '<div class="small fw-semibold mt-2" id="fpKnownLengthCue" style="display:none;color:#b45309;"><i class="fas fa-arrow-up me-1"></i>This is where you put the known feet, then press Set.</div>' +
                '<div class="text-muted small mt-1">Use the Scale tool on a labeled dimension first.</div>' +
                '</div>' +
                '<div class="border rounded p-2 mb-2">' +
                '<div class="d-flex align-items-center justify-content-between mb-2"><strong class="small">' + editorTitle + '</strong><button class="btn btn-outline-secondary btn-sm" onclick="_fpNewMeasurement()"><i class="fas fa-plus me-1"></i>New</button></div>' +
                '<label class="form-label small mb-1">Room name</label>' +
                '<select class="form-select form-select-sm mb-2" id="fpRoomNameSelect" onchange="_fpRoomNameSelectChanged()"><option value="">Custom room</option>' + nameOptions + '</select>' +
                '<input type="text" class="form-control form-control-sm mb-2" id="fpRoomNameCustom" value="' + _fpEscapeHtml(selectedFromList ? '' : selectedName) + '" placeholder="Room name" oninput="_fpSaveMeasureForm()">' +
                '<label class="form-label small mb-1">Ceiling height</label>' +
                '<div class="input-group input-group-sm mb-2"><input type="number" id="fpCeilingHeight" class="form-control" value="' + _fpCeilingHeight + '" min="6" max="20" step="0.5" oninput="_fpCeilingHeight=parseFloat(this.value)||9"><span class="input-group-text">ft</span></div>' +
                (tradeControls || '<div class="text-muted small">No linked line items yet. Reconfigure items to auto-create quote rows.</div>') +
                '<button class="btn btn-outline-secondary btn-sm w-100 mt-1" onclick="_fpApplyTradesAll()"><i class="fas fa-copy me-1"></i>Apply First Selection To All</button>' +
                '</div>' +
                '<div class="border rounded p-2 flex-grow-1" style="overflow:auto;">' +
                '<div class="d-flex align-items-center justify-content-between mb-2"><strong class="small">Measurements</strong><span class="badge bg-primary">' + _fpShapes.length + '</span></div>' +
                '<div id="fpMeasurementsList">' + _fpMeasurementsHtml() + '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="d-flex justify-content-between mt-2">' +
                '<button class="btn btn-outline-secondary" onclick="_fpRenderStep1()"><i class="fas fa-arrow-left me-1"></i>Back</button>' +
                '<button class="btn btn-primary" onclick="_fpGoToStep3()" ' + (_fpShapes.length ? '' : 'disabled') + '>Review <i class="fas fa-arrow-right ms-1"></i></button>' +
                '</div>';
            setTimeout(function() { _fpLoadCanvas(); _fpMaybeShowCalibrationPopup(); }, 0);
        }

        function _fpToolButton(tool, icon, label) {
            return '<button class="btn btn-' + (_fpTool === tool ? 'primary' : 'outline-primary') + ' btn-sm" onclick="_fpSetTool(\'' + tool + '\')" title="' + _fpEscapeHtml(label) + '"><i class="fas ' + icon + ' me-1"></i>' + label + '</button>';
        }

        function _fpSetTool(tool) {
            _fpTool = tool;
            _fpDraft = null;
            if (tool !== 'polygon') _fpPolygonDraft = [];
            _fpRenderMeasureTool();
        }

        function _fpMeasurementsHtml() {
            if (!_fpShapes.length) return '<div class="text-muted small">No measurements yet.</div>';
            return _fpShapes.map(function(shape, i) {
                var d = shape.dimensions || {};
                var metric = _fpMeasurementSummary(shape);
                var active = i === _fpActiveShapeIndex;
                return '<div class="border-bottom py-2 small' + (active ? ' bg-light' : '') + '" style="cursor:pointer;" onclick="_fpSelectShape(' + i + ')">' +
                    '<div class="d-flex align-items-center gap-2"><strong class="flex-grow-1">' + _fpEscapeHtml(shape.name) + '</strong><span class="badge bg-light text-dark">' + _fpEscapeHtml(shape.type) + '</span><button class="btn btn-link text-danger p-0" onclick="event.stopPropagation();_fpRemoveShape(' + i + ')"><i class="fas fa-times"></i></button></div>' +
                    '<div class="text-muted">' + metric + '</div>' +
                    '</div>';
            }).join('');
        }

        function _fpMeasurementSummary(shape) {
            var d = shape.dimensions || {};
            if (shape.type === 'line') return _fpRound(d.length, 1) + ' LF';
            return _fpRound(d.length, 1) + ' ft x ' + _fpRound(d.width, 1) + ' ft | ' + _fpRound(d.area, 1) + ' sqft | ' + _fpRound(d.perimeter, 1) + ' LF';
        }

        function _fpRoomNameSelectChanged() {
            var select = document.getElementById('fpRoomNameSelect');
            var custom = document.getElementById('fpRoomNameCustom');
            if (select && custom && select.value) custom.value = '';
            _fpSaveMeasureForm();
        }

        function _fpCurrentFormState() {
            var shape = _fpActiveShapeIndex >= 0 ? _fpShapes[_fpActiveShapeIndex] : null;
            return shape || { name: _fpPendingRoomName, trades: _fpPendingTrades };
        }

        function _fpSaveMeasureForm() {
            var custom = document.getElementById('fpRoomNameCustom');
            var select = document.getElementById('fpRoomNameSelect');
            var name = (custom && custom.value.trim()) || (select && select.value) || '';
            var trades = {};
            _fpEnabledTradeConfig().forEach(function(tc) {
                var el = document.getElementById('fpTrade_' + tc.key);
                if (el && el.value) trades[tc.key] = el.value;
            });
            var ceiling = document.getElementById('fpCeilingHeight');
            if (ceiling) _fpCeilingHeight = parseFloat(ceiling.value) || _fpCeilingHeight || 9;
            if (_fpActiveShapeIndex >= 0 && _fpShapes[_fpActiveShapeIndex]) {
                _fpShapes[_fpActiveShapeIndex].name = name || _fpShapes[_fpActiveShapeIndex].name || ('Room ' + (_fpActiveShapeIndex + 1));
                _fpShapes[_fpActiveShapeIndex].trades = trades;
            } else {
                _fpPendingRoomName = name;
                _fpPendingTrades = trades;
            }
        }

        function _fpNewMeasurement() {
            _fpSaveMeasureForm();
            _fpActiveShapeIndex = -1;
            _fpPendingRoomName = '';
            _fpPendingTrades = {};
            _fpRenderMeasureTool();
        }

        function _fpSelectShape(index) {
            _fpSaveMeasureForm();
            _fpActiveShapeIndex = index;
            _fpRenderMeasureTool();
        }

        function _fpSelectedRoomName() {
            _fpSaveMeasureForm();
            return _fpPendingRoomName || ('Room ' + _fpShapeCounter);
        }

        function _fpSelectedTrades() {
            _fpSaveMeasureForm();
            return Object.assign({}, _fpPendingTrades);
        }

        function _fpLoadCanvas() {
            _fpCanvas = document.getElementById('fpMeasureCanvas');
            if (!_fpCanvas || !_fpImageUrl) return;
            _fpCtx = _fpCanvas.getContext('2d');
            _fpPlanImg = new Image();
            _fpPlanImg.onload = function() {
                var parentW = (_fpCanvas.parentElement ? _fpCanvas.parentElement.clientWidth : 900) - 4;
                var maxDisplayW = Math.min(1600, Math.max(860, parentW));
                var displayScale = Math.min(1, maxDisplayW / _fpPlanImg.naturalWidth);
                var displayW = Math.max(1, Math.round(_fpPlanImg.naturalWidth * displayScale));
                var displayH = Math.max(1, Math.round(_fpPlanImg.naturalHeight * displayScale));
                _fpCanvasBaseDisplayWidth = displayW;
                _fpCanvasBaseDisplayHeight = displayH;
                _fpCanvas.width = Math.max(1, Math.round(_fpPlanImg.naturalWidth));
                _fpCanvas.height = Math.max(1, Math.round(_fpPlanImg.naturalHeight));
                _fpApplyCanvasZoom(_fpCanvasZoom || 1);
                if (_fpCanvas.parentElement) {
                    _fpCanvas.parentElement.scrollLeft = _fpCanvasScrollLeft || 0;
                    _fpCanvas.parentElement.scrollTop = _fpCanvasScrollTop || 0;
                }
                _fpCanvasReady = true;
                _fpAttachCanvasEvents();
                _fpDrawCanvas();
            };
            _fpPlanImg.src = _fpImageUrl;
        }

        function _fpAttachCanvasEvents() {
            if (!_fpCanvas || _fpCanvas._fpEventsAttached) return;
            _fpCanvas._fpEventsAttached = true;
            _fpCanvas.addEventListener('mousedown', _fpCanvasDown);
            _fpCanvas.addEventListener('mousemove', _fpCanvasMove);
            _fpCanvas.addEventListener('wheel', _fpCanvasWheel, { passive: false });
            _fpCanvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
            if (!_fpGlobalCanvasEventsAttached) {
                _fpGlobalCanvasEventsAttached = true;
                window.addEventListener('mousemove', _fpCanvasMove);
                window.addEventListener('mouseup', _fpCanvasUp);
            }
            _fpCanvas.addEventListener('dblclick', function(e) {
                if (_fpTool === 'polygon') { e.preventDefault(); _fpFinishPolygon(); }
            });
        }

        function _fpClampZoom(value) {
            return Math.max(1, Math.min(5, value || 1));
        }

        function _fpApplyCanvasZoom(zoom) {
            if (!_fpCanvas || !_fpCanvasBaseDisplayWidth || !_fpCanvasBaseDisplayHeight) return;
            _fpCanvasZoom = _fpClampZoom(zoom);
            var displayW = Math.round(_fpCanvasBaseDisplayWidth * _fpCanvasZoom);
            var displayH = Math.round(_fpCanvasBaseDisplayHeight * _fpCanvasZoom);
            _fpCanvas.style.width = displayW + 'px';
            _fpCanvas.style.height = displayH + 'px';
            _fpCanvasPixelRatio = _fpCanvas.width / Math.max(1, displayW);
            var badge = document.getElementById('fpZoomBadge');
            if (badge) badge.textContent = Math.round(_fpCanvasZoom * 100) + '%';
            var hint = document.getElementById('fpPanHint');
            if (hint) hint.style.display = _fpCanvasZoom > 1.01 ? 'block' : 'none';
            _fpUpdateCanvasCursor();
        }

        function _fpZoomCanvasAt(nextZoom, clientX, clientY) {
            if (!_fpCanvas || !_fpCanvas.parentElement) return;
            var wrap = _fpCanvas.parentElement;
            var canvasRect = _fpCanvas.getBoundingClientRect();
            var wrapRect = wrap.getBoundingClientRect();
            var ratioX = canvasRect.width ? (clientX - canvasRect.left) / canvasRect.width : 0.5;
            var ratioY = canvasRect.height ? (clientY - canvasRect.top) / canvasRect.height : 0.5;
            _fpApplyCanvasZoom(nextZoom);
            var newW = _fpCanvasBaseDisplayWidth * _fpCanvasZoom;
            var newH = _fpCanvasBaseDisplayHeight * _fpCanvasZoom;
            wrap.scrollLeft = Math.max(0, ratioX * newW - (clientX - wrapRect.left));
            wrap.scrollTop = Math.max(0, ratioY * newH - (clientY - wrapRect.top));
            _fpCanvasScrollLeft = wrap.scrollLeft;
            _fpCanvasScrollTop = wrap.scrollTop;
            _fpDrawCanvas();
        }

        function _fpCanvasWheel(e) {
            if (!_fpCanvasReady) return;
            e.preventDefault();
            var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            _fpZoomCanvasAt((_fpCanvasZoom || 1) * factor, e.clientX, e.clientY);
        }

        function _fpZoomCanvasButton(factor) {
            if (!_fpCanvas || !_fpCanvas.parentElement) return;
            var rect = _fpCanvas.parentElement.getBoundingClientRect();
            _fpZoomCanvasAt((_fpCanvasZoom || 1) * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }

        function _fpResetCanvasZoom() {
            _fpCanvasZoom = 1;
            _fpCanvasScrollLeft = 0;
            _fpCanvasScrollTop = 0;
            _fpApplyCanvasZoom(1);
            if (_fpCanvas && _fpCanvas.parentElement) {
                _fpCanvas.parentElement.scrollLeft = 0;
                _fpCanvas.parentElement.scrollTop = 0;
            }
            _fpDrawCanvas();
        }

        function _fpUpdateCanvasCursor() {
            if (!_fpCanvas) return;
            if (_fpPanActive) _fpCanvas.style.cursor = 'grabbing';
            else _fpCanvas.style.cursor = 'crosshair';
        }

        function _fpEnsureScaleCueStyle() {
            if (document.getElementById('fpScaleCueStyle')) return;
            var style = document.createElement('style');
            style.id = 'fpScaleCueStyle';
            style.textContent = '@keyframes fpScaleCuePulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0);transform:translateX(0)}18%{box-shadow:0 0 0 4px rgba(245,158,11,.35);transform:translateX(-4px)}36%{transform:translateX(4px)}54%{transform:translateX(-3px)}72%{transform:translateX(3px)}}.fp-scale-cue{animation:fpScaleCuePulse 1.1s ease-in-out 0s 3;border-color:#f59e0b!important;background:#fffbeb!important;}';
            document.head.appendChild(style);
        }

        function _fpPromptKnownLength() {
            _fpEnsureScaleCueStyle();
            var panel = document.getElementById('fpScalePanel');
            var input = document.getElementById('fpKnownLength');
            var cue = document.getElementById('fpKnownLengthCue');
            if (cue) cue.style.display = 'block';
            if (panel) {
                panel.classList.remove('fp-scale-cue');
                void panel.offsetWidth;
                panel.classList.add('fp-scale-cue');
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            if (input) {
                setTimeout(function() { input.focus(); input.select(); }, 120);
            }
        }

        function _fpMaybeShowCalibrationPopup() {
            if (_fpScale || localStorage.getItem('fp_calibration_intro_hidden') === '1') return;
            if (_fpCalibrationIntroShown) return;
            if (document.getElementById('fpCalibrationIntroOverlay')) return;
            _fpCalibrationIntroShown = true;
            var overlay = document.createElement('div');
            overlay.id = 'fpCalibrationIntroOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.38);z-index:20001;display:flex;align-items:center;justify-content:center;padding:18px;';
            overlay.innerHTML =
                '<div style="background:white;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,0.25);max-width:560px;width:100%;overflow:hidden;">' +
                '<div style="background:#1f5ea8;color:white;padding:14px 18px;font-weight:700;"><i class="fas fa-ruler-combined me-2"></i>Calibrate the scale first</div>' +
                '<div style="padding:18px;">' +
                '<p class="mb-3">Trace a dimension you know the length of as accurately as possible, then type it into the <strong>Known line length in feet</strong> field on the right.</p>' +
                '<p class="text-muted small mb-3">Tip: zoom with your mouse wheel, then right-click and drag to move around while zoomed in.</p>' +
                '<div class="d-flex align-items-center justify-content-between gap-3">' +
                '<button class="btn btn-primary" onclick="_fpCloseCalibrationPopup()"><i class="fas fa-check me-1"></i>Got it</button>' +
                '<label class="form-check-label small text-muted ms-auto"><input class="form-check-input me-1" type="checkbox" id="fpCalibrationDontShow"> Do not show this message again</label>' +
                '</div>' +
                '</div></div>';
            document.body.appendChild(overlay);
        }

        function _fpCloseCalibrationPopup() {
            var dontShow = document.getElementById('fpCalibrationDontShow');
            if (dontShow && dontShow.checked) localStorage.setItem('fp_calibration_intro_hidden', '1');
            var overlay = document.getElementById('fpCalibrationIntroOverlay');
            if (overlay) overlay.remove();
        }

        function _fpCanvasPoint(e) {
            var rect = _fpCanvas.getBoundingClientRect();
            var sx = _fpCanvas.width / rect.width;
            var sy = _fpCanvas.height / rect.height;
            return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        }

        function _fpCanvasDown(e) {
            if (!_fpCanvasReady) return;
            if (e.button === 2) {
                e.preventDefault();
                if (!_fpCanvas.parentElement || (_fpCanvasZoom || 1) <= 1.01) return;
                _fpPanActive = true;
                _fpPanStarted = false;
                _fpPanStartX = e.clientX;
                _fpPanStartY = e.clientY;
                _fpPanStartScrollLeft = _fpCanvas.parentElement.scrollLeft || 0;
                _fpPanStartScrollTop = _fpCanvas.parentElement.scrollTop || 0;
                _fpUpdateCanvasCursor();
                return;
            }
            if (e.button !== 0) return;
            var pt = _fpCanvasPoint(e);
            if (_fpTool === 'polygon') {
                if (!_fpScale) { _fpShowMeasureNotice('Calibrate the scale before drawing rooms.'); return; }
                _fpPolygonDraft.push(pt);
                _fpDraft = { type: 'polygon', points: _fpPolygonDraft.slice() };
                _fpDrawCanvas();
                return;
            }
            _fpMouseDown = true;
            _fpDraft = { type: _fpTool, start: pt, end: pt };
            _fpDrawCanvas();
        }

        function _fpCanvasMove(e) {
            if (_fpPanActive && _fpCanvas && _fpCanvas.parentElement) {
                e.preventDefault();
                var wrap = _fpCanvas.parentElement;
                wrap.scrollLeft = _fpPanStartScrollLeft - (e.clientX - _fpPanStartX);
                wrap.scrollTop = _fpPanStartScrollTop - (e.clientY - _fpPanStartY);
                _fpCanvasScrollLeft = wrap.scrollLeft;
                _fpCanvasScrollTop = wrap.scrollTop;
                _fpPanStarted = true;
                return;
            }
            if (!_fpCanvasReady || !_fpDraft) return;
            var pt = _fpCanvasPoint(e);
            if (_fpTool === 'polygon') {
                _fpDraft.hover = pt;
            } else if (_fpMouseDown) {
                _fpDraft.end = pt;
            }
            _fpDrawCanvas();
        }

        function _fpCanvasUp() {
            if (_fpPanActive) {
                _fpPanActive = false;
                _fpUpdateCanvasCursor();
                if (_fpPanStarted && _fpCanvas && _fpCanvas.parentElement) {
                    _fpCanvasScrollLeft = _fpCanvas.parentElement.scrollLeft || 0;
                    _fpCanvasScrollTop = _fpCanvas.parentElement.scrollTop || 0;
                }
                return;
            }
            if (!_fpMouseDown || !_fpDraft) return;
            _fpMouseDown = false;
            if (_fpTool === 'calibrate') {
                _fpDrawCanvas();
                _fpShowMeasureNotice('Enter the real length and press Set.');
                _fpPromptKnownLength();
                return;
            }
            if (!_fpScale) { _fpDraft = null; _fpShowMeasureNotice('Calibrate the scale before drawing rooms.'); _fpDrawCanvas(); return; }
            if (_fpDistance(_fpDraft.start, _fpDraft.end) < 8) { _fpDraft = null; _fpDrawCanvas(); return; }
            if (_fpTool === 'line') _fpAddShape('line', [_fpDraft.start, _fpDraft.end]);
            if (_fpTool === 'box') _fpAddBoxShape(_fpDraft.start, _fpDraft.end);
            _fpDraft = null;
            _fpRenderMeasureTool();
        }

        function _fpApplyScale() {
            var known = parseFloat(document.getElementById('fpKnownLength') ? document.getElementById('fpKnownLength').value : '');
            if (!_fpDraft || _fpDraft.type !== 'calibrate' || !known || known <= 0) { _fpShowMeasureNotice('Draw a scale line and enter a valid length.'); return; }
            var px = _fpDistance(_fpDraft.start, _fpDraft.end);
            if (px < 8) { _fpShowMeasureNotice('Draw a longer scale line.'); return; }
            _fpScale = { pxPerFt: px / known, knownFt: known, line: { start: _fpDraft.start, end: _fpDraft.end } };
            _fpDraft = null;
            _fpTool = 'box';
            _fpRenderMeasureTool();
        }

        function _fpAddBoxShape(start, end) {
            var points = [
                { x: start.x, y: start.y },
                { x: end.x, y: start.y },
                { x: end.x, y: end.y },
                { x: start.x, y: end.y }
            ];
            _fpAddShape('box', points);
        }

        function _fpAddShape(type, points) {
            var dimensions = _fpShapeDimensions(type, points);
            _fpShapes.push({
                id: _fpShapeCounter++,
                type: type,
                name: _fpSelectedRoomName(),
                points: points,
                trades: _fpSelectedTrades(),
                dimensions: dimensions
            });
            _fpActiveShapeIndex = _fpShapes.length - 1;
        }

        function _fpFinishPolygon() {
            if (_fpPolygonDraft.length < 3) { _fpShowMeasureNotice('A polygon needs at least 3 points.'); return; }
            _fpAddShape('polygon', _fpPolygonDraft.slice());
            _fpPolygonDraft = [];
            _fpDraft = null;
            _fpRenderMeasureTool();
        }

        function _fpShapeDimensions(type, points) {
            var pxPerFt = _fpScale ? _fpScale.pxPerFt : 1;
            if (type === 'line') {
                return { length: _fpDistance(points[0], points[1]) / pxPerFt, width: 0, area: 0, perimeter: _fpDistance(points[0], points[1]) / pxPerFt };
            }
            var perimeterPx = 0;
            var areaPx = 0;
            var minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
            for (var i = 0; i < points.length; i++) {
                var a = points[i];
                var b = points[(i + 1) % points.length];
                perimeterPx += _fpDistance(a, b);
                areaPx += (a.x * b.y) - (b.x * a.y);
                minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
                minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
            }
            var area = Math.abs(areaPx / 2) / (pxPerFt * pxPerFt);
            return { length: (maxX - minX) / pxPerFt, width: (maxY - minY) / pxPerFt, area: area, perimeter: perimeterPx / pxPerFt };
        }

        function _fpUndoShape() {
            if (_fpPolygonDraft.length) { _fpPolygonDraft.pop(); _fpDraft = { type: 'polygon', points: _fpPolygonDraft.slice() }; _fpDrawCanvas(); return; }
            _fpShapes.pop();
            _fpRenderMeasureTool();
        }

        function _fpRemoveShape(index) {
            _fpShapes.splice(index, 1);
            if (_fpActiveShapeIndex === index) _fpActiveShapeIndex = -1;
            else if (_fpActiveShapeIndex > index) _fpActiveShapeIndex--;
            _fpRenderMeasureTool();
        }

        function _fpClearShapes() {
            _fpShapes = [];
            _fpPolygonDraft = [];
            _fpDraft = null;
            _fpActiveShapeIndex = -1;
            _fpRenderMeasureTool();
        }

        function _fpShowMeasureNotice(text) {
            var help = document.getElementById('fpToolHelp');
            if (help) help.innerHTML = '<span class="text-primary fw-semibold">' + _fpEscapeHtml(text) + '</span>';
        }

        function _fpDrawCanvas() {
            if (!_fpCtx || !_fpPlanImg || !_fpCanvasReady) return;
            _fpCtx.clearRect(0, 0, _fpCanvas.width, _fpCanvas.height);
            _fpCtx.drawImage(_fpPlanImg, 0, 0, _fpCanvas.width, _fpCanvas.height);
            if (_fpScale && _fpScale.line) _fpDrawLine(_fpScale.line.start, _fpScale.line.end, '#198754', 4, _fpScale.knownFt + ' ft');
            _fpShapes.forEach(function(shape) { _fpDrawShape(shape, false); });
            if (_fpDraft) {
                if (_fpDraft.type === 'polygon') {
                    var pts = _fpDraft.points.slice();
                    if (_fpDraft.hover) pts.push(_fpDraft.hover);
                    _fpDrawPolygon(pts, '#0d6efd', true);
                } else {
                    _fpDrawLine(_fpDraft.start, _fpDraft.end, _fpDraft.type === 'calibrate' ? '#198754' : '#0d6efd', 3, '');
                    if (_fpDraft.type === 'box') _fpDrawPolygon([{x:_fpDraft.start.x,y:_fpDraft.start.y},{x:_fpDraft.end.x,y:_fpDraft.start.y},{x:_fpDraft.end.x,y:_fpDraft.end.y},{x:_fpDraft.start.x,y:_fpDraft.end.y}], '#0d6efd', true);
                }
            }
        }

        function _fpDrawShape(shape) {
            var color = shape.type === 'line' ? '#dc3545' : '#0d6efd';
            if (shape.type === 'line') {
                _fpDrawLine(shape.points[0], shape.points[1], color, 3, shape.name + ' ' + _fpRound(shape.dimensions.length, 1) + ' LF');
            } else {
                _fpDrawPolygon(shape.points, color, false);
                var c = _fpCentroid(shape.points);
                _fpDrawLabel(c.x, c.y, shape.name + ' ' + _fpRound(shape.dimensions.length, 1) + ' x ' + _fpRound(shape.dimensions.width, 1) + ' ft');
            }
        }

        function _fpDrawLine(a, b, color, width, label) {
            _fpCtx.save();
            var pr = _fpCanvasPixelRatio || 1;
            _fpCtx.strokeStyle = color;
            _fpCtx.lineWidth = (width || 2) * pr;
            _fpCtx.beginPath();
            _fpCtx.moveTo(a.x, a.y);
            _fpCtx.lineTo(b.x, b.y);
            _fpCtx.stroke();
            _fpCtx.fillStyle = color;
            _fpCtx.beginPath(); _fpCtx.arc(a.x, a.y, 4 * pr, 0, Math.PI * 2); _fpCtx.fill();
            _fpCtx.beginPath(); _fpCtx.arc(b.x, b.y, 4 * pr, 0, Math.PI * 2); _fpCtx.fill();
            if (label) _fpDrawLabel((a.x + b.x) / 2, (a.y + b.y) / 2, label);
            _fpCtx.restore();
        }

        function _fpDrawPolygon(points, color, draft) {
            if (!points.length) return;
            _fpCtx.save();
            var pr = _fpCanvasPixelRatio || 1;
            _fpCtx.strokeStyle = color;
            _fpCtx.fillStyle = draft ? 'rgba(13,110,253,0.12)' : 'rgba(13,110,253,0.18)';
            _fpCtx.lineWidth = 3 * pr;
            _fpCtx.beginPath();
            _fpCtx.moveTo(points[0].x, points[0].y);
            for (var i = 1; i < points.length; i++) _fpCtx.lineTo(points[i].x, points[i].y);
            if (!draft && points.length > 2) _fpCtx.closePath();
            _fpCtx.fill();
            _fpCtx.stroke();
            points.forEach(function(p) { _fpCtx.beginPath(); _fpCtx.arc(p.x, p.y, 4 * pr, 0, Math.PI * 2); _fpCtx.fillStyle = color; _fpCtx.fill(); });
            _fpCtx.restore();
        }

        function _fpDrawLabel(x, y, text) {
            _fpCtx.save();
            var pr = _fpCanvasPixelRatio || 1;
            _fpCtx.font = (12 * pr) + 'px Arial';
            var pad = 5 * pr;
            var w = _fpCtx.measureText(text).width + pad * 2;
            _fpCtx.fillStyle = 'rgba(255,255,255,0.92)';
            _fpCtx.fillRect(x - w / 2, y - 12 * pr, w, 22 * pr);
            _fpCtx.strokeStyle = 'rgba(0,0,0,0.18)';
            _fpCtx.strokeRect(x - w / 2, y - 12 * pr, w, 22 * pr);
            _fpCtx.fillStyle = '#111827';
            _fpCtx.fillText(text, x - w / 2 + pad, y + 3 * pr);
            _fpCtx.restore();
        }

        function _fpCentroid(points) {
            var x = 0, y = 0;
            points.forEach(function(p) { x += p.x; y += p.y; });
            return { x: x / points.length, y: y / points.length };
        }

        async function _fpLoadRoomSuggestions() {
            _fpSuggestedRoomNames = ['Living Room','Kitchen','Dining','Bathroom','Bedroom'];
            try {
                var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
                var res = await fetch('https://axmoffknvblluibuitrq.supabase.co/functions/v1/analyze-floor-plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
                    body: JSON.stringify({ mode: 'rooms_only', imageBase64: _fpImageBase64, mimeType: _fpMimeType })
                });
                var data = await res.json();
                if (Array.isArray(data.rooms) && data.rooms.length) {
                    _fpSuggestedRoomNames = data.rooms.map(function(r) { return String(r).trim(); }).filter(Boolean).slice(0, 20);
                    if (!_fpPendingRoomName && _fpActiveShapeIndex < 0 && _fpSuggestedRoomNames.length) _fpPendingRoomName = _fpSuggestedRoomNames[0];
                    _fpRenderMeasureTool();
                }
            } catch(e) {
                console.warn('Room name suggestions failed', e);
            }
        }

        function _fpApplyTradesAll() {
            _fpSaveMeasureForm();
            var trades = _fpActiveShapeIndex >= 0 && _fpShapes[_fpActiveShapeIndex] ? _fpShapes[_fpActiveShapeIndex].trades || {} : _fpPendingTrades || {};
            _fpShapes.forEach(function(shape) { shape.trades = Object.assign({}, trades); });
            _fpRenderMeasureTool();
        }

        function _fpQuantityForTrade(tradeKey, unitType, area, perimeter, ceilingHeight, length) {
            var unit = String(unitType || '').toLowerCase().replace(/\s+/g, '');
            if (unit === 'lf' || unit === 'linearft' || unit === 'linearfeet') return length || perimeter;
            if (unit === 'each' || unit === 'ea') return 1;
            if (unit === 'hour' || unit === 'hours' || unit === 'hr' || unit === 'hourly') return 1;
            var tc = _fpTradeConfig.find(function(t) { return t.key === tradeKey; }) || {};
            if (tc.qtyMode === 'wallArea') return perimeter * ceilingHeight;
            if (tc.qtyMode === 'perimeter') return perimeter || length;
            if (tc.qtyMode === 'each') return 1;
            return area || length || perimeter;
        }

        function _fpGoToStep3() {
            if (!_fpShapes.length) return;
            var ceilingInput = document.getElementById('fpCeilingHeight');
            _fpCeilingHeight = parseFloat(ceilingInput ? ceilingInput.value : _fpCeilingHeight) || 9;
            var computed = [];
            _fpShapes.forEach(function(shape) {
                var d = shape.dimensions || {};
                var items = [];
                _fpEnabledTradeConfig().forEach(function(tc) {
                    var selectedName = shape.trades && shape.trades[tc.key];
                    if (!selectedName) return;
                    var mappedItems = (_fpMapping && _fpMapping[tc.key]) || [];
                    mappedItems.filter(function(mi) { return mi.name === selectedName; }).forEach(function(mi) {
                        var qty = _fpQuantityForTrade(tc.key, mi.unitType, d.area || 0, d.perimeter || 0, _fpCeilingHeight, d.length || 0);
                        qty = _fpRound(qty, 1);
                        items.push({
                            category: mi.category,
                            description: mi.name,
                            quantity: qty,
                            unitType: mi.unitType || 'sqft',
                            rate: mi.rate || 0,
                            total: Math.round(qty * (mi.rate || 0) * 100) / 100,
                            notes: tc.label + ' quantity from calibrated floor plan measurement. Review before sending.'
                        });
                    });
                });
                computed.push({ name: shape.name, type: shape.type, dimensions: d, items: items });
            });
            _fpResults = { rooms: computed };
            var roomsHtml = computed.map(function(room, ri) {
                var d = room.dimensions || {};
                var label = room.type === 'line'
                    ? _fpRound(d.length, 1) + ' LF'
                    : _fpRound(d.length, 1) + '\' x ' + _fpRound(d.width, 1) + '\' | ' + _fpRound(d.area, 1) + ' sqft | ' + _fpRound(d.perimeter, 1) + ' LF';
                var itemsHtml = room.items.map(function(item, ii) {
                    return '<div class="d-flex align-items-center gap-2 py-1 border-bottom">' +
                        '<input type="checkbox" class="form-check-input fp-item-check" id="fpItem_' + ri + '_' + ii + '" checked style="flex-shrink:0;">' +
                        '<span class="badge bg-secondary me-1" style="font-size:0.7rem;">' + _fpEscapeHtml(item.category) + '</span>' +
                        '<span class="small flex-grow-1">' + _fpEscapeHtml(item.description) + '</span>' +
                        '<div class="d-flex align-items-center gap-1">' +
                        '<input type="number" class="form-control form-control-sm" id="fpQty_' + ri + '_' + ii + '" value="' + item.quantity + '" style="width:75px;" min="0" step="0.1">' +
                        '<span class="text-muted small">' + _fpEscapeHtml(item.unitType) + '</span>' +
                        '</div>' +
                        '<span class="text-muted small ms-1">$' + item.rate + ' = <strong>$' + item.total.toFixed(2) + '</strong></span>' +
                        '</div>';
                }).join('');
                return '<div class="card mb-2">' +
                    '<div class="card-header py-2 d-flex align-items-center gap-2" style="background:#f0f4ff;">' +
                    '<input type="checkbox" class="form-check-input fp-room-check" id="fpRoom_' + ri + '" checked onchange="_fpToggleRoom(' + ri + ',this.checked)">' +
                    '<input type="text" class="form-control form-control-sm fw-semibold flex-grow-1" id="fpRoomName_' + ri + '" value="' + _fpEscapeHtml(room.name) + '" style="border:none;background:transparent;font-weight:600;">' +
                    '<span class="badge bg-light text-dark ms-auto" style="font-size:0.7rem;">' + label + '</span>' +
                    '</div>' +
                    '<div class="card-body py-2" id="fpRoomItems_' + ri + '">' + (itemsHtml || '<p class="text-muted small mb-0">No trades selected for this measurement</p>') + '</div>' +
                    '</div>';
            }).join('');
            document.getElementById('floorPlanModalBody').innerHTML =
                '<div class="d-flex justify-content-center gap-1 mb-2">' + _fpStepBadges(3, ['Upload','Calibrate','Review']) + '</div>' +
                '<div class="text-muted small text-center mb-2">Quantities are calculated from your calibrated drawing. Edit any value before adding to your quote.</div>' +
                '<div style="max-height:calc(100vh - 220px);overflow-y:auto;">' + roomsHtml + '</div>' +
                '<div class="d-flex justify-content-between align-items-center mt-3">' +
                '<button class="btn btn-outline-secondary btn-sm" onclick="_fpRenderMeasureTool()"><i class="fas fa-arrow-left me-1"></i>Back</button>' +
                '<div class="text-muted small">' + computed.length + ' measurement(s)</div>' +
                '<button class="btn btn-success" onclick="_fpAddToQuote()"><i class="fas fa-check me-1"></i>Add All to Quote</button>' +
                '</div>';
        }

        function _fpToggleRoom(ri, checked) {
            var itemsDiv = document.getElementById('fpRoomItems_' + ri);
            if (itemsDiv) itemsDiv.querySelectorAll('.fp-item-check').forEach(function(cb) { cb.checked = checked; cb.disabled = !checked; });
        }

        function _fpAddToQuote() {
            if (!_fpResults || !_fpResults.rooms) return;
            var addedCount = 0;
            _fpResults.rooms.forEach(function(room, ri) {
                var roomCheck = document.getElementById('fpRoom_' + ri);
                if (!roomCheck || !roomCheck.checked) return;
                var roomName = document.getElementById('fpRoomName_' + ri).value || room.name;
                var newRoom = { id: roomCounter++, name: roomName, items: [], notes: '', photos: [] };
                room.items.forEach(function(item, ii) {
                    var itemCheck = document.getElementById('fpItem_' + ri + '_' + ii);
                    if (!itemCheck || !itemCheck.checked) return;
                    var qty = parseFloat(document.getElementById('fpQty_' + ri + '_' + ii).value) || item.quantity;
                    newRoom.items.push({
                        description: item.description,
                        category: item.category,
                        quantity: qty,
                        unitType: item.unitType || 'sqft',
                        rate: item.rate || 0,
                        total: qty * (item.rate || 0),
                        notes: item.notes || '',
                        isOptional: false
                    });
                });
                if (newRoom.items.length > 0) { rooms.push(newRoom); addedCount++; }
            });
            bootstrap.Modal.getInstance(document.getElementById('floorPlanModal')).hide();
            if (addedCount > 0) {
                renderRooms(); calculateTotals(); unsavedChanges = true;
                setTimeout(function() {
                    var roomEls = document.querySelectorAll('.room-card');
                    if (roomEls.length > 0) roomEls[roomEls.length - addedCount].scrollIntoView({ behavior:'smooth', block:'start' });
                }, 300);
                var toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#198754;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                toast.innerHTML = '<i class="fas fa-check-circle me-2"></i>' + addedCount + ' measurement' + (addedCount !== 1 ? 's' : '') + ' added to your quote!';
                document.body.appendChild(toast);
                setTimeout(function() { toast.remove(); }, 4000);
            }
        }
        // -- End Floor Plan Scanner ------------------------------------------------
