(function(global) {
    'use strict';

    var state = { profile: null, documents: [], filters: null, loading: false };

    function element(id) { return document.getElementById(id); }

    function localDateString(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function setMessage(message, tone) {
        var output = element('qboInvoiceExportMessage');
        if (!output) return;
        output.className = 'alert py-2 small mb-3 alert-' + (tone || 'light');
        output.textContent = message;
        output.style.display = message ? '' : 'none';
    }

    async function ownerContext() {
        var account = global.QuoteDrAccount && global.QuoteDrAccount.active && global.QuoteDrAccount.active();
        var user = global._supabaseUser || (global._supabase && (await global._supabase.auth.getUser()).data.user);
        if (!account || !user || account.ownerUserId !== user.id) {
            var error = new Error('QBO invoice exports are available only to the account owner.');
            error.code = 'owner_required';
            throw error;
        }
        return account;
    }

    async function callApi(action, payload) {
        var account = await ownerContext();
        var client = global._supabaseClient || global._supabase;
        if (!client || !client.functions || typeof client.functions.invoke !== 'function') {
            throw new Error('The QBO invoice export service is unavailable.');
        }
        var result = await client.functions.invoke('team-account', {
            body: Object.assign({ action: action, accountId: account.accountId || null }, payload || {})
        });
        if (result.error) throw new Error(result.error.message || 'The QBO invoice export request failed.');
        if (!result.data || result.data.error) throw new Error((result.data && result.data.error) || 'The QBO invoice export request failed.');
        return result.data.data || {};
    }

    function setDefaultDates() {
        var from = element('qboInvoiceExportFromDate');
        var to = element('qboInvoiceExportToDate');
        if (!from || !to || from.dataset.defaulted === 'true') return;
        var today = new Date();
        from.value = localDateString(new Date(today.getFullYear(), 0, 1));
        to.value = localDateString(today);
        from.dataset.defaulted = 'true';
        to.dataset.defaulted = 'true';
    }

    function readFilters() {
        var fromDate = element('qboInvoiceExportFromDate').value;
        var toDate = element('qboInvoiceExportToDate').value;
        if (fromDate && toDate && fromDate > toDate) throw new Error('The start date must be on or before the end date.');
        return { fromDate: fromDate, toDate: toDate };
    }

    function parseMappings(value, label) {
        var map = {};
        String(value || '').split(/\r?\n/).forEach(function(line, index) {
            var raw = line.trim();
            if (!raw) return;
            var parts = raw.split('=>');
            if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
                throw new Error(label + ' line ' + (index + 1) + ' must use “QuoteDr value => QBO value”.');
            }
            var source = parts[0].trim();
            var target = parts[1].trim();
            if (map[source] && map[source] !== target) throw new Error(label + ' maps “' + source + '” more than once.');
            map[source] = target;
        });
        return map;
    }

    function mappingLines(map) {
        return Object.keys(map || {}).sort().map(function(source) { return source + ' => ' + map[source]; }).join('\n');
    }

    function profileFromForm() {
        return {
            name: element('qboInvoiceProfileName').value.trim(),
            allowCreateCustomers: !!element('qboInvoiceAllowCreateCustomers').checked,
            taxExemptCode: element('qboInvoiceTaxExemptCode').value.trim(),
            customerMappings: parseMappings(element('qboInvoiceCustomerMappings').value, 'Customer mapping'),
            itemMappings: parseMappings(element('qboInvoiceItemMappings').value, 'Product/service mapping'),
            taxMappings: parseMappings(element('qboInvoiceTaxMappings').value, 'Tax mapping')
        };
    }

    function showProfile(profile) {
        state.profile = profile || {};
        element('qboInvoiceProfileName').value = state.profile.name || '';
        element('qboInvoiceAllowCreateCustomers').checked = state.profile.allowCreateCustomers === true;
        element('qboInvoiceTaxExemptCode').value = state.profile.taxExemptCode || '';
        element('qboInvoiceCustomerMappings').value = mappingLines(state.profile.customerMappings);
        element('qboInvoiceItemMappings').value = mappingLines(state.profile.itemMappings);
        element('qboInvoiceTaxMappings').value = mappingLines(state.profile.taxMappings);
        var status = element('qboInvoiceProfileStatus');
        if (status) status.textContent = 'Selected profile: ' + (state.profile.name || 'Not configured');
    }

    async function loadProfile() {
        var data = await callApi('accounting.qbo_invoice_profile', { mode: 'get' });
        showProfile(data.profile || {});
        return data.profile || {};
    }

    async function saveProfile() {
        var button = element('qboInvoiceSaveProfileBtn');
        try {
            var profile = profileFromForm();
            if (!profile.name) throw new Error('Give this QBO profile a name.');
            if (!profile.taxExemptCode) throw new Error('Enter the exact QBO tax-exempt code used by this company.');
            if (button) button.disabled = true;
            var data = await callApi('accounting.qbo_invoice_profile', { mode: 'save', profile: profile });
            showProfile(data.profile || profile);
            var modal = element('qboInvoiceProfileModal');
            if (modal && global.bootstrap) global.bootstrap.Modal.getOrCreateInstance(modal).hide();
            setMessage('Saved the QBO profile. Review invoices to see exactly what is ready and what needs attention.', 'success');
        } catch (error) {
            setMessage(error.message || 'The QBO profile could not be saved. No invoice data was changed.', 'danger');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function selectedIds() {
        return Array.from(document.querySelectorAll('[data-qbo-invoice-document]:checked')).map(function(input) { return input.value; });
    }

    function updateSelection() {
        var selected = selectedIds();
        var label = element('qboInvoiceSelectionCount');
        if (label) label.textContent = selected.length + ' selected';
        var button = element('qboInvoiceDownloadBtn');
        if (button) button.disabled = state.loading || selected.length === 0;
    }

    function addText(parent, className, value) {
        var node = document.createElement('div');
        node.className = className;
        node.textContent = value;
        parent.appendChild(node);
    }

    function renderDocuments(data) {
        state.documents = Array.isArray(data.documents) ? data.documents : [];
        var list = element('qboInvoiceDocumentList');
        list.replaceChildren();
        if (!state.documents.length) {
            addText(list, 'text-muted text-center border rounded p-4', 'No documents match this date range.');
            updateSelection();
            return;
        }
        state.documents.forEach(function(documentRow) {
            var row = document.createElement('label');
            row.className = 'qbo-invoice-export-document border rounded p-3 ' + (documentRow.included ? 'border-success-subtle' : 'border-warning-subtle');
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = documentRow.id;
            input.className = 'form-check-input me-2';
            input.setAttribute('data-qbo-invoice-document', '');
            input.disabled = !documentRow.included;
            input.addEventListener('change', updateSelection);
            row.appendChild(input);
            var content = document.createElement('div');
            content.className = 'flex-grow-1';
            addText(content, 'fw-semibold', (documentRow.invoiceNumber || 'Invoice without a number') + ' · ' + (documentRow.customer || 'No customer'));
            addText(content, 'small text-muted', (documentRow.date || 'No invoice date') + ' · Due ' + (documentRow.dueDate || 'missing') + ' · ' + (documentRow.lineCount || 0) + ' lines');
            if (documentRow.included) addText(content, 'small text-success fw-semibold mt-1', 'Ready for the selected QBO profile');
            else addText(content, 'small text-danger mt-1', (documentRow.reasons || []).join(' '));
            row.appendChild(content);
            var total = document.createElement('div');
            total.className = 'fw-semibold text-end ms-2';
            total.textContent = (documentRow.currency || '') + ' ' + Number(documentRow.total || 0).toFixed(2);
            row.appendChild(total);
            list.appendChild(row);
        });
        updateSelection();
    }

    function setLoading(loading) {
        state.loading = loading;
        var button = element('qboInvoiceReviewBtn');
        if (button) {
            button.disabled = loading;
            button.innerHTML = loading ? '<span class="spinner-border spinner-border-sm me-1"></span>Reviewing…' : '<i class="fas fa-clipboard-check me-1"></i>Review QBO readiness';
        }
        updateSelection();
    }

    async function review() {
        try {
            state.filters = readFilters();
            await ownerContext();
        } catch (error) {
            setMessage(error.message || 'Check the QBO export dates and try again.', 'warning');
            return;
        }
        setLoading(true);
        setMessage('Checking the current owner-account invoices against the selected QBO profile. No QBO transaction will be created.', 'light');
        try {
            var data = await callApi('accounting.qbo_invoice_export', { mode: 'preflight', filters: state.filters });
            showProfile(data.profile || state.profile || {});
            renderDocuments(data);
            var totals = data.totals || {};
            setMessage(
                (totals.includedInvoices || 0) + ' invoice(s) ready · ' + (totals.excludedInvoices || 0) + ' need attention · ' + (totals.includedRows || 0) + ' QBO rows. ' +
                (data.truncated ? 'Narrow the dates before exporting because this review reached its source limit.' : 'Select ready invoices to download the CSV.'),
                data.truncated ? 'warning' : 'success'
            );
        } catch (error) {
            state.documents = [];
            renderDocuments({ documents: [] });
            setMessage((error.message || 'The QBO preflight could not be completed.') + ' No invoice data was changed.', 'danger');
        } finally {
            setLoading(false);
        }
    }

    function downloadCsv(csv, filename) {
        var blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || 'quotedr-qbo-invoices.csv';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 0);
    }

    async function exportSelected() {
        var ids = selectedIds();
        if (!ids.length) return setMessage('Choose one or more QBO-ready invoices first.', 'warning');
        if (ids.length > 100) return setMessage('Choose no more than 100 invoices at once.', 'warning');
        var button = element('qboInvoiceDownloadBtn');
        var original = button ? button.innerHTML : '';
        try {
            if (button) { button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Preparing CSV…'; }
            var data = await callApi('accounting.qbo_invoice_export', { mode: 'csv', filters: state.filters || readFilters(), documentIds: ids });
            if (!data.csv) throw new Error('The QBO export service returned an empty file.');
            downloadCsv(data.csv, data.filename);
            setMessage('Downloaded ' + data.documentCount + ' QBO-ready invoice(s) from profile “' + (data.profile || '') + '”. No QBO transaction was created.', 'success');
        } catch (error) {
            setMessage((error.message || 'Could not create the QBO invoice CSV.') + ' No QBO or QuoteDr invoice was changed.', 'danger');
        } finally {
            if (button) button.innerHTML = original;
            updateSelection();
        }
    }

    async function open() {
        try {
            await ownerContext();
            setDefaultDates();
            await loadProfile();
            if (global.bootstrap) global.bootstrap.Modal.getOrCreateInstance(element('qboInvoiceExportModal')).show();
            setMessage('Save or review the selected QBO profile, then check invoice readiness. This only prepares a CSV.', 'light');
        } catch (error) {
            if (typeof global.qdAlert === 'function') global.qdAlert(error.message || 'QBO invoice exports are available only to the account owner.');
            else global.alert(error.message || 'QBO invoice exports are available only to the account owner.');
        }
    }

    async function applyOwnerVisibility() {
        var section = element('qboInvoiceExportOwnerSection');
        if (!section) return;
        try { await ownerContext(); section.style.display = ''; } catch (_) { section.style.display = 'none'; }
    }

    global.QuoteDrQboInvoiceExportUI = Object.freeze({ open: open, review: review, saveProfile: saveProfile, exportSelected: exportSelected, applyOwnerVisibility: applyOwnerVisibility });

    document.addEventListener('DOMContentLoaded', applyOwnerVisibility);
    global.addEventListener('quotedr-account-ready', applyOwnerVisibility);
    global.addEventListener('quotedr-account-changed', applyOwnerVisibility);
})(window);
