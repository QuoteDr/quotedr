(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrTypedSignature = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    function normalizeName(value) {
        var text = String(value || '').trim();
        try { text = text.normalize('NFKD'); } catch (e) {}
        return text
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u2018\u2019'`.-]/g, ' ')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function wordCount(value) {
        var normalized = normalizeName(value);
        return normalized ? normalized.split(' ').length : 0;
    }

    function uniqueNames(values) {
        var seen = {};
        return values.filter(function(value) {
            var normalized = normalizeName(value);
            if (!normalized || seen[normalized]) return false;
            seen[normalized] = true;
            return true;
        });
    }

    function clientNameCandidates(clientName) {
        var raw = String(clientName || '').trim();
        if (!raw) return [];
        var candidates = [raw];
        raw.split(/\s*(?:;|\/|\||&|\band\b)\s*/i).forEach(function(group) {
            group = String(group || '').trim();
            if (!group) return;
            candidates.push(group);
            var commaParts = group.split(',').map(function(part) { return part.trim(); }).filter(Boolean);
            if (commaParts.length === 2 && commaParts.every(function(part) { return wordCount(part) === 1; })) {
                candidates.push(commaParts[1] + ' ' + commaParts[0]);
            } else if (commaParts.length > 1 && commaParts.every(function(part) { return wordCount(part) >= 2; })) {
                candidates = candidates.concat(commaParts);
            }
        });
        return uniqueNames(candidates);
    }

    function matchClientName(enteredName, clientName) {
        var entered = normalizeName(enteredName);
        var candidates = clientNameCandidates(clientName);
        var normalizedCandidates = candidates.map(normalizeName);
        var exactMatch = !!entered && normalizedCandidates.indexOf(entered) !== -1;
        var matchingCandidate = exactMatch ? candidates[normalizedCandidates.indexOf(entered)] : '';
        var hasFullName = wordCount(entered) >= 2;
        return {
            matches: exactMatch && hasFullName,
            hasFullName: hasFullName,
            entered: entered,
            candidates: candidates,
            matchingCandidate: matchingCandidate
        };
    }

    function renderPreview(element, name) {
        if (!element) return;
        var value = String(name || '').trim();
        element.textContent = value || 'Your typed signature will appear here';
        element.classList.toggle('has-signature', !!value);
    }

    function createSignatureDataUrl(name, options) {
        options = options || {};
        var value = String(name || '').trim();
        if (!value) throw new Error('A signer name is required.');
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            throw new Error('Signature rendering is unavailable in this browser.');
        }
        var canvas = document.createElement('canvas');
        canvas.width = Number(options.width) || 1200;
        canvas.height = Number(options.height) || 300;
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Signature rendering is unavailable in this browser.');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#10233d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var fontSize = 92;
        var fontFamily = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
        var maxWidth = canvas.width - 120;
        do {
            ctx.font = fontSize + 'px ' + fontFamily;
            if (ctx.measureText(value).width <= maxWidth || fontSize <= 42) break;
            fontSize -= 4;
        } while (fontSize > 38);
        ctx.fillText(value, canvas.width / 2, canvas.height / 2 - 10);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(70, canvas.height - 54);
        ctx.lineTo(canvas.width - 70, canvas.height - 54);
        ctx.stroke();
        return canvas.toDataURL('image/png');
    }

    function dataUrlToBlob(dataUrl) {
        var parts = String(dataUrl || '').split(',');
        var mimeMatch = (parts[0] || '').match(/:(.*?);/);
        if (!mimeMatch || !parts[1]) throw new Error('Invalid signature image data.');
        var binary = atob(parts[1]);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mimeMatch[1] });
    }

    return {
        normalizeName: normalizeName,
        clientNameCandidates: clientNameCandidates,
        matchClientName: matchClientName,
        renderPreview: renderPreview,
        createSignatureDataUrl: createSignatureDataUrl,
        dataUrlToBlob: dataUrlToBlob
    };
});
