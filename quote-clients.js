// Client management module extracted from quote-builder.html.
// Owns saved client localStorage, autocomplete, and the manage clients modal behavior.
(function() {
    'use strict';

// Client database from past quotes
        // clientDatabase is now empty - all clients live in localStorage (ald_clients)
        // Legacy clients were migrated on first load via loadSavedClients()
        const clientDatabase = {};

        // Legacy clients to migrate on first run (will never appear in code again after migration)
        const LEGACY_CLIENTS = [];

        // Fuzzy matching function
        function fuzzyMatch(query, text) {
            query = query.toLowerCase().trim();
            text = text.toLowerCase().trim();

            if (query === text) return { score: 100, exact: true };
            if (text.includes(query)) return { score: 90, exact: false };

            const distances = [];
            for (let i = 0; i < text.length; i++) {
                let j = 0;
                while (j < query.length && text[i + j] === query[j]) {
                    j++;
                }
                if (j > 0) distances.push(j);
            }

            const maxMatch = Math.max(...distances, 0);
            return { score: (maxMatch / query.length) * 100, exact: false };
        }

        // Search clients based on input (merged database)
        function searchClients(query) {
            if (!query || query.length < 2) return [];
            const all = getAllClients();
            const results = [];
            for (const [clientName, data] of Object.entries(all)) {
                const match = fuzzyMatch(query, clientName);
                if (match.score > 50) {
                    results.push({ ...data, score: match.score });
                }
            }
            return results.sort((a, b) => b.score - a.score);
        }

        // Show autocomplete dropdown
        function showClientSuggestions() {
            const query = document.getElementById('clientName').value;
            const results = searchClients(query);
            const dropdown = document.getElementById('clientDropdown');

            if (results.length > 0) {
                dropdown.innerHTML = '';
                results.forEach(client => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';

                    let displayName = client.name;
                    if (!client.exact) {
                        const idx = displayName.toLowerCase().indexOf(query.toLowerCase());
                        if (idx >= 0) {
                            displayName = displayName.substring(0, idx) +
                                         '<strong>' + displayName.substring(idx, idx + query.length) + '</strong>' +
                                         displayName.substring(idx + query.length);
                        }
                    }

                    const subtitle = client.address ? client.address : (client.filename ? 'From: ' + client.filename : '');
                    item.innerHTML = `<span>${displayName}</span><small class="text-muted">${subtitle}</small>`;
                    item.onclick = function() {
                        fillClientInfo(client.name, client);
                        hideClientDropdown();
                    };
                    dropdown.appendChild(item);
                });
                dropdown.style.display = 'block';
            } else {
                hideClientDropdown();
            }
        }

        // Hide autocomplete dropdown
        function hideClientDropdown() {
            setTimeout(() => {
                document.getElementById('clientDropdown').style.display = 'none';
            }, 200);
        }

        // ── Client Database (localStorage) ──────────────────────────────────────
        let savedClients = {};

        function escapeHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizeClientCrm(client) {
            const crm = client && typeof client.crm === 'object' && !Array.isArray(client.crm) ? client.crm : {};
            return {
                notes: crm.notes || client?.notes || '',
                birthday: crm.birthday || '',
                preferredContact: crm.preferredContact || '',
                tags: crm.tags || '',
                followUpDate: crm.followUpDate || '',
                referralSource: crm.referralSource || ''
            };
        }

        function normalizeClientPropertyAddress(value) {
            if (window.QuoteDrPropertyMemory && typeof window.QuoteDrPropertyMemory.normalizeAddress === 'function') {
                return window.QuoteDrPropertyMemory.normalizeAddress(value);
            }
            return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function normalizeClientProperty(property) {
            const source = typeof property === 'string' ? { address: property } : (property || {});
            const address = String(source.address || source.displayAddress || '').trim();
            const city = String(source.city || '').trim();
            const normalizedAddress = normalizeClientPropertyAddress([address, city].filter(Boolean).join(', '));
            return {
                id: String(source.id || source.propertyId || (normalizedAddress ? 'address:' + normalizedAddress : '')).trim(),
                label: String(source.label || '').trim(),
                address,
                city,
                phone: String(source.phone || '').trim(),
                email: String(source.email || '').trim()
            };
        }

        function normalizeClientProperties(source) {
            source = source || {};
            const embedded = source.crm && Array.isArray(source.crm.quoteDrProperties) ? source.crm.quoteDrProperties : [];
            const candidates = [];
            if (source.address || source.city) {
                candidates.push({ address: source.address || '', city: source.city || '' });
            }
            candidates.push(...(Array.isArray(source.properties) ? source.properties : embedded));
            const properties = [];
            const byAddress = {};
            candidates.forEach(function(candidate) {
                const property = normalizeClientProperty(candidate);
                const key = normalizeClientPropertyAddress([property.address, property.city].filter(Boolean).join(', '));
                if (!key) return;
                if (byAddress[key] !== undefined) {
                    const existing = properties[byAddress[key]];
                    ['id', 'label', 'address', 'city', 'phone', 'email'].forEach(function(field) {
                        if (property[field]) existing[field] = property[field];
                    });
                    return;
                }
                byAddress[key] = properties.length;
                properties.push(property);
            });
            return properties;
        }

        function normalizeClientRecord(client, fallbackName) {
            const source = client || {};
            const name = (source.name || fallbackName || '').trim();
            const crm = normalizeClientCrm(source);
            const properties = normalizeClientProperties(source);
            const primaryProperty = properties[0] || {};
            return {
                id: source.id || source.clientId || '',
                name,
                phone: source.phone || '',
                email: source.email || '',
                address: source.address || primaryProperty.address || '',
                city: source.city || primaryProperty.city || '',
                notes: crm.notes || '',
                crm,
                properties
            };
        }

        function getClientProperties(client) {
            return normalizeClientRecord(client, client && client.name).properties.slice();
        }

        function upsertClientProperty(client, propertyData) {
            const normalized = normalizeClientRecord(client, client && client.name);
            const property = normalizeClientProperty(propertyData);
            if (!property.address && !property.city) return normalized;
            return normalizeClientRecord({
                ...normalized,
                address: property.address || normalized.address,
                city: property.city || normalized.city,
                properties: normalized.properties.concat([property])
            }, normalized.name);
        }

        function readClientCrmForm() {
            return {
                notes: (document.getElementById('newClientCrmNotes')?.value || '').trim(),
                birthday: (document.getElementById('newClientBirthday')?.value || '').trim(),
                preferredContact: (document.getElementById('newClientPreferredContact')?.value || '').trim(),
                tags: (document.getElementById('newClientTags')?.value || '').trim(),
                followUpDate: (document.getElementById('newClientFollowUpDate')?.value || '').trim(),
                referralSource: (document.getElementById('newClientReferralSource')?.value || '').trim()
            };
        }

        function writeClientCrmForm(crm) {
            const data = normalizeClientCrm({ crm: crm || {} });
            const fields = {
                newClientCrmNotes: data.notes,
                newClientBirthday: data.birthday,
                newClientPreferredContact: data.preferredContact,
                newClientTags: data.tags,
                newClientFollowUpDate: data.followUpDate,
                newClientReferralSource: data.referralSource
            };
            Object.entries(fields).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.value = value || '';
            });
        }

        function getClientSearchText(client) {
            const c = normalizeClientRecord(client, client?.name);
            const crm = c.crm || {};
            return [
                c.name,
                c.phone,
                c.email,
                c.address,
                c.city,
                crm.notes,
                crm.tags,
                crm.referralSource,
                crm.preferredContact,
                crm.birthday,
                crm.followUpDate
            ].join(' ').toLowerCase();
        }

        function loadSavedClients() {
            try { savedClients = JSON.parse(localStorage.getItem('ald_clients') || '{}'); }
            catch(e) { savedClients = {}; }
            // Fix corrupted array format → convert to object keyed by name
            if (Array.isArray(savedClients)) {
                var obj = {};
                savedClients.forEach(function(c) { if (c && c.name) obj[c.name] = c; });
                savedClients = obj;
                localStorage.setItem('ald_clients', JSON.stringify(savedClients));
            }
            Object.entries(savedClients).forEach(([name, data]) => {
                savedClients[name] = normalizeClientRecord(data, name);
            });
            // One-time migration: import legacy clients that aren't already saved
            let migrated = false;
            LEGACY_CLIENTS.forEach(name => {
                if (!savedClients[name]) {
                    savedClients[name] = normalizeClientRecord({ name, phone: '', email: '', address: '' }, name);
                    migrated = true;
                }
            });
            if (migrated) localStorage.setItem('ald_clients', JSON.stringify(savedClients));
        }

        function persistClients() {
            Object.entries(savedClients).forEach(([name, data]) => {
                savedClients[name] = normalizeClientRecord(data, name);
            });
            localStorage.setItem('ald_clients', JSON.stringify(savedClients));

            // Also sync to Supabase if available
            if (typeof saveClientToSupabase === 'function') {
                Object.values(savedClients).forEach(function(client) {
                    saveClientToSupabase(client).catch(function(e){ console.warn('Client sync error:', e); });
                });
            }
        }

        function getAllClients() {
            // All clients live in savedClients - no hardcoded list
            const merged = {};
            Object.entries(savedClients).forEach(([name, data]) => {
                merged[name] = normalizeClientRecord(data, name);
            });
            return merged;
        }

        function fillClientInfo(clientName, clientData, propertyData, clientKey) {
            const client = normalizeClientRecord(clientData, clientName);
            const property = normalizeClientProperty(propertyData || {
                address: client.address,
                city: client.city,
                phone: client.phone,
                email: client.email
            });
            const displayAddress = String(propertyData && propertyData.displayAddress || property.address || client.address || '').trim();
            const values = {
                clientName: clientName || client.name || '',
                projectAddress: displayAddress,
                clientPhone: property.phone || client.phone || '',
                clientEmail: property.email || client.email || ''
            };
            const selectedClientId = String(client.id || clientKey || values.clientName).trim();
            const selectedPropertyId = String(property.id || normalizeClientPropertyAddress(displayAddress)).trim();
            Object.entries(values).forEach(function(entry) {
                const input = document.getElementById(entry[0]);
                if (!input) return;
                input.value = entry[1];
                input.dataset.selectedClientId = selectedClientId;
                input.dataset.selectedClientKey = String(clientKey || clientName || '').trim();
                input.dataset.selectedPropertyId = selectedPropertyId;
            });
            window._selectedQuoteClient = client;
            window._selectedQuoteProperty = property;
            if (window.QuoteDrPropertyMemory) window.QuoteDrPropertyMemory.refreshForCurrentAddress();
            if (typeof markUnsaved === 'function') markUnsaved();
        }

        function saveCurrentClient() {
            const name    = document.getElementById('clientName').value.trim();
            const phone   = document.getElementById('clientPhone').value.trim();
            const email   = document.getElementById('clientEmail').value.trim();
            const address = document.getElementById('projectAddress').value.trim();
            if (!name) { alert('Please enter a client name first.'); return; }
            const existing = normalizeClientRecord(savedClients[name], name);
            const updated = normalizeClientRecord({ ...existing, name, phone, email, address }, name);
            savedClients[name] = upsertClientProperty(updated, { address, city: updated.city, phone, email });
            persistClients();
            // Flash save status
            const el = document.getElementById('saveStatus');
            if (el) { el.textContent = '✓ Client "' + name + '" saved!'; setTimeout(() => { el.textContent = ''; }, 3000); }
        }

        function openManageClientsModal() {
            clearClientForm();
            renderClientsList();
            new bootstrap.Modal(document.getElementById('manageClientsModal')).show();
        }

        function clearClientForm() {
            ['newClientName','newClientPhone','newClientEmail','newClientAddress'].forEach(id => {
                document.getElementById(id).value = '';
            });
            writeClientCrmForm({});
            const crmCollapse = document.getElementById('clientCrmDetails');
            if (crmCollapse && crmCollapse.classList.contains('show') && window.bootstrap?.Collapse) {
                bootstrap.Collapse.getOrCreateInstance(crmCollapse, { toggle: false }).hide();
            }
        }

        function editClientInModal(name) {
            const c = normalizeClientRecord(savedClients[name], name);
            if (!c) return;
            document.getElementById('newClientName').value    = c.name    || name;
            document.getElementById('newClientPhone').value   = c.phone   || '';
            document.getElementById('newClientEmail').value   = c.email   || '';
            document.getElementById('newClientAddress').value = c.address || '';
            writeClientCrmForm(c.crm || {});
            // Scroll to top of modal body and highlight the form
            const modalBody = document.querySelector('#manageClientsModal .modal-body');
            if (modalBody) modalBody.scrollTop = 0;
            // Flash the form to show it's been populated
            const form = document.querySelector('#manageClientsModal .row.g-2.mb-3');
            if (form) {
                form.style.transition = 'background 0.3s';
                form.style.background = '#fff3cd';
                setTimeout(() => { form.style.background = ''; }, 1200);
            }
            document.getElementById('newClientName').focus();
        }

        function saveClientFromModal() {
            const name    = document.getElementById('newClientName').value.trim();
            const phone   = document.getElementById('newClientPhone').value.trim();
            const email   = document.getElementById('newClientEmail').value.trim();
            const address = document.getElementById('newClientAddress').value.trim();
            if (!name) { alert('Please enter a client name.'); return; }
            const existing = normalizeClientRecord(savedClients[name], name);
            const updated = normalizeClientRecord({ ...existing, name, phone, email, address, crm: readClientCrmForm() }, name);
            savedClients[name] = upsertClientProperty(updated, { address, city: updated.city, phone, email });
            persistClients();
            clearClientForm();
            renderClientsList();
        }

        function deleteClient(name) {
            if (!confirm('Delete "' + name + '" from your client database?')) return;
            delete savedClients[name];
            persistClients();
            renderClientsList();
        }

        function renderClientsList() {
            const filter = (document.getElementById('clientSearchFilter')?.value || '').toLowerCase();
            const all = getAllClients();
            const filtered = Object.values(all).filter(c => getClientSearchText(c).includes(filter)).sort((a,b) => a.name.localeCompare(b.name));
            const container = document.getElementById('clientsList');
            if (!filtered.length) { container.innerHTML = '<p class="text-muted text-center py-3">No clients found.</p>'; return; }
            let html = '<table class="table table-sm table-hover"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead><tbody>';
            filtered.forEach(c => {
                const crm = c.crm || {};
                const crmBadges = [crm.tags, crm.followUpDate ? 'Follow up: ' + crm.followUpDate : '', crm.notes ? 'Notes' : '']
                    .filter(Boolean)
                    .slice(0, 3)
                    .map(label => '<span class="badge text-bg-light border me-1">' + escapeHtml(label) + '</span>')
                    .join('');
                const escapedName = escapeHtml(c.name);
                const propertyCount = getClientProperties(c).length;
                const propertyBadge = propertyCount > 1 ? '<span class="badge text-bg-light border ms-1">' + propertyCount + ' properties</span>' : '';
                const addressCell = c.address ? escapeHtml(c.address) + propertyBadge : '<span class="text-muted">-</span>';
                html += `<tr>
                    <td><strong>${escapeHtml(c.name)}</strong>${crmBadges ? '<div class="mt-1">' + crmBadges + '</div>' : ''}</td>
                    <td>${c.phone ? escapeHtml(c.phone) : '<span class="text-muted">-</span>'}</td>
                    <td>${c.email ? escapeHtml(c.email) : '<span class="text-muted">-</span>'}</td>
                    <td>${addressCell}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary client-edit-btn" data-name="${escapedName}" title="Edit"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger client-delete-btn" data-name="${escapedName}" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
            // Attach event listeners safely (avoids inline onclick issues with special chars in names)
            container.querySelectorAll('.client-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => editClientInModal(btn.dataset.name));
            });
            container.querySelectorAll('.client-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteClient(btn.dataset.name));
            });
        }

        loadSavedClients();
        // ── End Client Database ───────────────────────────────────────────────────

        window.clientDatabase = clientDatabase;
        window.LEGACY_CLIENTS = LEGACY_CLIENTS;
        window.fuzzyMatch = fuzzyMatch;
        window.searchClients = searchClients;
        window.showClientSuggestions = showClientSuggestions;
        window.hideClientDropdown = hideClientDropdown;
        window.loadSavedClients = loadSavedClients;
        window.persistClients = persistClients;
        window.getAllClients = getAllClients;
        window.normalizeClientRecord = normalizeClientRecord;
        window.normalizeClientProperty = normalizeClientProperty;
        window.getClientProperties = getClientProperties;
        window.upsertClientProperty = upsertClientProperty;
        window.fillClientInfo = fillClientInfo;
        window.saveCurrentClient = saveCurrentClient;
        window.openManageClientsModal = openManageClientsModal;
        window.clearClientForm = clearClientForm;
        window.editClientInModal = editClientInModal;
        window.saveClientFromModal = saveClientFromModal;
        window.deleteClient = deleteClient;
        window.renderClientsList = renderClientsList;})();
