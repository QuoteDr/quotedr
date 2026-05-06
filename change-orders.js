// QuoteDr change order helpers shared by builder, viewer, portal, dashboard, and invoice pages.
(function() {
    'use strict';

    function coData(rowOrData) {
        return (rowOrData && rowOrData.data) ? rowOrData.data : (rowOrData || {});
    }

    function quoteType(rowOrData) {
        var data = coData(rowOrData);
        return rowOrData?.type || data.type || data.documentType || 'quote';
    }

    function isChangeOrder(rowOrData) {
        return quoteType(rowOrData) === 'change_order';
    }

    function parentQuoteId(rowOrData) {
        var data = coData(rowOrData);
        return rowOrData?.parent_quote_id || data.parentQuoteId || data.parent_quote_id || '';
    }

    function changeOrderNumber(rowOrData) {
        var data = coData(rowOrData);
        return rowOrData?.change_order_number || data.changeOrderNumber || data.change_order_number || 0;
    }

    function quoteTotal(data) {
        data = coData(data);
        var total = parseFloat(data.grandTotal || data.total || 0);
        return isFinite(total) ? total : 0;
    }

    function rowTotal(row) {
        var total = parseFloat(row?.total || row?.data?.grandTotal || row?.data?.total || 0);
        return isFinite(total) ? total : 0;
    }

    function status(rowOrData) {
        var data = coData(rowOrData);
        return rowOrData?.status || data.status || 'draft';
    }

    function approvedChangeOrders(rows, excludeId) {
        return (rows || []).filter(function(row) {
            return isChangeOrder(row) && status(row) === 'approved' && (!excludeId || row.id !== excludeId);
        });
    }

    function approvedChangeOrderTotal(rows, excludeId) {
        return approvedChangeOrders(rows, excludeId).reduce(function(sum, row) {
            return sum + rowTotal(row);
        }, 0);
    }

    async function fetchChangeOrderContext(sb, currentRow) {
        if (!sb || !currentRow || !isChangeOrder(currentRow)) return null;
        var parentId = parentQuoteId(currentRow);
        if (!parentId) return null;

        var parentRes = await sb.from('quotes').select('*').eq('id', parentId).maybeSingle();
        var siblingsRes = await sb.from('quotes').select('*').eq('parent_quote_id', parentId).order('change_order_number', { ascending: true });
        if (siblingsRes.error) {
            siblingsRes = await sb.from('quotes').select('*').contains('data', { parentQuoteId: parentId });
        }

        var siblings = siblingsRes.data || [];
        var previousApproved = siblings.filter(function(row) {
            return row.id !== currentRow.id &&
                isChangeOrder(row) &&
                status(row) === 'approved' &&
                (changeOrderNumber(row) || 0) < (changeOrderNumber(currentRow) || 999999);
        });

        return {
            parent: parentRes.data || null,
            siblings: siblings,
            parentTotal: rowTotal(parentRes.data),
            previousApprovedTotal: approvedChangeOrderTotal(previousApproved),
            allApprovedTotal: approvedChangeOrderTotal(siblings, currentRow.id)
        };
    }

    function mergeApprovedChangeOrdersIntoInvoice(baseQuoteData, changeRows) {
        var invoice = JSON.parse(JSON.stringify(baseQuoteData || {}));
        var approved = approvedChangeOrders(changeRows || []);
        if (!approved.length) return invoice;
        invoice.rooms = Array.isArray(invoice.rooms) ? invoice.rooms : [];
        approved.forEach(function(row) {
            var data = coData(row);
            (data.rooms || []).forEach(function(room) {
                invoice.rooms.push(Object.assign({}, room, {
                    name: 'CO #' + (changeOrderNumber(row) || '') + ' - ' + (room.name || 'Change Order'),
                    changeOrderSourceId: row.id
                }));
            });
        });
        invoice.approvedChangeOrders = approved.map(function(row) {
            return {
                id: row.id,
                number: changeOrderNumber(row),
                total: rowTotal(row),
                reason: coData(row).changeReason || ''
            };
        });
        return invoice;
    }

    window.QuoteDrChangeOrders = {
        data: coData,
        type: quoteType,
        isChangeOrder: isChangeOrder,
        parentQuoteId: parentQuoteId,
        number: changeOrderNumber,
        quoteTotal: quoteTotal,
        rowTotal: rowTotal,
        status: status,
        approvedChangeOrders: approvedChangeOrders,
        approvedChangeOrderTotal: approvedChangeOrderTotal,
        fetchContext: fetchChangeOrderContext,
        mergeApprovedIntoInvoice: mergeApprovedChangeOrdersIntoInvoice
    };
})();
