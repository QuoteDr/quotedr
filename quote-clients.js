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
            // One-time migration: import legacy clients that aren't already saved
            let migrated = false;
            LEGACY_CLIENTS.forEach(name => {
                if (!savedClients[name]) {
                    savedClients[name] = { name, phone: '', email: '', address: '' };
                    migrated = true;
                }
            });
            if (migrated) localStorage.setItem('ald_clients', JSON.stringify(savedClients));
        }

        function persistClients() {
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
                merged[name] = { ...data, name };
            });
            return merged;
        }

        function fillClientInfo(clientName, clientData) {
            document.getElementById('clientName').value = clientName;
            if (clientData.phone)   document.getElementById('clientPhone').value = clientData.phone;
            if (clientData.email)   document.getElementById('clientEmail').value = clientData.email;
            if (clientData.address) document.getElementById('projectAddress').value = clientData.address;
        }

        function saveCurrentClient() {
            const name    = document.getElementById('clientName').value.trim();
            const phone   = document.getElementById('clientPhone').value.trim();
            const email   = document.getElementById('clientEmail').value.trim();
            const address = document.getElementById('projectAddress').value.trim();
            if (!name) { alert('Please enter a client name first.'); return; }
            savedClients[name] = { name, phone, email, address };
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
        }

        function editClientInModal(name) {
            const c = savedClients[name];
            if (!c) return;
            document.getElementById('newClientName').value    = c.name    || name;
            document.getElementById('newClientPhone').value   = c.phone   || '';
            document.getElementById('newClientEmail').value   = c.email   || '';
            document.getElementById('newClientAddress').value = c.address || '';
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
            savedClients[name] = { name, phone, email, address };
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
            const filtered = Object.values(all).filter(c => c.name.toLowerCase().includes(filter)).sort((a,b) => a.name.localeCompare(b.name));
            const container = document.getElementById('clientsList');
            if (!filtered.length) { container.innerHTML = '<p class="text-muted text-center py-3">No clients found.</p>'; return; }
            let html = '<table class="table table-sm table-hover"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead><tbody>';
            filtered.forEach(c => {
                const escapedName = c.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
                html += `<tr>
                    <td><strong>${c.name.replace(/&/g,'&amp;')}</strong></td>
                    <td>${c.phone || '<span class="text-muted">-</span>'}</td>
                    <td>${c.email || '<span class="text-muted">-</span>'}</td>
                    <td>${c.address || '<span class="text-muted">-</span>'}</td>
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
        window.fillClientInfo = fillClientInfo;
        window.saveCurrentClient = saveCurrentClient;
        window.openManageClientsModal = openManageClientsModal;
        window.clearClientForm = clearClientForm;
        window.editClientInModal = editClientInModal;
        window.saveClientFromModal = saveClientFromModal;
        window.deleteClient = deleteClient;
        window.renderClientsList = renderClientsList;})();
