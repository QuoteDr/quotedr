(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrPortalReadiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function finite(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function itemName(item) {
        return String(item && (item.description || item.serviceName || item.name) || 'Unnamed line item').trim() || 'Unnamed line item';
    }

    function itemIsIncluded(item) {
        if (!item || item._removed === true || item._coRemoved === true) return false;
        if (item.optional === true && item.optionalSelectedByDefault === false && item._optionalSelected !== true) return false;
        return true;
    }

    function itemIsPriceTbd(item) {
        return !!item && (item.priceTbd === true || String(item.pricingMode || '').toLowerCase() === 'tbd');
    }

    function documentIsChangeOrder(documentData) {
        documentData = documentData || {};
        return documentData.type === 'change_order' || documentData.documentType === 'change_order' || documentData._type === 'change_order';
    }

    function itemSellTotal(item, documentData) {
        if (!item) return 0;
        // Change orders store the line's net adjustment in `total`. An unchanged,
        // fully priced line therefore has total=0 even though its current base
        // quantity and rate are valid. Read the gross/base line amount here so
        // the portal guard only warns about genuinely zero-priced work.
        if (documentIsChangeOrder(documentData)) {
            var changeOrderQuantity = item.quantity === undefined || item.quantity === null || item.quantity === '' ? 1 : finite(item.quantity, 0);
            return changeOrderQuantity * finite(item.rate, 0);
        }
        if (item.total !== undefined && item.total !== null && item.total !== '') return finite(item.total, 0);
        var quantity = item.quantity === undefined || item.quantity === null || item.quantity === '' ? 1 : finite(item.quantity, 0);
        return quantity * finite(item.rate, 0);
    }

    function findZeroPricedItems(documentData) {
        documentData = documentData || {};
        var findings = [];
        (Array.isArray(documentData.rooms) ? documentData.rooms : []).forEach(function(room, roomIndex) {
            (Array.isArray(room && room.items) ? room.items : []).forEach(function(item, itemIndex) {
                if (!itemIsIncluded(item) || itemIsPriceTbd(item)) return;
                if (Math.round(itemSellTotal(item, documentData) * 100) !== 0) return;
                findings.push({
                    roomIndex: roomIndex,
                    itemIndex: itemIndex,
                    roomName: String(room && room.name || 'Unassigned').trim() || 'Unassigned',
                    itemName: itemName(item),
                    changeOrder: documentIsChangeOrder(documentData)
                });
            });
        });
        return findings;
    }

    function zeroPriceWarningMessage(findings) {
        findings = Array.isArray(findings) ? findings : [];
        var shown = findings.slice(0, 6).map(function(finding) {
            return finding.roomName + ' — ' + finding.itemName;
        });
        var more = findings.length > shown.length ? '; plus ' + (findings.length - shown.length) + ' more' : '';
        var isChangeOrder = findings.some(function(finding) { return finding.changeOrder === true; });
        return 'QuoteDr found ' + findings.length + ' included line item' + (findings.length === 1 ? '' : 's') +
            ' with a $0 ' + (isChangeOrder ? 'base price' : 'price') + ': ' + shown.join('; ') + more +
            '. ' + (isChangeOrder ? 'Unchanged work with a $0 net change is ignored by this check. ' : '') +
            'These will appear as free to the client. Go back and review them, or continue only if the $0 pricing is intentional.';
    }

    async function confirmZeroPricedItems(documentData, confirmFn) {
        var candidate = prepareExpiry(documentData);
        var expiryMessage = expiryWarningMessage(candidate);
        var remaining = expiryDays(candidate);
        if (remaining !== null && (!Number.isFinite(remaining) || remaining < 0)) {
            if (typeof confirmFn === 'function') await confirmFn('This quote cannot be sent with an expired or invalid expiry date. Open Send Quote Settings and update or renew its expiry first.', {title:'Update Quote Expiry',okText:'Go Back & Update',cancelText:'Cancel',type:'warning'});
            return false;
        }
        if (expiryMessage && (typeof confirmFn !== 'function' || !await confirmFn(expiryMessage, {
            title:'Check Quote Expiry',okText:'Send Anyway',cancelText:'Go Back & Review',type:'warning'
        }))) return false;
        var findings = findZeroPricedItems(documentData);
        if (!findings.length) { documentData.style = candidate.style; return true; }
        if (typeof confirmFn !== 'function') return false;
        var accepted = !!(await confirmFn(zeroPriceWarningMessage(findings), {
            title: 'Zero-Priced Items Found',
            okText: 'Send Anyway',
            cancelText: 'Go Back & Review',
            okClass: 'btn-danger',
            type: 'warning'
        }, findings));
        if (accepted) documentData.style = candidate.style;
        return accepted;
    }

    function prepareExpiry(data, now) {
        var result = Object.assign({}, data);
        result.style = Object.assign({}, data && data.style);
        var style = result.style;
        if (!documentIsChangeOrder(result) && result.type !== 'invoice' && style.expiryMode === 'automatic' && !style.expiryStartedAt) {
            var days = Number(style.expiryDurationDays);
            if (Number.isInteger(days) && days >= 1 && days <= 365) {
                var date = new Date(now || new Date());
                style.expiryStartedAt = date.toISOString();
                date.setDate(date.getDate() + days);
                style.expiryDate = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
            } else style.expiryDate = 'invalid';
        }
        return result;
    }

    function expiryDays(data, now) {
        data = data || {};
        if (documentIsChangeOrder(data) || data.type === 'invoice') return null;
        var style = data.style || {};
        if (style.expiryMode === 'none') return null;
        var raw = style.expiryDate || data.valid_until || data.validUntil || data.validUntilDate;
        if (!raw) return null;
        var match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
        if (!match) return NaN;
        var date = new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
        if (date.getUTCFullYear() !== +match[1] || date.getUTCMonth() !== +match[2]-1 || date.getUTCDate() !== +match[3]) return NaN;
        var today = now || new Date();
        return Math.round((date.getTime()-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
    }

    function expiryWarningMessage(data, now) {
        data=data || {};
        if (documentIsChangeOrder(data) || data.type === 'invoice') return '';
        var days=expiryDays(data, now);
        if (days === null) return '';
        if (!Number.isFinite(days)) return 'The quote expiry date could not be checked. Review it before sending.';
        if (days >= 7) return '';
        return (days < 0 ? 'This quote has already expired.' : days === 0 ? 'This quote expires today.' : 'This quote expires in '+days+' day'+(days===1?'':'s')+'.')+' Review the expiry date before sending, or continue only if this is intentional.';
    }

    return {
        prepareExpiry: prepareExpiry,
        expiryDays: expiryDays,
        expiryWarningMessage: expiryWarningMessage,
        itemIsIncluded: itemIsIncluded,
        itemIsPriceTbd: itemIsPriceTbd,
        documentIsChangeOrder: documentIsChangeOrder,
        itemSellTotal: itemSellTotal,
        findZeroPricedItems: findZeroPricedItems,
        zeroPriceWarningMessage: zeroPriceWarningMessage,
        confirmZeroPricedItems: confirmZeroPricedItems
    };
});
