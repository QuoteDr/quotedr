// Quote Style Modal module extracted from quote-builder.html.
// Depends on quote-builder globals: rooms, markQuoteNumberUsed, collectQuoteData, saveQuoteForSharing, bootstrap.
(function() {
    'use strict';

        // Quote style state
        var _quoteStyle = {
            preset: 'clean-blue',
            accent: '#1a56a0',
            bg: '#f7fbff',
            bgOpacity: 100,
            headerStyle: 'branded',
            headerOpacity: 100,
            fontFeel: 'clean',
            pricingMode: 'full',
            depositMode: 'auto',
            depositPercent: 50,
            approvalMode: 'approve_or_changes',
            expiryDate: '',
            showUpgrades: true,
            showScopeNotes: true,
            showCommitment: true,
            commitment: {
                title: 'OUR COMMITMENT TO YOU',
                items: [
                    { icon: 'fa-solid fa-shield-halved', image: '', label: '1-Year Warranty', text: 'Workmanship guaranteed for 12 months from project completion' },
                    { icon: 'fa-solid fa-industry', image: '', label: 'Manufacturer Warranty', text: 'All materials carry full manufacturer warranty - passed directly to you' },
                    { icon: 'fa-solid fa-clipboard-check', image: '', label: 'Fully Insured', text: 'Liability insurance coverage on all work performed' },
                    { icon: 'fa-solid fa-handshake', image: '', label: 'Satisfaction Promise', text: 'Any concerns addressed promptly - your satisfaction is our priority' }
                ]
            },
            clientMessage: ''
        };

        function syncQuoteStyleGlobal() {
            window._quoteStyle = _quoteStyle;
        }

        async function saveQuoteStyleDefaultsToCloud(style) {
            try {
                if (typeof _supabase === 'undefined') return;
                var user = await _supabase.auth.getUser();
                if (!user.data || !user.data.user) return;
                await _supabase.from('user_data').upsert(
                    { user_id: user.data.user.id, key: 'quote_send_style', value: style, updated_at: new Date().toISOString() },
                    { onConflict: 'user_id,key' }
                );
            } catch(e) {
                console.warn('Quote send defaults cloud save failed:', e);
            }
        }

        async function loadQuoteStyleDefaults() {
            var savedDefault = {};
            try { savedDefault = JSON.parse(localStorage.getItem('ald_quote_send_style') || '{}'); } catch(e) { savedDefault = {}; }
            try {
                if (typeof _supabase === 'undefined') return savedDefault;
                var user = await _supabase.auth.getUser();
                if (!user.data || !user.data.user) return savedDefault;
                var result = await _supabase
                    .from('user_data')
                    .select('value')
                    .eq('user_id', user.data.user.id)
                    .eq('key', 'quote_send_style')
                    .maybeSingle();
                if (result.data && result.data.value && Object.keys(result.data.value).length) {
                    savedDefault = result.data.value;
                    localStorage.setItem('ald_quote_send_style', JSON.stringify(savedDefault));
                }
            } catch(e) {
                console.warn('Quote send defaults cloud load failed:', e);
            }
            return savedDefault;
        }

        var COMMITMENT_ICON_LIBRARY = [
            { group: 'Trust', icon: 'fa-solid fa-shield-halved', label: 'Warranty' },
            { group: 'Trust', icon: 'fa-solid fa-award', label: 'Award' },
            { group: 'Trust', icon: 'fa-solid fa-certificate', label: 'Certified' },
            { group: 'Trust', icon: 'fa-solid fa-medal', label: 'Quality' },
            { group: 'Trust', icon: 'fa-solid fa-star', label: 'Premium' },
            { group: 'Trust', icon: 'fa-solid fa-gem', label: 'Premium finish' },
            { group: 'Trust', icon: 'fa-solid fa-ranking-star', label: 'Top rated' },
            { group: 'Trust', icon: 'fa-solid fa-stamp', label: 'Approved stamp' },
            { group: 'Trust', icon: 'fa-solid fa-ribbon', label: 'Ribbon' },
            { group: 'Protection', icon: 'fa-solid fa-clipboard-check', label: 'Insured' },
            { group: 'Protection', icon: 'fa-solid fa-user-shield', label: 'Protected' },
            { group: 'Protection', icon: 'fa-solid fa-lock', label: 'Secure' },
            { group: 'Protection', icon: 'fa-solid fa-scale-balanced', label: 'Fair terms' },
            { group: 'Protection', icon: 'fa-solid fa-file-shield', label: 'Protected file' },
            { group: 'Protection', icon: 'fa-solid fa-house-lock', label: 'Home protection' },
            { group: 'Protection', icon: 'fa-solid fa-triangle-exclamation', label: 'Safety warning' },
            { group: 'Protection', icon: 'fa-solid fa-kit-medical', label: 'First aid' },
            { group: 'Service', icon: 'fa-solid fa-handshake', label: 'Promise' },
            { group: 'Service', icon: 'fa-solid fa-thumbs-up', label: 'Approval' },
            { group: 'Service', icon: 'fa-solid fa-circle-check', label: 'Checked' },
            { group: 'Service', icon: 'fa-solid fa-heart', label: 'Care' },
            { group: 'Service', icon: 'fa-solid fa-face-smile', label: 'Friendly' },
            { group: 'Service', icon: 'fa-solid fa-comments', label: 'Communication' },
            { group: 'Service', icon: 'fa-solid fa-phone', label: 'Support' },
            { group: 'Service', icon: 'fa-solid fa-headset', label: 'Help desk' },
            { group: 'Service', icon: 'fa-solid fa-user-check', label: 'Client approved' },
            { group: 'Craft', icon: 'fa-solid fa-house-chimney', label: 'Home' },
            { group: 'Craft', icon: 'fa-solid fa-hammer', label: 'Workmanship' },
            { group: 'Craft', icon: 'fa-solid fa-screwdriver-wrench', label: 'Tools' },
            { group: 'Craft', icon: 'fa-solid fa-wrench', label: 'Repair' },
            { group: 'Craft', icon: 'fa-solid fa-screwdriver', label: 'Install' },
            { group: 'Craft', icon: 'fa-solid fa-ruler-combined', label: 'Measured' },
            { group: 'Craft', icon: 'fa-solid fa-helmet-safety', label: 'Safety' },
            { group: 'Craft', icon: 'fa-solid fa-person-digging', label: 'Construction' },
            { group: 'Craft', icon: 'fa-solid fa-paint-roller', label: 'Finish' },
            { group: 'Craft', icon: 'fa-solid fa-brush', label: 'Paint' },
            { group: 'Craft', icon: 'fa-solid fa-trowel-bricks', label: 'Masonry' },
            { group: 'Craft', icon: 'fa-solid fa-plug-circle-check', label: 'Electrical' },
            { group: 'Materials', icon: 'fa-solid fa-industry', label: 'Manufacturer' },
            { group: 'Materials', icon: 'fa-solid fa-boxes-stacked', label: 'Materials' },
            { group: 'Materials', icon: 'fa-solid fa-box-open', label: 'Supplies' },
            { group: 'Materials', icon: 'fa-solid fa-truck-fast', label: 'Delivery' },
            { group: 'Materials', icon: 'fa-solid fa-warehouse', label: 'Warehouse' },
            { group: 'Materials', icon: 'fa-solid fa-dolly', label: 'Handling' },
            { group: 'Materials', icon: 'fa-solid fa-barcode', label: 'Tracked materials' },
            { group: 'Schedule', icon: 'fa-solid fa-calendar-check', label: 'Schedule' },
            { group: 'Schedule', icon: 'fa-solid fa-clock', label: 'On time' },
            { group: 'Schedule', icon: 'fa-solid fa-stopwatch', label: 'Fast' },
            { group: 'Schedule', icon: 'fa-solid fa-list-check', label: 'Checklist' },
            { group: 'Schedule', icon: 'fa-solid fa-clipboard-list', label: 'Scope list' },
            { group: 'Schedule', icon: 'fa-solid fa-route', label: 'Planned route' },
            { group: 'Schedule', icon: 'fa-solid fa-flag-checkered', label: 'Finished' },
            { group: 'Clean Site', icon: 'fa-solid fa-broom', label: 'Clean site' },
            { group: 'Clean Site', icon: 'fa-solid fa-bucket', label: 'Cleanup' },
            { group: 'Clean Site', icon: 'fa-solid fa-spray-can-sparkles', label: 'Sparkling clean' },
            { group: 'Clean Site', icon: 'fa-solid fa-trash-can', label: 'Waste removed' },
            { group: 'Clean Site', icon: 'fa-solid fa-recycle', label: 'Eco' },
            { group: 'Clean Site', icon: 'fa-solid fa-leaf', label: 'Green' },
            { group: 'Documents', icon: 'fa-solid fa-file-contract', label: 'Contract' },
            { group: 'Documents', icon: 'fa-solid fa-file-signature', label: 'Signed document' },
            { group: 'Documents', icon: 'fa-solid fa-file-invoice-dollar', label: 'Invoice' },
            { group: 'Documents', icon: 'fa-solid fa-receipt', label: 'Receipts' },
            { group: 'Documents', icon: 'fa-solid fa-credit-card', label: 'Payment' },
            { group: 'Documents', icon: 'fa-solid fa-money-check-dollar', label: 'Deposit' },
            { group: 'Documents', icon: 'fa-solid fa-camera', label: 'Photos' },
            { group: 'Documents', icon: 'fa-solid fa-lightbulb', label: 'Ideas' }
        ];

        function defaultCommitmentItemsForModal() {
            return [
                { icon: 'fa-solid fa-shield-halved', image: '', label: '1-Year Warranty', text: 'Workmanship guaranteed for 12 months from project completion' },
                { icon: 'fa-solid fa-industry', image: '', label: 'Manufacturer Warranty', text: 'All materials carry full manufacturer warranty - passed directly to you' },
                { icon: 'fa-solid fa-clipboard-check', image: '', label: 'Fully Insured', text: 'Liability insurance coverage on all work performed' },
                { icon: 'fa-solid fa-handshake', image: '', label: 'Satisfaction Promise', text: 'Any concerns addressed promptly - your satisfaction is our priority' }
            ];
        }

        function setFieldValue(id, value) {
            var el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value || '';
        }

        function formatDateInput(date) {
            var y = date.getFullYear();
            var m = String(date.getMonth() + 1).padStart(2, '0');
            var d = String(date.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + d;
        }

        function setQuoteExpiryPreset(days) {
            var date = new Date();
            date.setDate(date.getDate() + days);
            var expiryEl = document.getElementById('quoteExpiryDate');
            if (expiryEl) expiryEl.value = formatDateInput(date);
            document.querySelectorAll('.expiry-preset-btn').forEach(function(btn) {
                btn.classList.toggle('active', parseInt(btn.dataset.days, 10) === days);
            });
            updateStylePreview();
        }

        async function saveQuoteStyleDefaults(showToast) {
            _quoteStyle = readQuoteStyleFromControls();
            syncQuoteStyleGlobal();
            try {
                localStorage.setItem('ald_quote_send_style', JSON.stringify(_quoteStyle));
                await saveQuoteStyleDefaultsToCloud(_quoteStyle);
                if (showToast !== false) {
                    var saveStatus = document.getElementById('saveStatus');
                    if (saveStatus) saveStatus.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> Quote send defaults saved</span>';
                }
                return true;
            } catch(e) {
                alert('Could not save defaults in this browser.');
                return false;
            }
        }

        function readQuoteStyleFromControls() {
            var style = Object.assign({}, _quoteStyle);
            style.headerStyle = document.getElementById('quoteHeaderStyle')?.value || style.headerStyle;
            style.headerOpacity = parseInt(document.getElementById('quoteHeaderOpacity')?.value || style.headerOpacity || 100, 10);
            if (!isFinite(style.headerOpacity)) style.headerOpacity = 100;
            style.headerOpacity = Math.max(20, Math.min(style.headerOpacity, 100));
            style.bgOpacity = parseInt(document.getElementById('quoteBgOpacity')?.value || style.bgOpacity || 100, 10);
            if (!isFinite(style.bgOpacity)) style.bgOpacity = 100;
            style.bgOpacity = Math.max(0, Math.min(style.bgOpacity, 100));
            style.fontFeel = document.getElementById('quoteFontFeel')?.value || style.fontFeel;
            style.pricingMode = document.getElementById('quotePricingMode')?.value || style.pricingMode;
            style.depositMode = document.getElementById('quoteDepositMode')?.value || style.depositMode;
            style.depositPercent = parseFloat(document.getElementById('quoteDepositPercent')?.value || style.depositPercent || 50);
            if (!isFinite(style.depositPercent) || style.depositPercent <= 0) style.depositPercent = 50;
            style.depositPercent = Math.min(style.depositPercent, 100);
            style.approvalMode = document.getElementById('quoteApprovalMode')?.value || style.approvalMode;
            style.expiryDate = document.getElementById('quoteExpiryDate')?.value || '';
            style.showUpgrades = document.getElementById('quoteShowUpgrades')?.checked !== false;
            style.showScopeNotes = document.getElementById('quoteShowScopeNotes')?.checked !== false;
            style.showCommitment = document.getElementById('quoteShowCommitment')?.checked !== false;
            var commitmentItems = defaultCommitmentItemsForModal().map(function(item, i) {
                var n = i + 1;
                return {
                    icon: document.getElementById('commitmentIcon' + n)?.value || item.icon,
                    image: safeCommitmentImage(document.getElementById('commitmentImage' + n)?.value || ''),
                    label: document.getElementById('commitmentLabel' + n)?.value.trim() || item.label,
                    text: document.getElementById('commitmentText' + n)?.value.trim() || item.text
                };
            });
            style.commitment = {
                title: document.getElementById('commitmentTitleInput')?.value.trim() || 'OUR COMMITMENT TO YOU',
                items: commitmentItems
            };
            style.clientMessage = document.getElementById('quoteClientMessage')?.value.trim() || '';
            return style;
        }

        function applyQuoteStyleToControls(style) {
            _quoteStyle = Object.assign({}, _quoteStyle, style || {});
            if (!isFinite(parseInt(_quoteStyle.headerOpacity, 10))) _quoteStyle.headerOpacity = 100;
            if (!isFinite(parseInt(_quoteStyle.bgOpacity, 10))) _quoteStyle.bgOpacity = 100;
            syncQuoteStyleGlobal();
            setFieldValue('quoteHeaderStyle', _quoteStyle.headerStyle);
            setFieldValue('quoteHeaderOpacity', _quoteStyle.headerOpacity);
            updateHeaderOpacityLabel(_quoteStyle.headerOpacity);
            setFieldValue('quoteBgOpacity', _quoteStyle.bgOpacity);
            updateBgOpacityLabel(_quoteStyle.bgOpacity);
            setFieldValue('quoteFontFeel', _quoteStyle.fontFeel);
            setFieldValue('quotePricingMode', _quoteStyle.pricingMode);
            setFieldValue('quoteDepositMode', _quoteStyle.depositMode);
            setFieldValue('quoteDepositPercent', _quoteStyle.depositPercent || 50);
            setFieldValue('quoteApprovalMode', _quoteStyle.approvalMode);
            setFieldValue('quoteExpiryDate', _quoteStyle.expiryDate);
            setFieldValue('quoteShowUpgrades', _quoteStyle.showUpgrades);
            setFieldValue('quoteShowScopeNotes', _quoteStyle.showScopeNotes);
            setFieldValue('quoteShowCommitment', _quoteStyle.showCommitment !== false);
            var commitment = _quoteStyle.commitment || {};
            var items = Array.isArray(commitment.items) && commitment.items.length ? commitment.items : defaultCommitmentItemsForModal();
            setFieldValue('commitmentTitleInput', commitment.title || 'OUR COMMITMENT TO YOU');
            for (var i = 0; i < 4; i++) {
                var item = items[i] || defaultCommitmentItemsForModal()[i];
                setFieldValue('commitmentIcon' + (i + 1), item.icon || defaultCommitmentItemsForModal()[i].icon);
                setFieldValue('commitmentImage' + (i + 1), safeCommitmentImage(item.image || ''));
                setFieldValue('commitmentLabel' + (i + 1), item.label);
                setFieldValue('commitmentText' + (i + 1), item.text);
            }
            refreshCommitmentIconButtons();
            setFieldValue('quoteClientMessage', _quoteStyle.clientMessage);
            document.querySelectorAll('.expiry-preset-btn').forEach(function(btn) {
                var date = new Date();
                date.setDate(date.getDate() + parseInt(btn.dataset.days, 10));
                btn.classList.toggle('active', _quoteStyle.expiryDate === formatDateInput(date));
            });

            document.querySelectorAll('#stylePresets .quote-style-preset').forEach(function(btn) {
                btn.classList.toggle('selected', btn.getAttribute('data-preset') === _quoteStyle.preset);
            });
            document.querySelectorAll('#accentSwatches .style-swatch').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-accent') === _quoteStyle.accent);
            });
            document.querySelectorAll('#bgSwatches .style-swatch').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-bg') === _quoteStyle.bg);
            });
            updateStylePreview();
        }

        function updateStylePreview() {
            _quoteStyle = readQuoteStyleFromControls();
            syncQuoteStyleGlobal();
            var prev = document.getElementById('stylePreview');
            var hdr = document.getElementById('previewHeader');
            var tot = document.getElementById('previewTotal');
            var msg = document.getElementById('previewMessage');
            var pricing = document.getElementById('previewPricingLabel');
            var mode = document.getElementById('previewHeaderMode');
            var accent = _quoteStyle.accent || '#1a56a0';
            var headerOpacity = Math.max(20, Math.min(parseInt(_quoteStyle.headerOpacity || 100, 10), 100));
            updateHeaderOpacityLabel(headerOpacity);
            var bgOpacity = parseInt(_quoteStyle.bgOpacity, 10);
            if (!isFinite(bgOpacity)) bgOpacity = 100;
            bgOpacity = Math.max(0, Math.min(bgOpacity, 100));
            updateBgOpacityLabel(bgOpacity);
            var previewBg = blendColorWithWhite(_quoteStyle.bg || '#ffffff', bgOpacity);
            var isLight = _quoteStyle.headerStyle === 'light' || accent === '#ffffff' || headerOpacity < 55;
            if (prev) prev.style.background = previewBg;
            if (hdr) {
                var headerBg = _quoteStyle.headerStyle === 'dark'
                    ? colorWithOpacity('#172033', headerOpacity)
                    : (_quoteStyle.headerStyle === 'light' || accent === '#ffffff' ? '#ffffff' : colorWithOpacity(accent, headerOpacity));
                hdr.style.background = headerBg;
                hdr.style.color = isLight ? '#1f3349' : '#ffffff';
                hdr.style.borderBottom = isLight ? '1px solid #dbe4ef' : 'none';
            }
            if (tot) {
                tot.style.background = accent === '#ffffff' ? '#1a56a0' : accent;
                tot.style.color = '#ffffff';
            }
            if (msg) {
                msg.style.display = _quoteStyle.clientMessage ? 'block' : 'none';
                msg.textContent = _quoteStyle.clientMessage;
            }
            if (pricing) {
                var labels = { full: 'Full itemized quote', category: 'Category subtotals only', total: 'Total only' };
                var depositNote = _quoteStyle.depositMode === 'show' ? ' | ' + (_quoteStyle.depositPercent || 50) + '% deposit shown' : '';
                pricing.textContent = (labels[_quoteStyle.pricingMode] || labels.full) + depositNote;
            }
            if (mode) mode.textContent = _quoteStyle.approvalMode === 'review' ? 'Review-only link' : 'Client-ready estimate';
        }

        function hexToRgb(hex) {
            var value = String(hex || '').replace('#', '').trim();
            if (value.length === 3) value = value.split('').map(function(ch) { return ch + ch; }).join('');
            if (!/^[0-9a-f]{6}$/i.test(value)) return null;
            return {
                r: parseInt(value.slice(0, 2), 16),
                g: parseInt(value.slice(2, 4), 16),
                b: parseInt(value.slice(4, 6), 16)
            };
        }

        function colorWithOpacity(hex, opacityPercent) {
            var rgb = hexToRgb(hex);
            if (!rgb) return hex || '#1a56a0';
            var alpha = Math.max(20, Math.min(parseInt(opacityPercent || 100, 10), 100)) / 100;
            return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha.toFixed(2) + ')';
        }

        function blendColorWithWhite(hex, opacityPercent) {
            var rgb = hexToRgb(hex);
            if (!rgb) return hex || '#ffffff';
            var value = parseInt(opacityPercent, 10);
            if (!isFinite(value)) value = 100;
            var alpha = Math.max(0, Math.min(value, 100)) / 100;
            var r = Math.round(255 + (rgb.r - 255) * alpha);
            var g = Math.round(255 + (rgb.g - 255) * alpha);
            var b = Math.round(255 + (rgb.b - 255) * alpha);
            return 'rgb(' + r + ', ' + g + ', ' + b + ')';
        }

        function updateHeaderOpacityLabel(value) {
            var label = document.getElementById('quoteHeaderOpacityValue');
            if (label) label.textContent = Math.max(20, Math.min(parseInt(value || 100, 10), 100)) + '%';
        }

        function updateBgOpacityLabel(value) {
            var label = document.getElementById('quoteBgOpacityValue');
            var parsed = parseInt(value, 10);
            if (!isFinite(parsed)) parsed = 100;
            if (label) label.textContent = Math.max(0, Math.min(parsed, 100)) + '%';
        }

        function safeCommitmentIcon(icon) {
            var fallback = 'fa-solid fa-circle-check';
            var value = String(icon || '').trim();
            if (!value || !/^fa[-\w\s]+$/.test(value)) return fallback;
            return value;
        }

        function safeCommitmentImage(src) {
            var value = String(src || '').trim();
            if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return value;
            return '';
        }

        function refreshCommitmentIconButtons() {
            for (var i = 1; i <= 4; i++) {
                var input = document.getElementById('commitmentIcon' + i);
                var imageInput = document.getElementById('commitmentImage' + i);
                var preview = document.getElementById('commitmentIconPreview' + i);
                var icon = safeCommitmentIcon(input ? input.value : '');
                var image = safeCommitmentImage(imageInput ? imageInput.value : '');
                if (input) input.value = icon;
                if (imageInput) imageInput.value = image;
                if (preview) {
                    preview.innerHTML = image ? '<img src="' + image + '" alt="">' : '<i class="' + icon + '"></i>';
                }
                document.querySelectorAll('#commitmentIconLibrary' + i + ' .commitment-icon-option').forEach(function(btn) {
                    btn.classList.toggle('selected', !image && btn.getAttribute('data-icon') === icon);
                });
            }
        }

        function renderCommitmentIconLibraries() {
            for (var i = 1; i <= 4; i++) {
                var library = document.getElementById('commitmentIconLibrary' + i);
                if (!library || library.dataset.rendered) continue;
                var currentGroup = '';
                var html = '';
                COMMITMENT_ICON_LIBRARY.forEach(function(iconItem) {
                    if (iconItem.group && iconItem.group !== currentGroup) {
                        currentGroup = iconItem.group;
                        html += '<div class="commitment-icon-group-label">' + currentGroup + '</div>';
                    }
                    html += '<button type="button" class="commitment-icon-option" data-icon="' + iconItem.icon + '" title="' + iconItem.label + '" aria-label="' + iconItem.label + '">' +
                        '<i class="' + iconItem.icon + '"></i>' +
                        '</button>';
                });
                library.innerHTML = html;
                library.dataset.rendered = '1';
            }
            refreshCommitmentIconButtons();
        }

        function resizeCommitmentImageFile(file, callback) {
            if (!file || !/^image\//.test(file.type || '')) {
                alert('Please choose an image file.');
                return;
            }
            var reader = new FileReader();
            reader.onload = function() {
                var img = new Image();
                img.onload = function() {
                    var max = 240;
                    var scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round((img.width || max) * scale));
                    canvas.height = Math.max(1, Math.round((img.height || max) * scale));
                    var ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    callback(canvas.toDataURL('image/png'));
                };
                img.onerror = function() {
                    alert('That image could not be loaded. Try a PNG or JPG.');
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        function initCommitmentIconPickers() {
            renderCommitmentIconLibraries();
            document.querySelectorAll('[data-commitment-icon-toggle]').forEach(function(btn) {
                if (btn.dataset.iconBound) return;
                btn.addEventListener('click', function() {
                    var n = btn.getAttribute('data-commitment-icon-toggle');
                    document.querySelectorAll('.commitment-icon-library').forEach(function(lib) {
                        lib.classList.toggle('open', lib.id === 'commitmentIconLibrary' + n && !lib.classList.contains('open'));
                    });
                });
                btn.dataset.iconBound = '1';
            });
            document.querySelectorAll('.commitment-icon-library').forEach(function(library) {
                if (library.dataset.pickBound) return;
                library.addEventListener('click', function(e) {
                    var btn = e.target.closest('.commitment-icon-option');
                    if (!btn) return;
                    var n = library.id.replace('commitmentIconLibrary', '');
                    var input = document.getElementById('commitmentIcon' + n);
                    var imageInput = document.getElementById('commitmentImage' + n);
                    if (input) input.value = btn.getAttribute('data-icon');
                    if (imageInput) imageInput.value = '';
                    library.classList.remove('open');
                    refreshCommitmentIconButtons();
                    updateStylePreview();
                });
                library.dataset.pickBound = '1';
            });
            document.querySelectorAll('[data-commitment-upload]').forEach(function(btn) {
                if (btn.dataset.uploadBound) return;
                btn.addEventListener('click', function() {
                    var n = btn.getAttribute('data-commitment-upload');
                    var fileInput = document.getElementById('commitmentImageFile' + n);
                    if (fileInput) fileInput.click();
                });
                btn.dataset.uploadBound = '1';
            });
            document.querySelectorAll('[data-commitment-clear]').forEach(function(btn) {
                if (btn.dataset.clearBound) return;
                btn.addEventListener('click', function() {
                    var n = btn.getAttribute('data-commitment-clear');
                    var imageInput = document.getElementById('commitmentImage' + n);
                    var fileInput = document.getElementById('commitmentImageFile' + n);
                    if (imageInput) imageInput.value = '';
                    if (fileInput) fileInput.value = '';
                    refreshCommitmentIconButtons();
                    updateStylePreview();
                });
                btn.dataset.clearBound = '1';
            });
            document.querySelectorAll('[id^="commitmentImageFile"]').forEach(function(fileInput) {
                if (fileInput.dataset.fileBound) return;
                fileInput.addEventListener('change', function() {
                    var n = fileInput.id.replace('commitmentImageFile', '');
                    var imageInput = document.getElementById('commitmentImage' + n);
                    resizeCommitmentImageFile(fileInput.files && fileInput.files[0], function(dataUrl) {
                        if (imageInput) imageInput.value = dataUrl;
                        document.querySelectorAll('.commitment-icon-library').forEach(function(lib) { lib.classList.remove('open'); });
                        refreshCommitmentIconButtons();
                        updateStylePreview();
                    });
                });
                fileInput.dataset.fileBound = '1';
            });
        }

        async function initStyleModal() {
            var savedDefault = await loadQuoteStyleDefaults();
            applyQuoteStyleToControls(savedDefault);
            initCommitmentIconPickers();

            document.querySelectorAll('#stylePresets .quote-style-preset').forEach(function(btn) {
                btn.onclick = function() {
                    _quoteStyle.preset = btn.getAttribute('data-preset') || 'custom';
                    _quoteStyle.accent = btn.getAttribute('data-accent') || _quoteStyle.accent;
                    _quoteStyle.bg = btn.getAttribute('data-bg') || _quoteStyle.bg;
                    _quoteStyle.headerStyle = btn.getAttribute('data-header') || _quoteStyle.headerStyle;
                    _quoteStyle.fontFeel = btn.getAttribute('data-font') || _quoteStyle.fontFeel;
                    syncQuoteStyleGlobal();
                    applyQuoteStyleToControls(_quoteStyle);
                };
            });
            document.querySelectorAll('#accentSwatches .style-swatch').forEach(function(sw) {
                sw.onclick = function() {
                    _quoteStyle.preset = 'custom';
                    _quoteStyle.accent = sw.getAttribute('data-accent');
                    syncQuoteStyleGlobal();
                    applyQuoteStyleToControls(_quoteStyle);
                };
            });
            document.querySelectorAll('#bgSwatches .style-swatch').forEach(function(sw) {
                sw.onclick = function() {
                    _quoteStyle.preset = 'custom';
                    _quoteStyle.bg = sw.getAttribute('data-bg');
                    syncQuoteStyleGlobal();
                    applyQuoteStyleToControls(_quoteStyle);
                };
            });
            ['quoteHeaderStyle','quoteHeaderOpacity','quoteBgOpacity','quoteFontFeel','quotePricingMode','quoteDepositMode','quoteDepositPercent','quoteApprovalMode','quoteExpiryDate','quoteShowUpgrades','quoteShowScopeNotes','quoteShowCommitment','commitmentTitleInput','commitmentIcon1','commitmentImage1','commitmentLabel1','commitmentText1','commitmentIcon2','commitmentImage2','commitmentLabel2','commitmentText2','commitmentIcon3','commitmentImage3','commitmentLabel3','commitmentText3','commitmentIcon4','commitmentImage4','commitmentLabel4','commitmentText4','quoteClientMessage'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el && !el.dataset.styleBound) {
                    el.addEventListener('input', updateStylePreview);
                    el.addEventListener('change', updateStylePreview);
                    el.dataset.styleBound = '1';
                }
            });
        }

        function generateInteractiveLink() {
            if (rooms.length === 0) {
                alert('Please add at least one room before generating an interactive quote.');
                return;
            }
            markQuoteNumberUsed(document.getElementById('quoteNumber')?.value);
            openQuoteSendSettingsModal(false);
        }

        async function openQuoteSendSettingsModal(settingsOnly) {
            window._quoteStyleSettingsOnly = !!settingsOnly;
            await initStyleModal();
            var generateBtn = document.getElementById('quoteStyleGenerateBtn');
            if (generateBtn) {
                generateBtn.innerHTML = settingsOnly
                    ? '<i class="fas fa-check me-1"></i>Done'
                    : '<i class="fas fa-share-square me-1"></i>Generate Quote Link';
            }
            var modal = new bootstrap.Modal(document.getElementById('quoteStyleModal'));
            modal.show();
        }

        async function confirmGenerateQuote() {
            var styleModal = bootstrap.Modal.getInstance(document.getElementById('quoteStyleModal'));
            if (window._quoteStyleSettingsOnly) {
                await saveQuoteStyleDefaults(true);
                if (styleModal) styleModal.hide();
                return;
            }
            if (styleModal) styleModal.hide();

            // Show saving indicator
            var saveStatus = document.getElementById('saveStatus');
            if (saveStatus) saveStatus.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-spinner fa-spin"></i> Saving quote...</span>';

            _quoteStyle = readQuoteStyleFromControls();
            syncQuoteStyleGlobal();
            if (document.getElementById('quoteSaveDefaultStyle')?.checked) {
                await saveQuoteStyleDefaults(false);
            }

            const quoteData = collectQuoteData();
            quoteData.style = JSON.parse(JSON.stringify(_quoteStyle));
            if (window._supabaseQuoteId) quoteData.supabaseId = window._supabaseQuoteId;

            try {
                const result = await saveQuoteForSharing(quoteData);
                if (result.error) throw result.error;

                const supabaseId = result.data.id;
                window._supabaseQuoteId = supabaseId;
                localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);

                const _base = window.location.href.split('?')[0].split('#')[0].replace(/quote-builder(\.html)?\/?$/, '');
                const viewerUrl = _base + 'interactive-quote-viewer?id=' + supabaseId;

                if (saveStatus) saveStatus.innerHTML = '<span style="color:green;"><i class="fas fa-check"></i> Quote saved!</span>';

                // Show the link modal
                let modal = document.getElementById('interactiveLinkModal');
                if (!modal) {
                    document.body.insertAdjacentHTML('beforeend', `
                        <div class="modal fade" id="interactiveLinkModal" tabindex="-1">
                            <div class="modal-dialog">
                                <div class="modal-content">
                                    <div class="modal-header bg-success text-white">
                                        <h5 class="modal-title"><i class="fas fa-check-circle"></i> Quote Ready!</h5>
                                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                                    </div>
                                    <div class="modal-body">
                                        <p class="text-muted small mb-2">Share this link with your client:</p>
                                        <div class="input-group mb-3">
                                            <input type="text" id="interactiveLinkInput" class="form-control" readonly>
                                            <button class="btn btn-outline-secondary" onclick="copyInteractiveLink()" title="Copy to clipboard">
                                                <i class="fas fa-copy"></i> Copy
                                            </button>
                                        </div>
                                        <!-- Email to client -->
                                        <div style="border:1px solid #dee2e6; border-radius:8px; padding:14px; background:#f8f9fa; margin-bottom:12px;">
                                            <div class="fw-bold small mb-2"><i class="fas fa-envelope me-1" style="color:#1a56a0;"></i>Email directly to client</div>
                                            <input type="email" id="sendQuoteEmail" class="form-control form-control-sm mb-2" placeholder="Client email address">
                                            <textarea id="sendQuoteMessage" class="form-control form-control-sm mb-2" rows="2" placeholder="Optional personal message (e.g. Great chatting with you! Let me know if you have any questions.)"></textarea>
                                            <button class="btn btn-primary btn-sm w-100" onclick="sendQuoteByEmail()" id="sendQuoteEmailBtn">
                                                <i class="fas fa-paper-plane me-1"></i>Send Quote by Email
                                            </button>
                                            <div id="sendQuoteEmailResult" class="mt-2 small"></div>
                                        </div>
                                        <a id="openViewerBtn" href="#" class="btn btn-outline-success w-100" onclick="saveSessionQuote(); window.location.href=this.href; return false;">
                                            <i class="fas fa-external-link-alt me-1"></i>Open Client View
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                document.getElementById('interactiveLinkInput').value = viewerUrl;
                document.getElementById('openViewerBtn').href = viewerUrl;
                // Pre-fill client email if available
                var clientEmail = document.getElementById('clientEmail')?.value.trim();
                var sendEmailEl = document.getElementById('sendQuoteEmail');
                if (sendEmailEl && clientEmail) sendEmailEl.value = clientEmail;
                var sendMessageEl = document.getElementById('sendQuoteMessage');
                if (sendMessageEl && _quoteStyle.clientMessage) sendMessageEl.value = _quoteStyle.clientMessage;
                // Clear previous result
                var resultEl = document.getElementById('sendQuoteEmailResult');
                if (resultEl) resultEl.innerHTML = '';
                var linkModalEl = document.getElementById('interactiveLinkModal');
                var linkModal = bootstrap.Modal.getInstance(linkModalEl) || new bootstrap.Modal(linkModalEl);
                linkModal.show();

            } catch(err) {
                console.error('Failed to save quote:', err);
                alert('Failed to save quote to cloud: ' + (err.message || err));
                if (saveStatus) saveStatus.innerHTML = '<span style="color:red;"><i class="fas fa-times"></i> Save failed</span>';
            }
        }

        syncQuoteStyleGlobal();
        window.COMMITMENT_ICON_LIBRARY = COMMITMENT_ICON_LIBRARY;
        window.defaultCommitmentItemsForModal = defaultCommitmentItemsForModal;
        window.setFieldValue = setFieldValue;
        window.formatDateInput = formatDateInput;
        window.setQuoteExpiryPreset = setQuoteExpiryPreset;
        window.saveQuoteStyleDefaults = saveQuoteStyleDefaults;
        window.loadQuoteStyleDefaults = loadQuoteStyleDefaults;
        window.readQuoteStyleFromControls = readQuoteStyleFromControls;
        window.applyQuoteStyleToControls = applyQuoteStyleToControls;
        window.updateStylePreview = updateStylePreview;
        window.safeCommitmentIcon = safeCommitmentIcon;
        window.safeCommitmentImage = safeCommitmentImage;
        window.refreshCommitmentIconButtons = refreshCommitmentIconButtons;
        window.renderCommitmentIconLibraries = renderCommitmentIconLibraries;
        window.resizeCommitmentImageFile = resizeCommitmentImageFile;
        window.initCommitmentIconPickers = initCommitmentIconPickers;
        window.initStyleModal = initStyleModal;
        window.generateInteractiveLink = generateInteractiveLink;
        window.openQuoteSendSettingsModal = openQuoteSendSettingsModal;
        window.confirmGenerateQuote = confirmGenerateQuote;
})();
