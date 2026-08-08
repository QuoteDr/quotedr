(function(global) {
    'use strict';

    var state = {
        documents: [],
        filters: null,
        truncated: false,
        loading: false
    };

    function element(id) {
        return document.getElementById(id);
    }

    function setMessage(message, tone) {
        var output = element('accountingExportMessage');
        if (!output) return;
        output.className = 'alert py-2 small mb-3 alert-' + (tone || 'light');
        output.textContent = message;
        output.style.display = message ? '' : 'none';
    }

    function localDateString(date) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function setDefaultDates() {
        var from = element('accountingExportFromDate');
        var to = element('accountingExportToDate');
        if (!from || !to || from.dataset.defaulted === 'true') return;
        var today = new Date();
        from.value = localDateString(new Date(today.getFullYear(), 0, 1));
        to.value = localDateString(today);
        from.dataset.defaulted = 'true';
        to.dataset.defaulted = 'true';
    }

    function readFilters() {
        var fromDate = element('accountingExportFromDate').value;
        var toDate = element('accountingExportToDate').value;
        if (fromDate && toDate && fromDate > toDate) {
            throw new Error('The start date must be on or before the end date.');
        }
        var statuses = Array.from(document.querySelectorAll('[data-accounting-export-status]:checked')).map(function(input) {
            return input.value;
        });
        if (!statuses.length) throw new Error('Choose at least one document status.');
        return { fromDate: fromDate, toDate: toDate, statuses: statuses };
    }

    async function ownerContext() {
        if (!global.QuoteDrAccount || typeof global.QuoteDrAccount.init !== 'function') {
            throw new Error('Account access is not ready. Refresh Settings and try again.');
        }
        await global.QuoteDrAccount.init();
        var snapshot = global.QuoteDrAccount.snapshot();
        var active = snapshot && snapshot.active;
        var user = snapshot && snapshot.user;
        if (!active || !user || active.ownerUserId !== user.id) {
            var error = new Error('Accounting exports are available only to the account owner.');
            error.code = 'owner_required';
            throw error;
        }
        return active;
    }

    async function callAccountingExport(payload) {
        var active = await ownerContext();
        var client = global._supabaseClient || global._supabase;
        if (!client || !client.functions || typeof client.functions.invoke !== 'function') {
            throw new Error('The accounting export service is unavailable.');
        }
        var body = Object.assign({}, payload || {}, {
            action: 'accounting.export',
            accountId: active.accountId || null
        });
        var result = await client.functions.invoke('team-account', { body: body });
        if (result.error) {
            var invokeError = new Error(result.error.message || 'The accounting export request failed.');
            invokeError.code = result.error.code || 'accounting_export_failed';
            throw invokeError;
        }
        if (!result.data || result.data.error) {
            var responseError = new Error(result.data && result.data.error || 'The accounting export request failed.');
            responseError.code = result.data && result.data.code || 'accounting_export_failed';
            throw responseError;
        }
        return result.data.data || {};
    }

    function formatMoney(value, currency) {
        var amount = Number(value || 0);
        var code = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : 'CAD';
        try {
            return new Intl.NumberFormat('en-CA', { style: 'currency', currency: code }).format(amount);
        } catch (_) {
            return '$' + amount.toFixed(2);
        }
    }

    function addText(parent, className, value) {
        var node = document.createElement('div');
        node.className = className;
        node.textContent = value || '';
        parent.appendChild(node);
        return node;
    }

    function documentCheckboxes() {
        return Array.from(document.querySelectorAll('[data-accounting-export-document]'));
    }

    function selectedIds() {
        return documentCheckboxes().filter(function(input) { return input.checked; }).map(function(input) { return input.value; });
    }

    function updateSelection() {
        var checkboxes = documentCheckboxes();
        var selected = checkboxes.filter(function(input) { return input.checked; }).length;
        var selectAll = element('accountingExportSelectAll');
        if (selectAll) {
            selectAll.checked = checkboxes.length > 0 && selected === checkboxes.length;
            selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
            selectAll.disabled = checkboxes.length === 0;
        }
        var count = element('accountingExportSelectionCount');
        if (count) count.textContent = selected + ' selected';
        var button = element('accountingExportDownloadBtn');
        if (button) button.disabled = selected === 0 || state.loading;
    }

    function renderDocuments() {
        var list = element('accountingExportDocumentList');
        if (!list) return;
        list.replaceChildren();
        if (!state.documents.length) {
            var empty = document.createElement('div');
            empty.className = 'accounting-export-empty text-center text-muted border rounded p-4';
            var icon = document.createElement('i');
            icon.className = 'fas fa-file-circle-xmark fa-2x mb-2';
            empty.appendChild(icon);
            addText(empty, 'fw-semibold', 'No matching documents');
            addText(empty, 'small mt-1', 'No accepted quotes or issued invoices match these dates and statuses.');
            list.appendChild(empty);
            updateSelection();
            return;
        }

        state.documents.forEach(function(documentRow) {
            var label = document.createElement('label');
            label.className = 'accounting-export-document border rounded p-3';

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input accounting-export-document-check';
            input.value = documentRow.id;
            input.setAttribute('data-accounting-export-document', '');
            input.setAttribute('aria-label', 'Select ' + (documentRow.typeLabel || 'document') + ' ' + (documentRow.number || 'without a number'));
            input.addEventListener('change', updateSelection);
            label.appendChild(input);

            var identity = document.createElement('div');
            identity.className = 'accounting-export-document-identity';
            addText(identity, 'fw-semibold', (documentRow.typeLabel || 'Document') + ' ' + (documentRow.number || 'No number'));
            addText(identity, 'small text-muted', (documentRow.customerName || 'No customer name') + ' · ' + (documentRow.date || 'No document date'));
            label.appendChild(identity);

            var status = document.createElement('div');
            status.className = 'accounting-export-document-status';
            addText(status, 'small fw-semibold', documentRow.status || '');
            addText(status, 'small text-muted', documentRow.paymentStatus || '');
            label.appendChild(status);

            addText(label, 'accounting-export-document-total fw-bold text-end', formatMoney(documentRow.total, documentRow.currency));
            list.appendChild(label);
        });
        updateSelection();
    }

    function setLoading(loading) {
        state.loading = loading;
        var findButton = element('accountingExportFindBtn');
        if (findButton) {
            findButton.disabled = loading;
            findButton.innerHTML = loading
                ? '<span class="spinner-border spinner-border-sm me-1"></span>Finding documents...'
                : '<i class="fas fa-magnifying-glass me-1"></i>Find Documents';
        }
        updateSelection();
    }

    async function loadDocuments() {
        if (state.loading) return;
        var filters;
        try {
            filters = readFilters();
            await ownerContext();
        } catch (error) {
            setMessage(error.message || 'Check the export filters and try again.', 'warning');
            return;
        }
        state.filters = filters;
        state.documents = [];
        state.truncated = false;
        renderDocuments();
        setMessage('Finding eligible documents. This only reads your account data.', 'light');
        setLoading(true);
        try {
            var data = await callAccountingExport({ mode: 'list', filters: filters });
            state.documents = Array.isArray(data.documents) ? data.documents : [];
            state.truncated = data.truncated === true;
            renderDocuments();
            if (state.documents.length) {
                setMessage(
                    state.documents.length + ' eligible document' + (state.documents.length === 1 ? '' : 's') + ' found. Choose the ones to include.'
                    + (state.truncated ? ' The result limit was reached; narrow the date range to see more.' : ''),
                    state.truncated ? 'warning' : 'success'
                );
            } else {
                setMessage('No accepted quotes or issued invoices match these dates and statuses.', 'light');
            }
        } catch (error) {
            state.documents = [];
            renderDocuments();
            setMessage((error.message || 'Could not load eligible documents.') + ' No data was changed.', 'danger');
        } finally {
            setLoading(false);
        }
    }

    function toggleAll(checked) {
        documentCheckboxes().forEach(function(input) { input.checked = !!checked; });
        updateSelection();
    }

    function clearDates() {
        element('accountingExportFromDate').value = '';
        element('accountingExportToDate').value = '';
    }

    function downloadCsv(csv, filename) {
        var blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || 'quotedr-accounting-transactions.csv';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 0);
    }

    async function exportSelected() {
        var ids = selectedIds();
        if (!ids.length) {
            setMessage('Choose at least one document to export.', 'warning');
            return;
        }
        var button = element('accountingExportDownloadBtn');
        var original = button ? button.innerHTML : '';
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Preparing CSV...';
        }
        setMessage('Preparing the selected accounting rows. No QuoteDr records will be changed.', 'light');
        try {
            var data = await callAccountingExport({ mode: 'csv', filters: state.filters || readFilters(), documentIds: ids });
            if (!data.csv) throw new Error('The export service returned an empty file.');
            downloadCsv(data.csv, data.filename);
            setMessage(
                'Downloaded ' + data.documentCount + ' document' + (data.documentCount === 1 ? '' : 's')
                + ' across ' + data.lineCount + ' CSV row' + (data.lineCount === 1 ? '' : 's') + '.',
                'success'
            );
        } catch (error) {
            setMessage((error.message || 'Could not create the accounting CSV.') + ' No data was changed.', 'danger');
        } finally {
            if (button) button.innerHTML = original;
            updateSelection();
        }
    }

    async function open() {
        try {
            await ownerContext();
        } catch (error) {
            if (typeof global.qdAlert === 'function') global.qdAlert(error.message);
            else global.alert(error.message);
            return;
        }
        setDefaultDates();
        state.documents = [];
        state.filters = null;
        renderDocuments();
        setMessage('Choose dates and statuses, then select the documents to export.', 'light');
        var modalElement = element('accountingTransactionExportModal');
        if (!modalElement || !global.bootstrap || !global.bootstrap.Modal) return;
        global.bootstrap.Modal.getOrCreateInstance(modalElement).show();
        loadDocuments();
    }

    async function applyOwnerVisibility() {
        var section = element('accountingExportOwnerSection');
        if (!section) return;
        try {
            var active = await ownerContext();
            section.style.display = active ? '' : 'none';
        } catch (_) {
            section.style.display = 'none';
        }
    }

    global.QuoteDrAccountingExportUI = Object.freeze({
        open: open,
        loadDocuments: loadDocuments,
        toggleAll: toggleAll,
        clearDates: clearDates,
        exportSelected: exportSelected,
        updateSelection: updateSelection,
        applyOwnerVisibility: applyOwnerVisibility
    });

    document.addEventListener('DOMContentLoaded', applyOwnerVisibility);
    global.addEventListener('quotedr-account-ready', applyOwnerVisibility);
    global.addEventListener('quotedr-account-changed', applyOwnerVisibility);
})(typeof window !== 'undefined' ? window : globalThis);
