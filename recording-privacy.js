(function(global, document) {
    'use strict';

    const STORAGE_KEY = 'ald_recording_price_privacy_v1';
    const ROOT_CLASS = 'qd-recording-prices-hidden';
    const TOKEN_CLASS = 'qd-recording-price-token';
    const TOKEN_ATTRIBUTE = 'data-qd-recording-price-token';
    const PRIVATE_INPUT_ATTRIBUTE = 'data-qd-private-price';
    const CURRENCY_PATTERN = /(?:\(\s*)?(?:[+-]\s*)?(?:(?:CA|US|AU|NZ)\s?\$|[$\u00a3\u20ac])\s*-?\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:CAD|USD|GBP|EUR|AUD|NZD))?(?:\s*\))?|(?:[+-]\s*)?\d[\d,]*(?:\.\d{1,2})?\s*(?:CAD|USD|GBP|EUR|AUD|NZD)\b/gi;
    const PRIVATE_PERCENT_PATTERN = /[+-]?\d+(?:\.\d+)?%/g;
    const PRIVATE_PERCENT_CONTEXT = /\b(?:margin|markup|profit)\b/i;
    const CONTROL_PRICE_CONTEXT = /(?:rate|price|cost|amount|total|revenue|profit|balance|payment|deposit|subtotal|outstanding|material|margin|markup|discount|adjustment)/i;
    const CONTROL_QUANTITY_CONTEXT = /(?:\b(?:quantity|qty|dimension|width|height|length|area|perimeter|percentage|percent|days?|hours?)\b|tax\s*rate|taxrate)/i;
    const SKIP_PARENT_SELECTOR = 'script,style,noscript,template,textarea,option,[contenteditable="true"],[data-qd-recording-ignore],.' + TOKEN_CLASS;

    let observer = null;

    function storageEnabled() {
        try {
            return global.localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function setRootState(enabled) {
        document.documentElement.classList.toggle(ROOT_CLASS, !!enabled);
    }

    function semanticControlText(control) {
        const container = control.closest('td,[data-label],.form-group,.input-group,.mb-2,.mb-3,.col,.col-12');
        const escapeCss = global.CSS && typeof global.CSS.escape === 'function'
            ? global.CSS.escape
            : function(value) { return String(value).replace(/(["\\])/g, '\\$1'); };
        const label = control.id ? document.querySelector('label[for="' + escapeCss(control.id) + '"]') : null;
        return [
            control.id,
            control.name,
            control.className,
            control.getAttribute('aria-label'),
            control.getAttribute('placeholder'),
            container && container.getAttribute('data-label'),
            label && label.textContent
        ].filter(Boolean).join(' ');
    }

    function markPrivatePriceControls(root) {
        if (root && root.nodeType && root.nodeType !== global.Node.ELEMENT_NODE && root.nodeType !== global.Node.DOCUMENT_NODE && root.nodeType !== global.Node.DOCUMENT_FRAGMENT_NODE) return;
        const scope = root && root.querySelectorAll ? root : document;
        const controls = [];
        if (root && root.matches && root.matches('input')) controls.push(root);
        scope.querySelectorAll('input').forEach(function(control) { controls.push(control); });

        controls.forEach(function(control) {
            const type = String(control.type || 'text').toLowerCase();
            if (['number', 'text'].indexOf(type) === -1) return;
            if (control.hasAttribute(PRIVATE_INPUT_ATTRIBUTE)) return;
            const context = semanticControlText(control);
            const privatePercentage = /(?:margin|markup|profit)/i.test(context);
            if (!CONTROL_PRICE_CONTEXT.test(context)) return;
            if (!privatePercentage && CONTROL_QUANTITY_CONTEXT.test(context)) return;
            control.setAttribute(PRIVATE_INPUT_ATTRIBUTE, 'auto');
        });
    }

    function collectMatchRanges(text) {
        const ranges = [];
        CURRENCY_PATTERN.lastIndex = 0;
        let match;
        while ((match = CURRENCY_PATTERN.exec(text))) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
        }
        if (PRIVATE_PERCENT_CONTEXT.test(text)) {
            PRIVATE_PERCENT_PATTERN.lastIndex = 0;
            while ((match = PRIVATE_PERCENT_PATTERN.exec(text))) {
                ranges.push({ start: match.index, end: match.index + match[0].length });
            }
        }
        return ranges.sort(function(a, b) { return a.start - b.start; }).filter(function(range, index, all) {
            return index === 0 || range.start >= all[index - 1].end;
        });
    }

    function maskTextNode(textNode) {
        if (!textNode || !textNode.parentElement || !textNode.nodeValue) return;
        if (textNode.parentElement.closest(SKIP_PARENT_SELECTOR)) return;
        const text = textNode.nodeValue;
        const ranges = collectMatchRanges(text);
        if (!ranges.length) return;

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        ranges.forEach(function(range) {
            if (range.start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, range.start)));
            const token = document.createElement('span');
            token.className = TOKEN_CLASS;
            token.setAttribute(TOKEN_ATTRIBUTE, 'true');
            token.textContent = text.slice(range.start, range.end);
            fragment.appendChild(token);
            cursor = range.end;
        });
        if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    function scanText(root) {
        if (!root) return;
        if (root.nodeType === global.Node.TEXT_NODE) {
            maskTextNode(root);
            return;
        }
        if (root.nodeType !== global.Node.ELEMENT_NODE && root.nodeType !== global.Node.DOCUMENT_NODE && root.nodeType !== global.Node.DOCUMENT_FRAGMENT_NODE) return;
        if (root.matches && root.matches(SKIP_PARENT_SELECTOR)) return;
        const walker = document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(maskTextNode);
    }

    function refresh(root) {
        if (!storageEnabled()) return;
        const target = root || document.body || document.documentElement;
        markPrivatePriceControls(target);
        scanText(target);
    }

    function stopObserver() {
        if (!observer) return;
        observer.disconnect();
        observer = null;
    }

    function startObserver() {
        stopObserver();
        const target = document.documentElement;
        if (!target) return;
        observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'characterData') {
                    maskTextNode(mutation.target);
                    return;
                }
                mutation.addedNodes.forEach(function(node) {
                    refresh(node);
                });
            });
        });
        observer.observe(target, { childList: true, subtree: true, characterData: true });
    }

    function applyState() {
        const enabled = storageEnabled();
        setRootState(enabled);
        if (enabled) {
            refresh(document.body || document.documentElement);
            startObserver();
        } else {
            stopObserver();
        }
        return enabled;
    }

    function setEnabled(enabled) {
        try {
            if (enabled) global.localStorage.setItem(STORAGE_KEY, '1');
            else global.localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        const active = applyState();
        global.dispatchEvent(new CustomEvent('quotedr:recording-privacy-changed', { detail: { enabled: active } }));
        return active;
    }

    applyState();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (storageEnabled()) refresh(document.body);
        }, { once: true });
    }

    global.addEventListener('storage', function(event) {
        if (event.key === STORAGE_KEY) applyState();
    });

    global.QuoteDrRecordingPrivacy = Object.freeze({
        storageKey: STORAGE_KEY,
        isEnabled: storageEnabled,
        setEnabled: setEnabled,
        refresh: refresh
    });
})(window, document);
