// Quote Style Modal module extracted from quote-builder.html.
// Depends on quote-builder globals: rooms, markQuoteNumberUsed, collectQuoteData, saveQuoteForSharing, bootstrap.
(function() {
    'use strict';

        // Quote style state
        var _quoteStyle = {
            preset: 'clean-blue',
            accent: '#1a56a0',
            accentStrength: 100,
            optionAccent: '#1a56a0',
            optionAccentStrength: 100,
            upgradeAccent: '#0d9488',
            upgradeBg: '#f8fafc',
            bg: '#f7fbff',
            bgOpacity: 100,
            headerStyle: 'branded',
            headerEffect: 'soft-gradient',
            headerOpacity: 100,
            fontFeel: 'clean',
            pricingMode: 'full',
            depositMode: 'auto',
            depositPercent: 50,
            approvalMode: 'approve_or_changes',
            expiryDate: '',
            showUpgrades: true,
            showScopeNotes: true,
            descriptionPreviewLength: 260,
            alwaysShowFullDescriptions: false,
            showCommitment: true,
            skipSettingsOnGenerate: false,
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

        var QUOTE_STYLE_COLOUR_FAVOURITES_KEY = 'quotedr_quote_style_colour_favourites';
        var QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT = 5;
        var QUOTE_STYLE_COLOUR_AREAS = {
            accent: { containerId: 'accentSwatches', fieldId: '', styleKey: 'accent', label: 'Accent Colour' },
            optionAccent: { containerId: 'optionAccentSwatches', fieldId: 'quoteOptionAccent', styleKey: 'optionAccent', label: 'Option Group Colour' },
            upgradeAccent: { containerId: 'upgradeAccentSwatches', fieldId: 'quoteUpgradeAccent', styleKey: 'upgradeAccent', label: 'Upgrade Options Colour' },
            upgradeBg: { containerId: 'upgradeBgSwatches', fieldId: 'quoteUpgradeBg', styleKey: 'upgradeBg', label: 'Upgrade Card Background' },
            bg: { containerId: 'bgSwatches', fieldId: '', styleKey: 'bg', label: 'Background Tint' }
        };

        var QUOTE_STUDIO_MESSAGE_VERSION = 1;
        var _quoteStudioFrameReady = false;
        var _quoteStudioSnapshot = null;
        var _quoteStudioStyleTimer = null;
        var _quoteStudioLoadTimer = null;
        var _quoteStudioMessagingBound = false;
        var QUOTE_DESCRIPTION_PREVIEW_DEFAULT = 260;
        var QUOTE_DESCRIPTION_PREVIEW_MIN = 120;
        var QUOTE_DESCRIPTION_PREVIEW_MAX = 600;

        function syncQuoteStyleGlobal() {
            window._quoteStyle = _quoteStyle;
        }

        function quoteStudioClone(value) {
            try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
        }

        function quoteStudioModalIsOpen() {
            return document.getElementById('quoteStyleModal')?.classList.contains('show') === true;
        }

        function getQuoteStudioFrame() {
            return document.getElementById('quoteStylePreviewFrame');
        }

        function setQuoteStudioPreviewState(state, message) {
            var status = document.getElementById('quoteStylePreviewStatus');
            var statusText = document.getElementById('quoteStylePreviewStatusText');
            var overlay = document.getElementById('quoteStylePreviewState');
            var title = document.getElementById('quoteStylePreviewStateTitle');
            var detail = document.getElementById('quoteStylePreviewStateMessage');
            var icon = document.getElementById('quoteStylePreviewStateIcon');
            var retry = document.getElementById('quoteStylePreviewRetryBtn');

            if (status) {
                status.classList.toggle('is-ready', state === 'ready');
                status.classList.toggle('is-error', state === 'error');
            }
            if (statusText) statusText.textContent = message || (state === 'ready' ? 'Live preview ready' : (state === 'error' ? 'Preview unavailable' : 'Preparing preview'));
            if (!overlay) return;

            overlay.hidden = state === 'ready';
            if (retry) retry.hidden = state !== 'error';
            if (icon) {
                icon.className = state === 'error'
                    ? 'fas fa-triangle-exclamation fa-lg text-danger'
                    : 'fas fa-spinner fa-spin fa-lg text-primary';
            }
            if (title) title.textContent = state === 'error' ? 'Could not load the client preview' : 'Preparing client preview...';
            if (detail) detail.textContent = state === 'error'
                ? (message || 'Refresh the preview and try again.')
                : 'The real quote viewer will appear here.';
        }

        function startQuoteStudioLoadTimeout() {
            if (_quoteStudioLoadTimer) clearTimeout(_quoteStudioLoadTimer);
            _quoteStudioLoadTimer = setTimeout(function() {
                _quoteStudioLoadTimer = null;
                setQuoteStudioPreviewState('error', 'The preview took too long to respond.');
            }, 15000);
        }

        function clearQuoteStudioLoadTimeout() {
            if (_quoteStudioLoadTimer) clearTimeout(_quoteStudioLoadTimer);
            _quoteStudioLoadTimer = null;
        }

        function buildQuoteStudioSnapshot() {
            var quote = typeof collectQuoteData === 'function'
                ? collectQuoteData()
                : { rooms: quoteStudioClone(typeof rooms !== 'undefined' ? rooms : []) };
            var loaded = window._loadedQuoteData || window._currentQuoteData || {};
            [
                'changeOrderContext', 'fullResolutionPhotosEnabled', 'data', '_roomNotes',
                '_clientUpgrades', '_clientRemovals', 'signature_url', 'signed_at',
                'approved_at', 'accepted_at', 'signed_by', 'approved_by', 'accepted_by',
                'deposit_paid', 'paymentStatus', 'payments'
            ].forEach(function(key) {
                if (loaded[key] !== undefined && quote[key] === undefined) quote[key] = quoteStudioClone(loaded[key]);
            });
            quote.style = quoteStudioClone(_quoteStyle);
            return quote;
        }

        function postQuoteStudioDocument() {
            var frame = getQuoteStudioFrame();
            if (!frame || !frame.contentWindow || !_quoteStudioFrameReady || !_quoteStudioSnapshot || !quoteStudioModalIsOpen()) return;
            setQuoteStudioPreviewState('loading', 'Rendering current quote...');
            startQuoteStudioLoadTimeout();
            frame.contentWindow.postMessage({
                type: 'quotedr-quote-studio-document',
                version: QUOTE_STUDIO_MESSAGE_VERSION,
                quote: quoteStudioClone(_quoteStudioSnapshot),
                style: quoteStudioClone(_quoteStyle)
            }, window.location.origin);
        }

        function postQuoteStudioStyle() {
            var frame = getQuoteStudioFrame();
            if (!frame || !frame.contentWindow || !_quoteStudioFrameReady || !quoteStudioModalIsOpen()) return;
            var statusText = document.getElementById('quoteStylePreviewStatusText');
            if (statusText) statusText.textContent = 'Updating preview...';
            startQuoteStudioLoadTimeout();
            frame.contentWindow.postMessage({
                type: 'quotedr-quote-studio-style',
                version: QUOTE_STUDIO_MESSAGE_VERSION,
                style: quoteStudioClone(_quoteStyle)
            }, window.location.origin);
        }

        function queueQuoteStudioStyleUpdate() {
            if (!quoteStudioModalIsOpen()) return;
            if (_quoteStudioStyleTimer) clearTimeout(_quoteStudioStyleTimer);
            _quoteStudioStyleTimer = setTimeout(function() {
                _quoteStudioStyleTimer = null;
                postQuoteStudioStyle();
            }, 100);
        }

        function bindQuoteStudioMessaging() {
            if (_quoteStudioMessagingBound) return;
            window.addEventListener('message', function(event) {
                var frame = getQuoteStudioFrame();
                if (!frame || event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
                var data = event.data || {};
                if (data.version !== QUOTE_STUDIO_MESSAGE_VERSION) return;
                if (data.type === 'quotedr-quote-studio-ready') {
                    _quoteStudioFrameReady = true;
                    postQuoteStudioDocument();
                } else if (data.type === 'quotedr-quote-studio-rendered') {
                    clearQuoteStudioLoadTimeout();
                    setQuoteStudioPreviewState('ready', data.message || 'Live preview ready');
                } else if (data.type === 'quotedr-quote-studio-error') {
                    clearQuoteStudioLoadTimeout();
                    setQuoteStudioPreviewState('error', data.message || 'The quote viewer could not render this preview.');
                }
            });
            var modalEl = document.getElementById('quoteStyleModal');
            if (modalEl) {
                modalEl.addEventListener('hidden.bs.modal', function() {
                    if (_quoteStudioStyleTimer) clearTimeout(_quoteStudioStyleTimer);
                    _quoteStudioStyleTimer = null;
                    clearQuoteStudioLoadTimeout();
                    document.body?.classList.remove('quote-style-studio-open');
                });
            }
            _quoteStudioMessagingBound = true;
        }

        function ensureQuoteStudioFrame() {
            bindQuoteStudioMessaging();
            var frame = getQuoteStudioFrame();
            if (!frame) return;
            var currentSrc = frame.getAttribute('src') || '';
            if (!currentSrc || currentSrc === 'about:blank') {
                _quoteStudioFrameReady = false;
                setQuoteStudioPreviewState('loading', 'Loading the client viewer...');
                startQuoteStudioLoadTimeout();
                frame.src = frame.getAttribute('data-src');
                return;
            }
            if (_quoteStudioFrameReady) postQuoteStudioDocument();
        }

        async function prepareQuoteStyleStudio() {
            bindQuoteStudioMessaging();
            document.body?.classList.add('quote-style-studio-open');
            if (window._categoryStylesReadyPromise) {
                try { await window._categoryStylesReadyPromise; } catch(e) {}
            }
            _quoteStudioSnapshot = buildQuoteStudioSnapshot();
            showQuoteStyleStudioPane('controls');
            ensureQuoteStudioFrame();
        }

        function retryQuoteStylePreview() {
            var frame = getQuoteStudioFrame();
            if (!frame) return;
            _quoteStudioFrameReady = false;
            setQuoteStudioPreviewState('loading', 'Reloading the client viewer...');
            startQuoteStudioLoadTimeout();
            var base = new URL(frame.getAttribute('data-src'), window.location.href);
            base.searchParams.set('studio_reload', String(Date.now()));
            frame.src = base.toString();
        }

        function resetQuoteStylePreview() {
            if (!_quoteStudioSnapshot) _quoteStudioSnapshot = buildQuoteStudioSnapshot();
            if (_quoteStudioFrameReady) postQuoteStudioDocument();
            else ensureQuoteStudioFrame();
        }

        function showQuoteStyleStudioPane(pane) {
            pane = pane === 'preview' ? 'preview' : 'controls';
            var body = document.getElementById('quoteStyleStudioBody');
            var controlsBtn = document.getElementById('quoteStyleMobileControlsBtn');
            var previewBtn = document.getElementById('quoteStyleMobilePreviewBtn');
            if (body) body.setAttribute('data-mobile-pane', pane);
            if (controlsBtn) {
                controlsBtn.classList.toggle('btn-primary', pane === 'controls');
                controlsBtn.classList.toggle('btn-outline-primary', pane !== 'controls');
                controlsBtn.setAttribute('aria-selected', pane === 'controls' ? 'true' : 'false');
            }
            if (previewBtn) {
                previewBtn.classList.toggle('btn-primary', pane === 'preview');
                previewBtn.classList.toggle('btn-outline-primary', pane !== 'preview');
                previewBtn.setAttribute('aria-selected', pane === 'preview' ? 'true' : 'false');
            }
            if (pane === 'preview') ensureQuoteStudioFrame();
        }

        async function saveQuoteStyleDefaultsToCloud(style) {
            try {
                if (typeof saveUserDataValue !== 'function') return;
                await saveUserDataValue('quote_send_style', style, { entityType: 'quote_style', entityLabel: 'Quote send style', localStorageKey: 'ald_quote_send_style' });
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

        async function saveQuoteStyleSkipPreference(skip) {
            var savedDefault = await loadQuoteStyleDefaults();
            var nextDefault = Object.assign({}, savedDefault, { skipSettingsOnGenerate: !!skip });
            try {
                localStorage.setItem('ald_quote_send_style', JSON.stringify(nextDefault));
                await saveQuoteStyleDefaultsToCloud(nextDefault);
                _quoteStyle.skipSettingsOnGenerate = !!skip;
                syncQuoteStyleGlobal();
                return true;
            } catch(e) {
                console.warn('Quote send skip preference save failed:', e);
                return false;
            }
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

        function normalizeQuoteStyleColour(value) {
            var hex = String(value || '').trim();
            if (/^#[0-9a-f]{3}$/i.test(hex)) {
                hex = '#' + hex.slice(1).split('').map(function(ch) { return ch + ch; }).join('');
            }
            return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '';
        }

        function getQuoteStyleColourFavourites() {
            var parsed = {};
            try { parsed = JSON.parse(localStorage.getItem(QUOTE_STYLE_COLOUR_FAVOURITES_KEY) || '{}'); } catch(e) { parsed = {}; }
            var result = {};
            Object.keys(QUOTE_STYLE_COLOUR_AREAS).forEach(function(areaKey) {
                var seen = {};
                var list = Array.isArray(parsed[areaKey]) ? parsed[areaKey] : [];
                result[areaKey] = list.map(normalizeQuoteStyleColour).filter(function(color) {
                    if (!color || seen[color]) return false;
                    seen[color] = true;
                    return true;
                }).slice(0, QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT);
            });
            return result;
        }

        function persistQuoteStyleColourFavourites(store) {
            try {
                localStorage.setItem(QUOTE_STYLE_COLOUR_FAVOURITES_KEY, JSON.stringify(store));
                return true;
            } catch(e) {
                console.warn('Could not save quote style colour favourites:', e);
                return false;
            }
        }

        function setQuoteStyleColourStatus(areaKey, message, warning) {
            var status = document.getElementById('quoteStyleColourStatus-' + areaKey);
            if (!status) return;
            status.textContent = message || 'Up to five saved colours in this area.';
            status.classList.toggle('is-warning', !!warning);
        }

        function renderQuoteStyleColourFavourites(areaKey) {
            var config = QUOTE_STYLE_COLOUR_AREAS[areaKey];
            if (!config) return;
            var listEl = document.getElementById('quoteStyleColourFavourites-' + areaKey);
            var countEl = document.getElementById('quoteStyleColourCount-' + areaKey);
            var input = document.getElementById('quoteStyleColourInput-' + areaKey);
            if (!listEl || !countEl) return;
            var favourites = getQuoteStyleColourFavourites()[areaKey] || [];
            var active = normalizeQuoteStyleColour(_quoteStyle[config.styleKey]);
            countEl.textContent = favourites.length + '/' + QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT;
            if (input && active) input.value = active;
            if (!favourites.length) {
                listEl.innerHTML = '<div class="quote-style-colour-empty">No saved custom colours for this area yet.</div>';
                return;
            }
            listEl.innerHTML = favourites.map(function(color) {
                var selected = color === active ? ' selected' : '';
                return '<div class="quote-style-colour-favourite">' +
                    '<button type="button" class="quote-style-colour-favourite-use' + selected + '" data-style-colour-use="' + color + '" title="Use ' + color.toUpperCase() + '">' +
                    '<span class="quote-style-colour-favourite-dot" style="background:' + color + ';"></span>' +
                    '<span>' + color.toUpperCase() + '</span></button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger quote-style-colour-favourite-delete" data-style-colour-delete="' + color + '" title="Delete saved colour" aria-label="Delete saved colour ' + color.toUpperCase() + '"><i class="fas fa-trash"></i></button>' +
                    '</div>';
            }).join('');
        }

        function closeOtherQuoteStyleColourPanels(areaKey) {
            document.querySelectorAll('.quote-style-colour-panel').forEach(function(panel) {
                if (panel.dataset.styleColourArea !== areaKey) panel.hidden = true;
            });
            document.querySelectorAll('.quote-style-colour-wheel').forEach(function(button) {
                if (button.dataset.styleColourArea !== areaKey) button.setAttribute('aria-expanded', 'false');
            });
        }

        function toggleQuoteStyleColourPanel(areaKey) {
            var panel = document.getElementById('quoteStyleColourPanel-' + areaKey);
            var button = document.querySelector('.quote-style-colour-wheel[data-style-colour-area="' + areaKey + '"]');
            if (!panel || !button) return;
            var shouldOpen = panel.hidden;
            closeOtherQuoteStyleColourPanels(areaKey);
            panel.hidden = !shouldOpen;
            button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            if (shouldOpen) {
                renderQuoteStyleColourFavourites(areaKey);
                setQuoteStyleColourStatus(areaKey, 'Up to five saved colours in this area.', false);
            }
        }

        function applyQuoteStyleColour(areaKey, color) {
            var config = QUOTE_STYLE_COLOUR_AREAS[areaKey];
            color = normalizeQuoteStyleColour(color);
            if (!config || !color) return;
            _quoteStyle.preset = 'custom';
            _quoteStyle[config.styleKey] = color;
            if (config.fieldId) setFieldValue(config.fieldId, color);
            syncQuoteStyleGlobal();
            applyQuoteStyleToControls(_quoteStyle);
        }

        function saveAndUseQuoteStyleColour(areaKey) {
            var input = document.getElementById('quoteStyleColourInput-' + areaKey);
            var color = normalizeQuoteStyleColour(input && input.value);
            if (!color) return;
            var store = getQuoteStyleColourFavourites();
            var favourites = store[areaKey] || [];
            var existingIndex = favourites.indexOf(color);
            var saved = true;
            if (existingIndex >= 0) favourites.splice(existingIndex, 1);
            else if (favourites.length >= QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT) saved = false;
            if (saved) {
                favourites.unshift(color);
                store[areaKey] = favourites.slice(0, QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT);
                saved = persistQuoteStyleColourFavourites(store);
            }
            applyQuoteStyleColour(areaKey, color);
            renderQuoteStyleColourFavourites(areaKey);
            setQuoteStyleColourStatus(
                areaKey,
                saved ? 'Colour saved and applied.' : 'Colour applied but not saved. Delete a favourite to save another.',
                !saved
            );
        }

        function deleteQuoteStyleColourFavourite(areaKey, color) {
            color = normalizeQuoteStyleColour(color);
            if (!color) return;
            var store = getQuoteStyleColourFavourites();
            store[areaKey] = (store[areaKey] || []).filter(function(saved) { return saved !== color; });
            persistQuoteStyleColourFavourites(store);
            renderQuoteStyleColourFavourites(areaKey);
            setQuoteStyleColourStatus(areaKey, 'Saved colour removed.', false);
        }

        function initQuoteStyleColourPickers() {
            Object.keys(QUOTE_STYLE_COLOUR_AREAS).forEach(function(areaKey) {
                var config = QUOTE_STYLE_COLOUR_AREAS[areaKey];
                var container = document.getElementById(config.containerId);
                if (!container) return;
                var wheel = container.querySelector('.quote-style-colour-wheel');
                if (!wheel) {
                    wheel = document.createElement('button');
                    wheel.type = 'button';
                    wheel.className = 'style-swatch quote-style-colour-wheel';
                    wheel.dataset.styleColourArea = areaKey;
                    wheel.setAttribute('aria-label', 'Choose a custom ' + config.label.toLowerCase());
                    wheel.setAttribute('aria-expanded', 'false');
                    wheel.title = 'Choose or reuse a custom colour';
                    wheel.innerHTML = '<i class="fas fa-palette" aria-hidden="true"></i>';
                    container.appendChild(wheel);
                }

                var panel = document.getElementById('quoteStyleColourPanel-' + areaKey);
                if (!panel) {
                    panel = document.createElement('div');
                    panel.id = 'quoteStyleColourPanel-' + areaKey;
                    panel.className = 'quote-style-colour-panel';
                    panel.dataset.styleColourArea = areaKey;
                    panel.hidden = true;
                    panel.innerHTML = '<div class="d-flex justify-content-between align-items-center gap-2">' +
                        '<span class="small fw-semibold">Saved custom colours</span>' +
                        '<span id="quoteStyleColourCount-' + areaKey + '" class="text-muted small">0/' + QUOTE_STYLE_COLOUR_FAVOURITE_LIMIT + '</span></div>' +
                        '<div id="quoteStyleColourFavourites-' + areaKey + '" class="quote-style-colour-favourites"></div>' +
                        '<div class="quote-style-colour-exact">' +
                        '<input type="color" id="quoteStyleColourInput-' + areaKey + '" class="form-control form-control-color" aria-label="Choose exact ' + config.label.toLowerCase() + '">' +
                        '<button type="button" class="btn btn-sm btn-primary quote-style-colour-save"><i class="fas fa-bookmark me-1"></i>Save &amp; use</button></div>' +
                        '<div id="quoteStyleColourStatus-' + areaKey + '" class="quote-style-colour-status mt-2" aria-live="polite">Up to five saved colours in this area.</div>';
                    container.insertAdjacentElement('afterend', panel);
                }

                if (!wheel.dataset.styleColourBound) {
                    wheel.addEventListener('click', function(event) {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleQuoteStyleColourPanel(areaKey);
                    });
                    wheel.dataset.styleColourBound = '1';
                }
                if (!panel.dataset.styleColourBound) {
                    panel.addEventListener('click', function(event) {
                        var deleteButton = event.target.closest('[data-style-colour-delete]');
                        if (deleteButton) {
                            deleteQuoteStyleColourFavourite(areaKey, deleteButton.dataset.styleColourDelete);
                            return;
                        }
                        var useButton = event.target.closest('[data-style-colour-use]');
                        if (useButton) {
                            applyQuoteStyleColour(areaKey, useButton.dataset.styleColourUse);
                            panel.hidden = true;
                            wheel.setAttribute('aria-expanded', 'false');
                            return;
                        }
                        var saveButton = event.target.closest('.quote-style-colour-save');
                        if (saveButton) saveAndUseQuoteStyleColour(areaKey);
                    });
                    panel.dataset.styleColourBound = '1';
                }
                renderQuoteStyleColourFavourites(areaKey);
            });
        }

        function normalizeDescriptionPreviewLength(value) {
            var parsed = parseInt(value, 10);
            if (!isFinite(parsed)) parsed = QUOTE_DESCRIPTION_PREVIEW_DEFAULT;
            return Math.max(QUOTE_DESCRIPTION_PREVIEW_MIN, Math.min(parsed, QUOTE_DESCRIPTION_PREVIEW_MAX));
        }

        function updateDescriptionPreviewControls() {
            var slider = document.getElementById('quoteDescriptionPreviewLength');
            var showFull = document.getElementById('quoteAlwaysShowFullDescriptions');
            var valueLabel = document.getElementById('quoteDescriptionPreviewLengthValue');
            var alwaysShowFull = showFull?.checked === true;
            if (slider) slider.disabled = alwaysShowFull;
            if (valueLabel) {
                valueLabel.textContent = alwaysShowFull
                    ? 'Full text'
                    : normalizeDescriptionPreviewLength(slider?.value) + ' characters';
            }
        }

        function bindStyleSwatchGroup(containerId, attrName, fieldId, styleKey) {
            var container = document.getElementById(containerId);
            if (!container || container.dataset.styleSwatchBound) return;
            container.addEventListener('click', function(event) {
                var swatch = event.target.closest('.style-swatch');
                if (!swatch || !container.contains(swatch)) return;
                var value = swatch.getAttribute(attrName);
                if (!value) return;
                event.preventDefault();
                event.stopPropagation();
                _quoteStyle.preset = 'custom';
                _quoteStyle[styleKey] = value;
                setFieldValue(fieldId, value);
                syncQuoteStyleGlobal();
                applyQuoteStyleToControls(_quoteStyle);
            });
            container.dataset.styleSwatchBound = '1';
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
            updateQuoteExpiryPresetButtons();
            updateStylePreview();
        }

        function clearQuoteExpiry() {
            var expiryEl = document.getElementById('quoteExpiryDate');
            if (expiryEl) expiryEl.value = '';
            updateQuoteExpiryPresetButtons();
            updateStylePreview();
        }

        function updateQuoteExpiryPresetButtons() {
            var expiryValue = document.getElementById('quoteExpiryDate')?.value || '';
            document.querySelectorAll('.expiry-preset-btn').forEach(function(btn) {
                if (btn.getAttribute('data-no-expiry') === 'true') {
                    btn.classList.toggle('active', !expiryValue);
                    return;
                }
                var date = new Date();
                date.setDate(date.getDate() + parseInt(btn.dataset.days, 10));
                btn.classList.toggle('active', expiryValue === formatDateInput(date));
            });
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
            style.accentStrength = parseInt(document.getElementById('quoteAccentStrength')?.value || style.accentStrength || 100, 10);
            if (!isFinite(style.accentStrength)) style.accentStrength = 100;
            style.accentStrength = Math.max(20, Math.min(style.accentStrength, 100));
            style.optionAccentStrength = parseInt(document.getElementById('quoteOptionAccentStrength')?.value || style.optionAccentStrength || 100, 10);
            if (!isFinite(style.optionAccentStrength)) style.optionAccentStrength = 100;
            style.optionAccentStrength = Math.max(20, Math.min(style.optionAccentStrength, 100));
            style.headerStyle = document.getElementById('quoteHeaderStyle')?.value || style.headerStyle;
            style.headerEffect = document.getElementById('quoteHeaderEffect')?.value || style.headerEffect || 'soft-gradient';
            style.headerOpacity = parseInt(document.getElementById('quoteHeaderOpacity')?.value || style.headerOpacity || 100, 10);
            if (!isFinite(style.headerOpacity)) style.headerOpacity = 100;
            style.headerOpacity = Math.max(20, Math.min(style.headerOpacity, 100));
            style.bgOpacity = parseInt(document.getElementById('quoteBgOpacity')?.value || style.bgOpacity || 100, 10);
            if (!isFinite(style.bgOpacity)) style.bgOpacity = 100;
            style.bgOpacity = Math.max(0, Math.min(style.bgOpacity, 100));
            style.fontFeel = document.getElementById('quoteFontFeel')?.value || style.fontFeel;
            style.optionAccent = document.querySelector('#optionAccentSwatches .style-swatch.selected')?.getAttribute('data-option-accent') || document.getElementById('quoteOptionAccent')?.value || style.optionAccent || style.accent || '#1a56a0';
            style.upgradeAccent = document.querySelector('#upgradeAccentSwatches .style-swatch.selected')?.getAttribute('data-upgrade-accent') || document.getElementById('quoteUpgradeAccent')?.value || style.upgradeAccent || '#0d9488';
            style.upgradeBg = document.querySelector('#upgradeBgSwatches .style-swatch.selected')?.getAttribute('data-upgrade-bg') || document.getElementById('quoteUpgradeBg')?.value || style.upgradeBg || '#f8fafc';
            style.pricingMode = document.getElementById('quotePricingMode')?.value || style.pricingMode;
            style.depositMode = document.getElementById('quoteDepositMode')?.value || style.depositMode;
            style.depositPercent = parseFloat(document.getElementById('quoteDepositPercent')?.value || style.depositPercent || 50);
            if (!isFinite(style.depositPercent) || style.depositPercent <= 0) style.depositPercent = 50;
            style.depositPercent = Math.min(style.depositPercent, 100);
            style.approvalMode = document.getElementById('quoteApprovalMode')?.value || style.approvalMode;
            style.expiryDate = document.getElementById('quoteExpiryDate')?.value || '';
            style.showUpgrades = document.getElementById('quoteShowUpgrades')?.checked !== false;
            style.showScopeNotes = document.getElementById('quoteShowScopeNotes')?.checked !== false;
            style.descriptionPreviewLength = normalizeDescriptionPreviewLength(document.getElementById('quoteDescriptionPreviewLength')?.value || style.descriptionPreviewLength);
            style.alwaysShowFullDescriptions = document.getElementById('quoteAlwaysShowFullDescriptions')?.checked === true;
            style.showCommitment = document.getElementById('quoteShowCommitment')?.checked !== false;
            style.skipSettingsOnGenerate = document.getElementById('quoteSkipSettingsOnGenerate')?.checked === true;
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
            var incomingStyle = style || {};
            _quoteStyle = Object.assign({}, _quoteStyle, incomingStyle);
            if (!Object.prototype.hasOwnProperty.call(incomingStyle, 'accentStrength')) _quoteStyle.accentStrength = 100;
            if (!Object.prototype.hasOwnProperty.call(incomingStyle, 'optionAccentStrength')) _quoteStyle.optionAccentStrength = 100;
            if (!isFinite(parseInt(_quoteStyle.accentStrength, 10))) _quoteStyle.accentStrength = 100;
            if (!isFinite(parseInt(_quoteStyle.optionAccentStrength, 10))) _quoteStyle.optionAccentStrength = 100;
            if (!isFinite(parseInt(_quoteStyle.headerOpacity, 10))) _quoteStyle.headerOpacity = 100;
            if (!isFinite(parseInt(_quoteStyle.bgOpacity, 10))) _quoteStyle.bgOpacity = 100;
            _quoteStyle.descriptionPreviewLength = normalizeDescriptionPreviewLength(_quoteStyle.descriptionPreviewLength);
            _quoteStyle.alwaysShowFullDescriptions = _quoteStyle.alwaysShowFullDescriptions === true;
            syncQuoteStyleGlobal();
            setFieldValue('quoteAccentStrength', _quoteStyle.accentStrength);
            updateQuoteStyleStrengthLabel('quoteAccentStrengthValue', _quoteStyle.accentStrength);
            setFieldValue('quoteOptionAccentStrength', _quoteStyle.optionAccentStrength);
            updateQuoteStyleStrengthLabel('quoteOptionAccentStrengthValue', _quoteStyle.optionAccentStrength);
            setFieldValue('quoteHeaderStyle', _quoteStyle.headerStyle);
            setFieldValue('quoteHeaderEffect', _quoteStyle.headerEffect || 'soft-gradient');
            setFieldValue('quoteHeaderOpacity', _quoteStyle.headerOpacity);
            updateHeaderOpacityLabel(_quoteStyle.headerOpacity);
            setFieldValue('quoteBgOpacity', _quoteStyle.bgOpacity);
            updateBgOpacityLabel(_quoteStyle.bgOpacity);
            setFieldValue('quoteFontFeel', _quoteStyle.fontFeel);
            setFieldValue('quoteOptionAccent', _quoteStyle.optionAccent || _quoteStyle.accent || '#1a56a0');
            setFieldValue('quoteUpgradeAccent', _quoteStyle.upgradeAccent || '#0d9488');
            setFieldValue('quoteUpgradeBg', _quoteStyle.upgradeBg || '#f8fafc');
            setFieldValue('quotePricingMode', _quoteStyle.pricingMode);
            setFieldValue('quoteDepositMode', _quoteStyle.depositMode);
            setFieldValue('quoteDepositPercent', _quoteStyle.depositPercent || 50);
            setFieldValue('quoteApprovalMode', _quoteStyle.approvalMode);
            setFieldValue('quoteExpiryDate', _quoteStyle.expiryDate);
            setFieldValue('quoteShowUpgrades', _quoteStyle.showUpgrades);
            setFieldValue('quoteShowScopeNotes', _quoteStyle.showScopeNotes);
            setFieldValue('quoteDescriptionPreviewLength', _quoteStyle.descriptionPreviewLength);
            setFieldValue('quoteAlwaysShowFullDescriptions', _quoteStyle.alwaysShowFullDescriptions);
            updateDescriptionPreviewControls();
            setFieldValue('quoteShowCommitment', _quoteStyle.showCommitment !== false);
            setFieldValue('quoteSkipSettingsOnGenerate', _quoteStyle.skipSettingsOnGenerate === true);
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
            updateQuoteExpiryPresetButtons();

            document.querySelectorAll('#stylePresets .quote-style-preset').forEach(function(btn) {
                btn.classList.toggle('selected', btn.getAttribute('data-preset') === _quoteStyle.preset);
            });
            document.querySelectorAll('#accentSwatches .style-swatch[data-accent]').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-accent') === _quoteStyle.accent);
            });
            document.querySelectorAll('#bgSwatches .style-swatch[data-bg]').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-bg') === _quoteStyle.bg);
            });
            document.querySelectorAll('#optionAccentSwatches .style-swatch[data-option-accent]').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-option-accent') === (_quoteStyle.optionAccent || _quoteStyle.accent || '#1a56a0'));
            });
            document.querySelectorAll('#upgradeAccentSwatches .style-swatch').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-upgrade-accent') === (_quoteStyle.upgradeAccent || '#0d9488'));
            });
            document.querySelectorAll('#upgradeBgSwatches .style-swatch').forEach(function(sw) {
                sw.classList.toggle('selected', sw.getAttribute('data-upgrade-bg') === (_quoteStyle.upgradeBg || '#f8fafc'));
            });
            Object.keys(QUOTE_STYLE_COLOUR_AREAS).forEach(renderQuoteStyleColourFavourites);
            applyQuoteUpgradeTheme(_quoteStyle);
            updateStylePreview();
        }

        function updateStylePreview() {
            _quoteStyle = readQuoteStyleFromControls();
            syncQuoteStyleGlobal();
            applyQuoteUpgradeTheme(_quoteStyle);
            updateQuoteStyleStrengthLabel('quoteAccentStrengthValue', _quoteStyle.accentStrength);
            updateQuoteStyleStrengthLabel('quoteOptionAccentStrengthValue', _quoteStyle.optionAccentStrength);
            var headerOpacity = Math.max(20, Math.min(parseInt(_quoteStyle.headerOpacity || 100, 10), 100));
            updateHeaderOpacityLabel(headerOpacity);
            var bgOpacity = parseInt(_quoteStyle.bgOpacity, 10);
            if (!isFinite(bgOpacity)) bgOpacity = 100;
            bgOpacity = Math.max(0, Math.min(bgOpacity, 100));
            updateBgOpacityLabel(bgOpacity);
            updateDescriptionPreviewControls();
            queueQuoteStudioStyleUpdate();
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

        function applyQuoteUpgradeTheme(style) {
            var root = document.documentElement;
            if (!root) return;
            var accent = (style && style.upgradeAccent) || '#0d9488';
            var bg = (style && style.upgradeBg) || '#f8fafc';
            root.style.setProperty('--quote-upgrade-accent', accent);
            root.style.setProperty('--quote-upgrade-accent-contrast', readableQuoteStyleTextColor(accent));
            root.style.setProperty('--quote-upgrade-bg', bg);
            root.style.setProperty('--quote-upgrade-bg-contrast', readableQuoteStyleTextColor(bg));
            root.style.setProperty('--quote-upgrade-accent-soft', colorWithOpacity(accent, 20));
            root.style.setProperty('--quote-upgrade-border', colorWithOpacity(accent, 35));
        }

        function readableQuoteStyleTextColor(hex) {
            var rgb = hexToRgb(hex);
            if (!rgb) return '#334155';
            var luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            return luminance > 0.62 ? '#102033' : '#ffffff';
        }

        function quoteHeaderBackgroundForEffect(accent, headerStyle, headerOpacity, effect) {
            var safeAccent = accent && accent !== '#ffffff' ? accent : '#1a56a0';
            var opacity = Math.max(20, Math.min(parseInt(headerOpacity || 100, 10), 100));
            var base = headerStyle === 'dark'
                ? colorWithOpacity('#172033', opacity)
                : (headerStyle === 'light' ? '#ffffff' : colorWithOpacity(safeAccent, opacity));
            var soft = headerStyle === 'dark' ? colorWithOpacity('#274567', Math.max(35, opacity - 18)) : colorWithOpacity(safeAccent, Math.max(28, opacity - 26));
            var pale = headerStyle === 'dark' ? colorWithOpacity('#425a78', 35) : blendColorWithWhite(safeAccent, 26);
            var selected = effect || 'soft-gradient';

            if (selected === 'solid') return base;
            if (headerStyle === 'light') {
                if (selected === 'subtle-texture') {
                    return 'linear-gradient(90deg, rgba(15,52,96,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(15,52,96,0.035) 1px, transparent 1px), linear-gradient(135deg, #ffffff 0%, ' + pale + ' 100%)';
                }
                return 'radial-gradient(circle at 18% 12%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, #ffffff 0%, ' + pale + ' 100%)';
            }
            if (selected === 'spotlight') {
                return 'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, ' + base + ' 0%, ' + soft + ' 58%, rgba(16,32,51,0.28) 100%)';
            }
            if (selected === 'premium-sheen') {
                return 'linear-gradient(118deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.14) 22%, rgba(255,255,255,0) 23%), linear-gradient(135deg, ' + base + ' 0%, ' + soft + ' 100%)';
            }
            if (selected === 'subtle-texture') {
                return 'linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(135deg, ' + base + ' 0%, ' + soft + ' 100%)';
            }
            return 'linear-gradient(135deg, ' + base + ' 0%, ' + soft + ' 56%, ' + pale + ' 100%)';
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

        function updateQuoteStyleStrengthLabel(labelId, value) {
            var label = document.getElementById(labelId);
            var parsed = parseInt(value, 10);
            if (!isFinite(parsed)) parsed = 100;
            if (label) label.textContent = Math.max(20, Math.min(parsed, 100)) + '%';
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

        function getActiveQuoteStyleForSend() {
            var docType = window._quoteDocumentType || window._currentQuoteData?.documentType || window._currentQuoteData?.type || window._loadedQuoteData?.documentType || window._loadedQuoteData?.type || '';
            if (docType !== 'change_order') return {};
            var candidates = [
                window._currentQuoteData && window._currentQuoteData.style,
                window._loadedQuoteData && window._loadedQuoteData.style
            ];
            for (var i = 0; i < candidates.length; i++) {
                var style = candidates[i];
                if (style && typeof style === 'object' && Object.keys(style).length) {
                    try { return JSON.parse(JSON.stringify(style)); } catch(e) { return Object.assign({}, style); }
                }
            }
            return {};
        }

        async function initStyleModal() {
            var savedDefault = await loadQuoteStyleDefaults();
            var activeStyle = getActiveQuoteStyleForSend();
            initQuoteStyleColourPickers();
            applyQuoteStyleToControls(Object.assign({}, savedDefault, activeStyle));
            initCommitmentIconPickers();

            document.querySelectorAll('#stylePresets .quote-style-preset').forEach(function(btn) {
                btn.onclick = function() {
                    _quoteStyle.preset = btn.getAttribute('data-preset') || 'custom';
                    _quoteStyle.accent = btn.getAttribute('data-accent') || _quoteStyle.accent;
                    _quoteStyle.optionAccent = btn.getAttribute('data-option-accent') || _quoteStyle.accent;
                    _quoteStyle.upgradeAccent = btn.getAttribute('data-upgrade-accent') || _quoteStyle.upgradeAccent || '#0d9488';
                    _quoteStyle.upgradeBg = btn.getAttribute('data-upgrade-bg') || _quoteStyle.upgradeBg || '#f8fafc';
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
            document.querySelectorAll('#optionAccentSwatches .style-swatch').forEach(function(sw) {
                sw.onclick = function() {
                    _quoteStyle.preset = 'custom';
                    _quoteStyle.optionAccent = sw.getAttribute('data-option-accent');
                    syncQuoteStyleGlobal();
                    applyQuoteStyleToControls(_quoteStyle);
                };
            });
            bindStyleSwatchGroup('upgradeAccentSwatches', 'data-upgrade-accent', 'quoteUpgradeAccent', 'upgradeAccent');
            bindStyleSwatchGroup('upgradeBgSwatches', 'data-upgrade-bg', 'quoteUpgradeBg', 'upgradeBg');
            ['quoteAccentStrength','quoteOptionAccentStrength','quoteHeaderStyle','quoteHeaderEffect','quoteHeaderOpacity','quoteBgOpacity','quoteFontFeel','quoteOptionAccent','quoteUpgradeAccent','quoteUpgradeBg','quotePricingMode','quoteDepositMode','quoteDepositPercent','quoteApprovalMode','quoteExpiryDate','quoteShowUpgrades','quoteShowScopeNotes','quoteDescriptionPreviewLength','quoteAlwaysShowFullDescriptions','quoteShowCommitment','quoteSkipSettingsOnGenerate','commitmentTitleInput','commitmentIcon1','commitmentImage1','commitmentLabel1','commitmentText1','commitmentIcon2','commitmentImage2','commitmentLabel2','commitmentText2','commitmentIcon3','commitmentImage3','commitmentLabel3','commitmentText3','commitmentIcon4','commitmentImage4','commitmentLabel4','commitmentText4','quoteClientMessage'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el && !el.dataset.styleBound) {
                    el.addEventListener('input', updateStylePreview);
                    el.addEventListener('change', updateStylePreview);
                    if (id === 'quoteExpiryDate') {
                        el.addEventListener('input', updateQuoteExpiryPresetButtons);
                        el.addEventListener('change', updateQuoteExpiryPresetButtons);
                    }
                    el.dataset.styleBound = '1';
                }
            });
        }

        function getQuoteGenerationProgressAnchor(preferredAnchor) {
            if (preferredAnchor && typeof preferredAnchor.getClientRects === 'function' && preferredAnchor.getClientRects().length) {
                return preferredAnchor;
            }
            return document.querySelector('.quote-actions-dropdown > button');
        }

        function showQuoteGenerationProgress(preferredAnchor, title) {
            if (document.getElementById('quoteGenerationProgress')) return false;
            var anchor = getQuoteGenerationProgressAnchor(preferredAnchor);
            var panel = document.createElement('div');
            panel.id = 'quoteGenerationProgress';
            panel.className = 'quote-generation-progress';
            panel.setAttribute('role', 'status');
            panel.setAttribute('aria-live', 'assertive');
            panel.innerHTML = '<div class="d-flex align-items-start gap-2">' +
                '<i class="fas fa-spinner fa-spin mt-1" aria-hidden="true"></i>' +
                '<div><div class="quote-generation-progress-title">' + (title || 'Preparing your quote...') + '</div>' +
                '<div class="quote-generation-progress-detail">Uploading photos and building the client view. Quotes with photos may take a little longer.</div></div>' +
                '</div>';
            document.body.appendChild(panel);

            var panelWidth = panel.offsetWidth || 360;
            var panelHeight = panel.offsetHeight || 100;
            if (anchor && typeof anchor.getBoundingClientRect === 'function') {
                var rect = anchor.getBoundingClientRect();
                var left = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.right - panelWidth));
                var above = rect.top - panelHeight - 12;
                var top = above >= 12 ? above : Math.min(window.innerHeight - panelHeight - 12, rect.bottom + 12);
                panel.style.left = left + 'px';
                panel.style.top = Math.max(12, top) + 'px';
            } else {
                panel.style.right = '12px';
                panel.style.top = '72px';
            }
            if (anchor && 'disabled' in anchor) {
                anchor.dataset.quoteGenerationWasDisabled = anchor.disabled ? '1' : '0';
                anchor.disabled = true;
            }
            panel._quoteGenerationAnchor = anchor;
            return true;
        }

        function hideQuoteGenerationProgress() {
            var panel = document.getElementById('quoteGenerationProgress');
            if (!panel) return;
            var anchor = panel._quoteGenerationAnchor;
            if (anchor && 'disabled' in anchor) {
                anchor.disabled = anchor.dataset.quoteGenerationWasDisabled === '1';
                delete anchor.dataset.quoteGenerationWasDisabled;
            }
            panel.remove();
        }

        async function generateInteractiveLink() {
            if (rooms.length === 0) {
                alert('Please add at least one room before generating an interactive quote.');
                return;
            }
            markQuoteNumberUsed(document.getElementById('quoteNumber')?.value);
            await initStyleModal();
            if (_quoteStyle.skipSettingsOnGenerate) {
                window._quoteStyleSettingsOnly = false;
                await confirmGenerateQuote();
                return;
            }
            openQuoteSendSettingsModal(false);
        }

        async function openQuoteSendSettingsModal(settingsOnly) {
            window._quoteStyleSettingsOnly = !!settingsOnly;
            await initStyleModal();
            var generateBtn = document.getElementById('quoteStyleGenerateBtn');
            if (generateBtn) {
                var isChangeOrder = document.body?.classList.contains('change-order-mode');
                generateBtn.innerHTML = settingsOnly
                    ? '<i class="fas fa-check me-1"></i>Done'
                    : '<i class="fas fa-share-square me-1"></i>' + (isChangeOrder ? 'Send Change Order' : 'Generate Quote Link');
            }
            var modalEl = document.getElementById('quoteStyleModal');
            var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalEl.addEventListener('shown.bs.modal', prepareQuoteStyleStudio, { once: true });
            modal.show();
        }

        const CHANGE_ORDER_REASON_REQUIRED_MESSAGE = 'Add a short reason/scope-change note before sending the change order.';

        function isChangeOrderReasonRequiredError(err) {
            return !!err && (
                err.code === 'CHANGE_ORDER_REASON_REQUIRED' ||
                /reason\/scope-change note/i.test(err.message || '')
            );
        }

        function promptForChangeOrderReason() {
            var saveStatus = document.getElementById('saveStatus');
            if (saveStatus) {
                saveStatus.innerHTML = '<span style="color:#fd7e14;"><i class="fas fa-pen"></i> Reason needed</span>';
            }
            var reasonEl = document.getElementById('changeOrderReason');
            if (reasonEl) {
                reasonEl.classList.add('is-invalid');
                reasonEl.addEventListener('input', function clearReasonInvalidState() {
                    reasonEl.classList.remove('is-invalid');
                    reasonEl.removeEventListener('input', clearReasonInvalidState);
                });
                setTimeout(function() {
                    reasonEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    reasonEl.focus();
                }, 150);
            }
            var message = 'Add a short reason/scope-change note before sending the change order.';
            if (typeof qdAlert === 'function') qdAlert(message);
            else alert(message);
        }

        async function confirmGenerateQuote() {
            var styleModal = bootstrap.Modal.getInstance(document.getElementById('quoteStyleModal'));
            if (window._quoteStyleSettingsOnly) {
                await saveQuoteStyleDefaults(true);
                if (styleModal) styleModal.hide();
                return;
            }
            var generateBtn = document.getElementById('quoteStyleGenerateBtn');
            if (!showQuoteGenerationProgress(generateBtn, 'Generating your quote...')) return;
            var skipSettingsOnGenerate = document.getElementById('quoteSkipSettingsOnGenerate')?.checked === true;
            var saveStatus = document.getElementById('saveStatus');

            try {
                await saveQuoteStyleSkipPreference(skipSettingsOnGenerate);
                if (styleModal) styleModal.hide();
                if (saveStatus) saveStatus.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-spinner fa-spin"></i> Saving quote...</span>';
                const viewerUrl = await createInteractiveQuoteLink();

                if (saveStatus) saveStatus.innerHTML = '<span style="color:green;"><i class="fas fa-check"></i> Quote saved!</span>';
                hideQuoteGenerationProgress();

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
                                            <div class="form-check mt-2">
                                                <input class="form-check-input" type="checkbox" id="quoteAddToPortalEmail" checked>
                                                <label class="form-check-label small" for="quoteAddToPortalEmail">Add to client portal and include portal link in email</label>
                                            </div>
                                            <div class="row g-2 mt-2">
                                                <div class="col-sm-6">
                                                    <button type="button" class="btn btn-outline-secondary btn-sm w-100" onclick="copyInteractiveLink()" id="copyQuoteLinkBtn">
                                                        <i class="fas fa-link me-1"></i>Copy Quote Link
                                                    </button>
                                                </div>
                                                <div class="col-sm-6">
                                                    <button type="button" class="btn btn-outline-primary btn-sm w-100" onclick="publishCurrentQuoteToPortal()" id="addQuoteToPortalBtn">
                                                        <i class="fas fa-folder-plus me-1"></i>Add to Portal
                                                    </button>
                                                </div>
                                            </div>
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
                window._currentQuoteUrl = viewerUrl;
                window._currentQuotePortalUrl = '';
                if (typeof updateQuotePortalButton === 'function') updateQuotePortalButton(!!(window._currentQuoteData && window._currentQuoteData.portal_visible));
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
                hideQuoteGenerationProgress();
                if (err && err.code === 'PORTAL_LOCKED') {
                    if (saveStatus) saveStatus.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-lock"></i> Quote is in the client portal - returning to dashboard...</span>';
                    return;
                }
                if (isChangeOrderReasonRequiredError(err)) {
                    promptForChangeOrderReason();
                    return;
                }
                console.error('Failed to save quote:', err);
                alert('Failed to save quote to cloud: ' + (err.message || err));
                if (saveStatus) saveStatus.innerHTML = '<span style="color:red;"><i class="fas fa-times"></i> Save failed</span>';
            }
        }

        async function createInteractiveQuoteLink() {
            _quoteStyle = readQuoteStyleFromControls();
            syncQuoteStyleGlobal();
            if (document.getElementById('quoteSaveDefaultStyle')?.checked) {
                await saveQuoteStyleDefaults(false);
            }

            if (window._categoryStylesReadyPromise) {
                try { await window._categoryStylesReadyPromise; } catch(e) {}
            }

            const quoteData = collectQuoteData();
            if (quoteData.type === 'change_order') {
                var reason = (quoteData.changeReason || '').trim();
                if (!reason) {
                    var reasonError = new Error(CHANGE_ORDER_REASON_REQUIRED_MESSAGE);
                    reasonError.code = 'CHANGE_ORDER_REASON_REQUIRED';
                    throw reasonError;
                }
                quoteData.status = 'pending_approval';
                var statusEl = document.getElementById('quoteStatus');
                if (statusEl) statusEl.value = 'pending_approval';
            }
            quoteData.style = JSON.parse(JSON.stringify(_quoteStyle));
            if (window._supabaseQuoteId) quoteData.supabaseId = window._supabaseQuoteId;

            const result = await saveQuoteForSharing(quoteData);
            if (result.error) throw result.error;

            const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;
            const supabaseId = (savedRow && savedRow.id) || quoteData.supabaseId || window._supabaseQuoteId;
            if (!supabaseId) {
                throw new Error('Quote cloud save did not return a document id. Please try again.');
            }
            window._supabaseQuoteId = supabaseId;
            quoteData.supabaseId = supabaseId;
            if (savedRow && savedRow.updated_at) quoteData._serverUpdatedAt = savedRow.updated_at;
            window._currentQuoteData = quoteData;
            window._loadedQuoteData = Object.assign({}, window._loadedQuoteData || {}, quoteData);
            localStorage.setItem("ald_active_quote_id", window._supabaseQuoteId);

            const _base = window.location.href.split('?')[0].split('#')[0].replace(/quote-builder(\.html)?\/?$/, '');
            if (typeof createSecureClientShareLink !== 'function') {
                throw new Error('Secure client links are not available. Please refresh and try again.');
            }
            const share = await createSecureClientShareLink(supabaseId, _base + 'interactive-quote-viewer.html', { mode: 'document' });
            if (!share || !share.url || share.url.indexOf('token=') < 0) {
                throw new Error('Could not create the secure client link.');
            }
            window._currentQuoteUrl = share.url;
            return share.url;
        }

        async function previewInteractiveQuote() {
            if (rooms.length === 0) {
                alert('Please add at least one room before previewing a quote.');
                return;
            }
            markQuoteNumberUsed(document.getElementById('quoteNumber')?.value);
            if (!showQuoteGenerationProgress(null, 'Preparing your preview...')) return;
            var saveStatus = document.getElementById('saveStatus');
            if (saveStatus) saveStatus.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-spinner fa-spin"></i> Preparing preview...</span>';
            try {
                await initStyleModal();
                var viewerUrl = await createInteractiveQuoteLink();
                var previewUrl = new URL(viewerUrl, window.location.href);
                previewUrl.searchParams.set('preview', '1');
                previewUrl.searchParams.set('admin_preview', '1');
                if (typeof saveSessionQuote === 'function') saveSessionQuote();
                if (saveStatus) saveStatus.innerHTML = '<span style="color:green;"><i class="fas fa-check"></i> Opening preview...</span>';
                if (typeof qdToast === 'function') {
                    qdToast({ title: 'Preview Ready', message: 'Opening the client quote view.', type: 'success' });
                }
                hideQuoteGenerationProgress();
                window.location.href = previewUrl.toString();
            } catch(err) {
                hideQuoteGenerationProgress();
                if (err && err.code === 'PORTAL_LOCKED') {
                    if (saveStatus) saveStatus.innerHTML = '<span style="color:#1a56a0;"><i class="fas fa-lock"></i> Quote is in the client portal - returning to dashboard...</span>';
                    return;
                }
                console.error('Failed to preview quote:', err);
                alert('Failed to prepare quote preview: ' + (err.message || err));
                if (saveStatus) saveStatus.innerHTML = '<span style="color:red;"><i class="fas fa-times"></i> Preview failed</span>';
            }
        }

        syncQuoteStyleGlobal();
        window.COMMITMENT_ICON_LIBRARY = COMMITMENT_ICON_LIBRARY;
        window.defaultCommitmentItemsForModal = defaultCommitmentItemsForModal;
        window.setFieldValue = setFieldValue;
        window.formatDateInput = formatDateInput;
        window.setQuoteExpiryPreset = setQuoteExpiryPreset;
        window.clearQuoteExpiry = clearQuoteExpiry;
        window.updateQuoteExpiryPresetButtons = updateQuoteExpiryPresetButtons;
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
        window.createInteractiveQuoteLink = createInteractiveQuoteLink;
        window.previewInteractiveQuote = previewInteractiveQuote;
        window.showQuoteGenerationProgress = showQuoteGenerationProgress;
        window.hideQuoteGenerationProgress = hideQuoteGenerationProgress;
        window.showQuoteStyleStudioPane = showQuoteStyleStudioPane;
        window.resetQuoteStylePreview = resetQuoteStylePreview;
        window.retryQuoteStylePreview = retryQuoteStylePreview;
})();
