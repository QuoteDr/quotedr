// IKEA Quick Quote module extracted from quote-builder.html.
// Depends on quote-builder globals: rooms, renderRooms, saveQuoteToSupabase, bootstrap, pdfjsLib, getCurrentUser, _supabase.
(function() {
    'use strict';

        // ── IKEA Quick Quote ──────────────────────────────────────────────
        var IKEA_FIELDS = [
            { key: 'baseCabinet',     label: 'Base Cabinet',         defaultRate: 119 },
            { key: 'wallCabinet',     label: 'Wall Cabinet',          defaultRate: 119 },
            { key: 'tallCabinet',     label: 'Tall / High Cabinet',   defaultRate: 177 },
            { key: 'cornerCabinet',   label: 'Corner Cabinet',        defaultRate: 145 },
            { key: 'islandBase',      label: 'Island / Peninsula',    defaultRate: 197 },
            { key: 'door',            label: 'Door',                  defaultRate: 15  },
            { key: 'glassPanel',      label: 'Glass Door / Panel',    defaultRate: 25  },
            { key: 'drawer',          label: 'Drawer / Internal Fitting', defaultRate: 41  },
            { key: 'coverPanel',      label: 'Cover / Filler Panel',      defaultRate: 56  },
            { key: 'toeKick',         label: 'Toe Kick',                  defaultRate: 20  },
            { key: 'crownMoulding',   label: 'Crown / Valance / Deco Strip', defaultRate: 43  },
            { key: 'scribeFiller',    label: 'Scribe / Ceiling Filler (per LF)', defaultRate: 14.25 },
            { key: 'scribeSideFiller', label: 'Scribe Side Filler Strip (each)', defaultRate: 33 },
            { key: 'customCut',       label: 'Custom Cabinet Cut',        defaultRate: 113 },
            { key: 'customPanel',     label: 'Custom Cover Panel (Paint Match)', defaultRate: 0 },
            { key: 'shelf',           label: 'Interior Shelf',         defaultRate: 10  },
            { key: 'lazySusan',       label: 'Lazy Susan / Carousel', defaultRate: 67  },
            { key: 'countertop',      label: 'Laminate Countertop / Butcher Block (per LF)', defaultRate: 25  },
            { key: 'sink',            label: 'Sink',                  defaultRate: 195 },
            { key: 'faucet',          label: 'Faucet / Tap',          defaultRate: 95  },
            { key: 'dishwasherPanel', label: 'Dishwasher Panel',      defaultRate: 147 },
            { key: 'recyclingBin',    label: 'Recycling / Waste Bin', defaultRate: 35  },
            { key: 'accessory',       label: 'Accessory / Organizer', defaultRate: 15  },
            { key: 'lighting',        label: 'Interior Lighting',     defaultRate: 45  },
            { key: 'pushOpen',        label: 'Push-to-Open',          defaultRate: 15  },
        ];

        // Keyword rules - order matters (more specific first)
        var IKEA_RULES = [
            { key: 'dishwasherPanel', words: ['dishwasher panel','tutemo','door on dishwasher'] },
            { key: 'tallCabinet',     words: ['tall cabinet','high cabinet','sektion high','sektion tall','pantry cabinet'] },
            { key: 'cornerCabinet',   words: ['corner base','corner wall','corner cabinet','corner'] },
            { key: 'baseCabinet',     words: ['base cabinet','sektion base','base cab'] },
            { key: 'wallCabinet',     words: ['wall cabinet','sektion wall','upper cabinet','wall cab'] },
            { key: 'lazySusan',       words: ['lazy susan','carousel','utrusta rotating'] },
            { key: 'drawer',          words: ['maximera','förvara','drawer insert','drawer'] },
            { key: 'coverPanel',      words: ['cover panel','filler panel','sektion panel'] },
            { key: 'toeKick',         words: ['toe kick','toekick','sektion toe'] },
            { key: 'crownMoulding',   words: ['crown moulding','crown molding','light valance','valance','cornice','prägel'] },
            { key: 'countertop',      words: ['countertop','counter top','badelunda','ekbacken','kasker','numerar'] },
            { key: 'door',            words: ['axstad','vedhamn','kungsbacka','järsta','lerhyttan','kallarp','door'] },
            { key: 'islandBase',      words: ['island','peninsula'] },
        ];

        function loadIkeaPricing() {
            var saved = JSON.parse(localStorage.getItem('ald_ikea_pricing') || '{}');
            var result = {};
            IKEA_FIELDS.forEach(function(f) {
                result[f.key] = (saved[f.key] !== undefined) ? saved[f.key] : f.defaultRate;
            });
            return result;
        }

        // Load IKEA pricing from Supabase on startup (cloud → localStorage)
        (function loadIkeaPricingFromCloud() {
            if (typeof getCurrentUser === 'undefined' || typeof _supabase === 'undefined') return;
            getCurrentUser().then(function(u) {
                if (!u) return;
                _supabase.from('user_data').select('value').eq('user_id', u.id).eq('key', 'ikea_pricing').maybeSingle().then(function(res) {
                    if (res.data && res.data.value && Object.keys(res.data.value).length > 0) {
                        localStorage.setItem('ald_ikea_pricing', JSON.stringify(res.data.value));
                    }
                });
            }).catch(function() {});
        })();

        function saveIkeaPricing() {
            var pricing = {};
            IKEA_FIELDS.forEach(function(f) {
                var el = document.getElementById('ikPrice_' + f.key);
                pricing[f.key] = el ? (parseFloat(el.value) || 0) : f.defaultRate;
            });
            localStorage.setItem('ald_ikea_pricing', JSON.stringify(pricing));
            if (typeof getCurrentUser !== 'undefined') {
                getCurrentUser().then(function(u) {
                    if (u && typeof _supabase !== 'undefined')
                        _supabase.from('user_data').upsert({ user_id: u.id, key: 'ikea_pricing', value: pricing, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
                });
            }
            var badge = document.getElementById('ikeaPricingSaved');
            if (badge) { badge.style.display = 'inline'; setTimeout(function() { badge.style.display = 'none'; }, 2500); }
        }

        function showIkeaTab(tab, el) {
            document.getElementById('ikeaTab_parse').style.display = tab === 'parse' ? 'block' : 'none';
            document.getElementById('ikeaTab_prices').style.display = tab === 'prices' ? 'block' : 'none';
            document.querySelectorAll('#ikeaTabs .nav-link').forEach(function(a) { a.classList.remove('active'); });
            if (el) el.classList.add('active');
            if (tab === 'prices') renderIkeaPricingForm();
        }

        function renderIkeaPricingForm() {
            var pricing = loadIkeaPricing();
            var html = '<div class="row g-2">';
            IKEA_FIELDS.forEach(function(f) {
                html += '<div class="col-md-6"><div class="d-flex align-items-center gap-2 mb-2">';
                html += '<label class="form-label mb-0 flex-grow-1 small fw-semibold">' + f.label + '</label>';
                html += '<div class="input-group input-group-sm" style="max-width:100px;"><span class="input-group-text">$</span>';
                html += '<input type="number" class="form-control" id="ikPrice_' + f.key + '" value="' + pricing[f.key] + '" step="0.01" min="0"></div>';
                html += '</div></div>';
            });
            html += '</div>';
            document.getElementById('ikeaPricingRows').innerHTML = html;
        }

        async function ikeaExtractPdfText(file) {
            if (typeof pdfjsLib === 'undefined') { throw new Error('PDF reader not loaded yet, try again in a moment.'); }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            var arrayBuffer = await file.arrayBuffer();
            var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            var text = '';
            for (var i = 1; i <= pdf.numPages; i++) {
                var page = await pdf.getPage(i);
                var content = await page.getTextContent();
                text += content.items.map(function(s) { return s.str; }).join(' ') + '\n';
            }
            return text;
        }

        async function ikeaHandlePdfUpload(file) {
            if (!file) return;
            var status = document.getElementById('ikeaPdfStatus');
            var statusText = document.getElementById('ikeaPdfStatusText');
            status.style.display = 'block';
            statusText.textContent = 'Reading PDF - ' + file.name + '...';
            document.getElementById('ikeaUploadArea').style.background = '#d4edda';
            try {
                var text = await ikeaExtractPdfText(file);
                document.getElementById('ikeaOrderInput').value = text;
                status.className = 'alert alert-success py-2 small mb-2';
                statusText.innerHTML = '<i class="fas fa-check-circle me-1"></i>PDF read successfully - ' + file.name + '. Click <strong>Parse &amp; Quote</strong> to continue.';
                document.getElementById('ikeaUploadArea').innerHTML = '<i class="fas fa-check-circle fa-2x text-success mb-2"></i><div class="fw-semibold text-success">' + file.name + '</div><div class="text-muted small">PDF loaded - click to replace</div><input type="file" id="ikeaPdfInput" accept=".pdf" style="display:none;" onchange="ikeaHandlePdfUpload(this.files[0])">';
            } catch(e) {
                status.className = 'alert alert-danger py-2 small mb-2';
                statusText.innerHTML = '<i class="fas fa-exclamation-circle me-1"></i>Could not read PDF: ' + e.message + '. Try pasting the order text manually.';
                document.getElementById('ikeaUploadArea').style.background = '#fafafa';
            }
        }

        function ikeaHandleDrop(event) {
            event.preventDefault();
            document.getElementById('ikeaUploadArea').style.background = '#fafafa';
            var file = event.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                ikeaHandlePdfUpload(file);
            } else {
                qdAlert('Please drop a PDF file.');
            }
        }

        async function openIkeaQuoteModal() {
            if (typeof requireProFeature === 'function') {
                var allowed = await requireProFeature('ikea_quoter', 'IKEA Cabinet Quoter');
                if (!allowed) return;
            }
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('ikea_quoter_opened', { existing_room_count: Array.isArray(rooms) ? rooms.length : 0 });
            }
            document.getElementById('ikeaOrderInput').value = '';
            document.getElementById('ikeaResults').style.display = 'none';
            document.getElementById('ikeaPdfStatus').style.display = 'none';
            document.getElementById('ikeaUploadArea').style.background = '#fafafa';
            document.getElementById('ikeaUploadArea').innerHTML = '<i class="fas fa-file-pdf fa-2x text-danger mb-2"></i><div class="fw-semibold">Upload IKEA Order PDF</div><div class="text-muted small">Click to browse or drag &amp; drop your PDF here</div><input type="file" id="ikeaPdfInput" accept=".pdf" style="display:none;" onchange="ikeaHandlePdfUpload(this.files[0])">';
            showIkeaTab('parse', document.querySelector('#ikeaTabs .nav-link'));
            // Populate room dropdown
            var sel = document.getElementById('ikeaTargetRoom');
            sel.innerHTML = '<option value="__new__">+ Create new room</option>';
            var nameInput = document.getElementById('ikeaNewRoomName');
            if (nameInput) { nameInput.style.display = ''; nameInput.value = 'Kitchen'; }
            rooms.forEach(function(r) {
                var opt = document.createElement('option');
                opt.value = r.id; opt.textContent = r.name; sel.appendChild(opt);
            });
            // Always default to "Create new room"
            sel.value = '__new__';
            new bootstrap.Modal(document.getElementById('ikeaQuickQuoteModal')).show();
        }

        function parseIkeaOrderLocal(text) {
            var items = [];
            // Split into sections by numbered item headers
            var sectionRegex = /(?:^|\n|(?<=\s))(\d{1,3})\s*\.\s+(?=[A-Z])/g;
            var sectionStarts = [];
            var m;
            while ((m = sectionRegex.exec(text)) !== null) {
                sectionStarts.push({ idx: m.index, num: parseInt(m[1]) });
            }
            if (sectionStarts.length === 0) {
                var simpleRegex = /(?:^|\n)\s*(\d{1,3})\s*\.\s+/g;
                while ((m = simpleRegex.exec(text)) !== null) {
                    sectionStarts.push({ idx: m.index, num: parseInt(m[1]) });
                }
            }
            var sections = [];
            for (var i = 0; i < sectionStarts.length; i++) {
                var start = sectionStarts[i].idx;
                var end = (i + 1 < sectionStarts.length) ? sectionStarts[i + 1].idx : text.length;
                sections.push(text.substring(start, end));
            }
            if (sections.length === 0) sections = [text];

            var SKIP_WORDS = ['hinge', 'damper', 'dmpr', 'screw', 'knob', 'bracket',
                              'clip', 'leg', 'vent', 'reinforced', 'suspension', 'cover cap'];

            for (var si = 0; si < sections.length; si++) {
                var section = sections[si];
                var firstArticle = section.search(/\d{3}\.\d{3}\.\d{2}/);
                var headerText = firstArticle > 0 ? section.substring(0, firstArticle) : section.substring(0, 200);
                var headerLower = headerText.toLowerCase();
                var cabinetType = null;
                var cabinetLabel = headerText.replace(/^\s*\d+\s*\.\s*/, '').trim();
                cabinetLabel = cabinetLabel.split(/(?:This cabinet|You'll find|AXSTAD|VEDHAMN|MAXIMERA|FORBATTRA)/i)[0].trim();
                if (cabinetLabel.length > 80) cabinetLabel = cabinetLabel.substring(0, 80).trim();

                // Header classification (specific first)
                if (/filler piece|filler panel/i.test(headerLower)) { cabinetType = 'coverPanel'; cabinetLabel = 'Filler piece'; }
                else if (/high cabinet|tall cabinet|pantry/i.test(headerLower)) cabinetType = 'tallCabinet';
                else if (/corner/i.test(headerLower)) cabinetType = 'cornerCabinet';
                else if (/wall cabinet|upper cabinet/i.test(headerLower)) cabinetType = 'wallCabinet';
                else if (/base cabinet/i.test(headerLower)) cabinetType = 'baseCabinet';
                else if (/island|peninsula/i.test(headerLower)) cabinetType = 'islandBase';
                else if (/cover panel/i.test(headerLower)) cabinetType = 'coverPanel';
                else if (/countertop|counter top/i.test(headerLower)) cabinetType = 'countertop';
                else if (/toe kick|toekick/i.test(headerLower)) cabinetType = 'toeKick';
                else if (/light valance|crown|cornice|moulding|molding/i.test(headerLower)) cabinetType = 'crownMoulding';
                else if (/dishwasher/i.test(headerLower)) cabinetType = 'dishwasherPanel';
                else if (/sink/i.test(headerLower)) cabinetType = 'baseCabinet';
                else if (/microhood|microwave|oven|range/i.test(headerLower)) cabinetType = 'wallCabinet';

                if (cabinetType) items.push({ type: cabinetType, qty: 1, label: cabinetLabel || cabinetType });

                // Find sub-items: PRODUCT description ARTICLE QTY x
                var subItemRegex = /(AXSTAD|MAXIMERA|FORBATTRA|UTRUSTA|VEDHAMN|KUNGSBACKA|KALLARP|LERHYTTAN|J[A\u00c4]RSTA|BADELUNDA|EKBACKEN|KASKER|NUMERAR|TUTEMO|HAVSEN|VRESJON|EDSVIK|LILLVIKEN|HALLBAR|H[\u00c5]LLBAR|VARIERA|OMLOPP|IRSTA|MITTLED|STRIML[EA]D|YTBERG)\s+(.*?)\s*(\d{3}\.\d{3}\.\d{2})\s+(\d+)\s*x/gi;
                var subMatch;
                while ((subMatch = subItemRegex.exec(section)) !== null) {
                    var productName = subMatch[1].toUpperCase();
                    var description = subMatch[2].toLowerCase().trim();
                    var qty = parseInt(subMatch[4]);
                    var localContext = (productName + ' ' + description).toLowerCase();
                    var shouldSkip = false;
                    for (var sk = 0; sk < SKIP_WORDS.length; sk++) { if (localContext.indexOf(SKIP_WORDS[sk]) !== -1) { shouldSkip = true; break; } }
                    if (shouldSkip) continue;

                    var subType = null, subLabel = '';
                    if (['AXSTAD','VEDHAMN','KUNGSBACKA','KALLARP','LERHYTTAN','JARSTA','J\u00c4RSTA'].indexOf(productName) !== -1) {
                        if (description.indexOf('drw fr') !== -1 || description.indexOf('drawer front') !== -1) { subType = 'drawer'; subLabel = productName + ' drawer front'; }
                        else if (/gls\s*dr|glass\s*door|glass\s*panel|vitrine/i.test(description)) { subType = 'glassPanel'; var dm = description.match(/(\d+x\d+)/); subLabel = productName + ' glass door' + (dm ? ' ' + dm[1] : ''); }
                        else { subType = 'door'; var dm = description.match(/(\d+x\d+)/); subLabel = productName + ' door' + (dm ? ' ' + dm[1] : ''); }
                    } else if (productName === 'MAXIMERA') { subType = 'drawer'; var dm2 = description.match(/(\d+x\d+)/); subLabel = 'MAXIMERA drawer' + (dm2 ? ' ' + dm2[1] : ''); }
                    else if (productName === 'FORBATTRA') {
                        if (/toe\s*kick|toe/i.test(description)) { subType = 'toeKick'; subLabel = 'F\u00d6RB\u00c4TTRA toe kick'; }
                        else if (/cvr\s*pnl|cover\s*panel/i.test(description)) { subType = 'coverPanel'; subLabel = 'F\u00d6RB\u00c4TTRA cover panel'; }
                        else if (/deco\s*strip|moulding|molding|cornice|valance/i.test(description)) { subType = 'crownMoulding'; subLabel = 'F\u00d6RB\u00c4TTRA trim'; }
                        else if (/filler/i.test(description)) { subType = 'coverPanel'; subLabel = 'F\u00d6RB\u00c4TTRA filler'; }
                    } else if (productName === 'UTRUSTA') {
                        if (/rotating|carousel/i.test(description)) { subType = 'lazySusan'; subLabel = 'UTRUSTA lazy susan'; }
                        else if (/push.?open|push.?opener/i.test(description)) { subType = 'pushOpen'; subLabel = 'UTRUSTA push-to-open'; }
                        else if (/led|light/i.test(description)) { subType = 'lighting'; subLabel = 'UTRUSTA lighting'; }
                        else if (/sh[el]*f|shlf/i.test(description)) { subType = 'shelf'; var dm3 = description.match(/(\d+x\d+)/); subLabel = 'UTRUSTA shelf' + (dm3 ? ' ' + dm3[1] : ''); }
                    } else if (['BADELUNDA','EKBACKEN','KASKER','NUMERAR'].indexOf(productName) !== -1) { subType = 'countertop'; subLabel = productName + ' countertop'; }
                    else if (productName === 'TUTEMO') { subType = 'dishwasherPanel'; subLabel = 'TUTEMO dishwasher panel'; }
                    // Plumbing
                    else if (['HAVSEN','VRESJON'].indexOf(productName) !== -1) { subType = 'sink'; subLabel = productName + ' sink'; }
                    else if (['EDSVIK','LILLVIKEN'].indexOf(productName) !== -1) {
                        if (/faucet|tap|mixer/i.test(description)) { subType = 'faucet'; subLabel = productName + ' faucet'; }
                        else if (/strainer|stopper/i.test(description)) { subType = 'accessory'; subLabel = productName + ' strainer/stopper'; }
                        else { subType = 'faucet'; subLabel = productName + ' faucet'; }
                    }
                    // Recycling / waste bins
                    else if (productName === 'HALLBAR' || productName === 'H\u00c5LLBAR') { subType = 'recyclingBin'; subLabel = 'H\u00c5LLBAR recycling bin'; }
                    // Accessories / organizers
                    else if (productName === 'VARIERA') { subType = 'accessory'; subLabel = 'VARIERA organizer'; }
                    // Interior lighting
                    else if (['OMLOPP','IRSTA','MITTLED','STRIMLED','STRIMLEAD','YTBERG'].indexOf(productName) !== -1) { subType = 'lighting'; subLabel = productName + ' lighting'; }
                    // Glass doors - check door products for glass
                    if (!subType && /gls\s*dr|glass\s*door|glass\s*panel|vitrine/i.test(description)) { subType = 'glassPanel'; subLabel = productName + ' glass door'; }
                    if (subType) items.push({ type: subType, qty: qty, label: subLabel });
                }
            }
            // Consolidate same type+label
            var consolidated = [], seen = {};
            for (var ci = 0; ci < items.length; ci++) {
                var key = items[ci].type + '::' + items[ci].label;
                if (seen[key] !== undefined) consolidated[seen[key]].qty += items[ci].qty;
                else { seen[key] = consolidated.length; consolidated.push({ type: items[ci].type, qty: items[ci].qty, label: items[ci].label }); }
            }
            return consolidated;
        }

        function showIkeaReminders(hasCountertop) {
            var backdrop = document.createElement('div');
            backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;';
            document.body.appendChild(backdrop);
            var messages = [
                { text: "\u26a0\ufe0f Don\u2019t forget: charge for scribe/filler panels against ceiling or walls (per LF)! Scroll to bottom to add items.", bg: '#856404' },
                { text: "\ud83c\udfa8 Any custom cover panels that need to be made and paint-matched? Scroll to bottom to add items.", bg: '#0d6efd' }
            ];
            if (hasCountertop) {
                messages.unshift({ text: "\ud83d\udccf Countertops detected in this order! You must measure the linear footage on site and enter it manually. Scroll to bottom to add.", bg: '#6f42c1' });
            }
            var idx = 0;
            function showNext() {
                if (idx >= messages.length) { document.body.removeChild(backdrop); return; }
                var msg = messages[idx];
                var box = document.createElement('div');
                box.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:' + msg.bg + ';color:white;padding:30px 36px;border-radius:12px;font-size:1.1rem;font-weight:bold;text-align:center;z-index:10001;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
                box.appendChild(document.createTextNode(msg.text));
                var ok = document.createElement('button');
                ok.textContent = 'OK';
                ok.style.cssText = 'display:block;margin:20px auto 0;padding:10px 32px;font-size:1rem;font-weight:bold;background:white;color:' + msg.bg + ';border:none;border-radius:6px;cursor:pointer;';
                ok.onclick = function() { document.body.removeChild(box); idx++; showNext(); };
                box.appendChild(ok);
                document.body.appendChild(box);
            }
            showNext();
        }

        function parseIkeaOrder() {
            var text = document.getElementById('ikeaOrderInput').value.trim();
            if (!text) { qdAlert('Please paste your IKEA order list first.'); return; }
            var btn = document.getElementById('ikeaParseBtn');
            var origHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-cog fa-spin me-1"></i>Parsing...'; }
            try {
                var rawItems = parseIkeaOrderLocal(text);
                if (!rawItems || rawItems.length === 0) { qdAlert('Could not find any recognizable IKEA install items. Make sure you uploaded the full order PDF or pasted the complete text.'); return; }
                var pricing = loadIkeaPricing();
                var parsed = rawItems.map(function(item) {
                    var rate = pricing[item.type] || 0;
                    return { key: item.type, label: item.label, qty: item.qty, rate: rate, total: item.qty * rate, lineText: item.label };
                });
                var hasCountertop = parsed.some(function(it) { return it.key === 'countertop'; });
                renderIkeaResults(parsed, []);
                setTimeout(function() { showIkeaReminders(hasCountertop); }, 400);
            } catch(e) {
                qdAlert('Parse error: ' + e.message);
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
            }
        }

        var _ikeaParsedItems = [];
        function renderIkeaResults(items, unparsed) {
            var pricing = loadIkeaPricing();
            // Pull countertop items out of main list — convert to reminder items
            var hasCountertop = items.some(function(it) { return it.key === 'countertop'; });
            var mainItems = items.filter(function(it) { return it.key !== 'countertop'; });
            // Append reminder items (qty 0) for items needing manual input
            var reminderItems = [];
            if (hasCountertop) {
                reminderItems.push({ key: 'countertop', label: '⚠️ Laminate Countertop / Butcher Block (per LF)', lineText: 'Countertops detected — measure & enter linear footage manually', qty: 0, rate: pricing['countertop'] || 25, total: 0, reminder: true });
            }
            reminderItems = reminderItems.concat([
                { key: 'scribeFiller',    label: '⚠️ Scribe / Ceiling Filler (per LF)',    lineText: 'Set qty if scribing filler panels to ceiling/wall', qty: 0, rate: pricing['scribeFiller'] || 14.25, total: 0, reminder: true },
                { key: 'scribeSideFiller', label: '⚠️ Scribe Side Filler Strip',            lineText: 'Set qty for side filler strips — $33 each', qty: 0, rate: pricing['scribeSideFiller'] || 33, total: 0, reminder: true },
                { key: 'customCut',       label: '⚠️ Custom Cabinet Cut',                   lineText: 'Set qty if any cabinets need custom cutting', qty: 0, rate: pricing['customCut'] || 113, total: 0, reminder: true },
                { key: 'customPanel',     label: '⚠️ Custom Cover Panel (Paint Match)',      lineText: 'Set qty + price if custom panels need painting', qty: 0, rate: pricing['customPanel'] || 0, total: 0, reminder: true },
            ]);
            var allItems = mainItems.concat(reminderItems);
            _ikeaParsedItems = allItems;
            var total = 0;
            var html = '';
            allItems.forEach(function(item, i) {
                total += item.total;
                var rowStyle = item.reminder ? ' style="background:#fffbe6;"' : '';
                html += '<tr' + rowStyle + '>';
                html += '<td><input type="checkbox" class="form-check-input ikea-check" data-idx="' + i + '" ' + (item.reminder ? '' : 'checked') + '></td>';
                html += '<td><span class="small">' + item.label + '</span><br><span class="text-muted" style="font-size:0.75rem;">' + item.lineText.substring(0,70) + '</span></td>';
                html += '<td><input type="number" class="form-control form-control-sm" value="' + item.qty + '" style="width:65px;" onchange="updateIkeaRow(' + i + ',this.value,null)"></td>';
                html += '<td><div class="input-group input-group-sm" style="width:90px;"><span class="input-group-text">$</span><input type="number" class="form-control" value="' + item.rate + '" step="0.01" onchange="updateIkeaRow(' + i + ',null,this.value)"></div></td>';
                html += '<td>$' + item.total.toFixed(2) + '</td>';
                html += '</tr>';
            });
            document.getElementById('ikeaResultsBody').innerHTML = html;
            document.getElementById('ikeaTotal').textContent = '$' + total.toFixed(2);
            document.getElementById('ikeaItemCount').textContent = items.length + ' items found';
            if (unparsed.length > 0) {
                document.getElementById('ikeaUnparsed').style.display = 'block';
                document.getElementById('ikeaUnparsed').innerHTML = '<i class="fas fa-info-circle me-1"></i><strong>' + unparsed.length + ' lines skipped</strong> (not recognized as IKEA install items - hardware, accessories, etc.): <br><span class="text-muted">' + unparsed.slice(0,5).map(function(l){return l.substring(0,60);}).join(', ') + '</span>';
            } else { document.getElementById('ikeaUnparsed').style.display = 'none'; }
            document.getElementById('ikeaResults').style.display = 'block';
        }

        function updateIkeaRow(idx, newQty, newRate) {
            if (newQty !== null) _ikeaParsedItems[idx].qty = parseFloat(newQty) || 0;
            if (newRate !== null) _ikeaParsedItems[idx].rate = parseFloat(newRate) || 0;
            _ikeaParsedItems[idx].total = _ikeaParsedItems[idx].qty * _ikeaParsedItems[idx].rate;
            // Update total cell
            var rows = document.querySelectorAll('#ikeaResultsBody tr');
            if (rows[idx]) rows[idx].querySelector('td:last-child').textContent = '$' + _ikeaParsedItems[idx].total.toFixed(2);
            var grand = _ikeaParsedItems.reduce(function(s,item,i) {
                var check = document.querySelector('.ikea-check[data-idx="' + i + '"]');
                return s + (check && check.checked ? item.total : 0);
            }, 0);
            document.getElementById('ikeaTotal').textContent = '$' + grand.toFixed(2);
        }

        function addIkeaToQuote() {
            var roomId = document.getElementById('ikeaTargetRoom').value;
            var roomName = (document.getElementById('ikeaNewRoomName').value.trim()) || 'Kitchen';
            if (roomId === '__new__') {
                var newRoom = { id: Date.now(), name: roomName, items: [], notes: '', scopeNotes: '' };
                rooms.push(newRoom);
                roomId = newRoom.id;
                renderRooms();
            } else { roomId = parseInt(roomId); }
            var room = rooms.find(function(r) { return r.id === roomId; });
            if (!room) { qdAlert('Room not found.'); return; }
            var added = 0;
            document.querySelectorAll('.ikea-check').forEach(function(chk) {
                if (!chk.checked) return;
                var item = _ikeaParsedItems[parseInt(chk.dataset.idx)];
                room.items.push({
                    category: 'Millwork & Cabinets',
                    name: 'IKEA Install - ' + item.label,
                    description: item.lineText,
                    quantity: item.qty,
                    unitType: 'each',
                    rate: item.rate,
                    total: item.total
                });
                added++;
            });
            renderRooms();
            if (typeof saveQuoteToSupabase === 'function') saveQuoteToSupabase();
            bootstrap.Modal.getInstance(document.getElementById('ikeaQuickQuoteModal')).hide();
            if (typeof completeProTrialFeature === 'function') completeProTrialFeature('ikea_quoter', 'IKEA Cabinet Quoter');
            if (typeof qdCaptureEvent === 'function') {
                qdCaptureEvent('ikea_quoter_added_to_quote', { item_count: added });
            }
            var t2 = document.createElement('div');
            t2.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#198754;color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            t2.innerHTML = '<i class="fas fa-check me-2"></i>' + added + ' IKEA install items added!';
            document.body.appendChild(t2); setTimeout(function(){ t2.remove(); }, 3500);
        }

        window.IKEA_FIELDS = IKEA_FIELDS;
        window.IKEA_RULES = IKEA_RULES;
        window.loadIkeaPricing = loadIkeaPricing;
        window.saveIkeaPricing = saveIkeaPricing;
        window.showIkeaTab = showIkeaTab;
        window.renderIkeaPricingForm = renderIkeaPricingForm;
        window.ikeaExtractPdfText = ikeaExtractPdfText;
        window.ikeaHandlePdfUpload = ikeaHandlePdfUpload;
        window.ikeaHandleDrop = ikeaHandleDrop;
        window.openIkeaQuoteModal = openIkeaQuoteModal;
        window.parseIkeaOrderLocal = parseIkeaOrderLocal;
        window.showIkeaReminders = showIkeaReminders;
        window.parseIkeaOrder = parseIkeaOrder;
        window.renderIkeaResults = renderIkeaResults;
        window.updateIkeaRow = updateIkeaRow;
        window.addIkeaToQuote = addIkeaToQuote;
})();
