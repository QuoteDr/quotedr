/* Dashboard presentation only. Move existing controls; preserve permissions and handlers. */
(function () {
    'use strict';
    var userId = null, selectionMode = false;
    var themes = {light: 'QDR Light', command: 'Command Center', graphite: 'Graphite', soft: 'Soft Blue', system: 'Follow system'};
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var selectedTheme = 'light';
    var organization = {mode: 'recent', order: [], opened: {}}, expandedClients = new Set();
    function saveOrganization() {
        try { if (userId) localStorage.setItem('quotedr.dashboard.organization.' + userId, JSON.stringify(organization)); }
        catch (_) { return false; }
        return true;
    }
    function clientKey(name) { return name.trim().toLowerCase().replace(/\s+/g, ' '); }
    function organizeCards() {
        var list = document.getElementById('quotesList');
        if (!list) return;
        var cards = Array.from(list.querySelectorAll('.qd-compact-card'));
        if (!cards.length) return;
        cards.sort(function (a,b) { return Number(a.dataset.recentIndex) - Number(b.dataset.recentIndex); });
        list.querySelectorAll('.qd-client-group').forEach(function (group) { group.remove(); });
        if (organization.mode === 'recent') { cards.forEach(function (card) { list.append(card); }); return; }
        var groups = new Map();
        cards.forEach(function (card) {
            var name = card.dataset.clientName || 'Unnamed Client', key = clientKey(name);
            if (!groups.has(key)) groups.set(key, {key:key, name:name, cards:[]});
            groups.get(key).cards.push(card);
        });
        Array.from(groups.values()).sort(function (a,b) {
            var ai = organization.order.indexOf(a.key), bi = organization.order.indexOf(b.key);
            return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.name.localeCompare(b.name);
        }).forEach(function (group) {
            var wrapper = element('details', 'qd-client-group');
            wrapper.dataset.clientKey = group.key;
            wrapper.open = organization.mode === 'clients' || expandedClients.has(group.key) || selectionMode;
            wrapper.append(element('summary', '', group.name + ' · ' + group.cards.length + (group.cards.length === 1 ? ' file' : ' files')));
            wrapper.addEventListener('toggle', function () {
                if (!wrapper.isConnected) return;
                if (wrapper.open) expandedClients.add(group.key); else expandedClients.delete(group.key);
            });
            var body = element('div', 'qd-client-files');
            group.cards.sort(function (a,b) {
                var aid = a.querySelector('[data-quote-select]').dataset.quoteSelect, bid = b.querySelector('[data-quote-select]').dataset.quoteSelect;
                return (organization.opened[bid] || 0) - (organization.opened[aid] || 0) || Number(a.dataset.recentIndex) - Number(b.dataset.recentIndex);
            }).forEach(function (card) { body.append(card); });
            wrapper.append(body); list.append(wrapper);
        });
    }
    function organizeDialog() {
        var dialog = element('dialog', 'qd-appearance');
        dialog.setAttribute('aria-label', 'Organize by');
        var draftMode = organization.mode, draftOrder = organization.order.slice();
        var head = element('div', 'qd-dialog-head');
        head.append(element('h3', '', 'Organize by…'), button('Cancel', function () { dialog.close(); }));
        dialog.append(head);
        var choices = element('div', 'd-flex gap-2 flex-wrap mb-3');
        [['recent','Recent (default)'],['clients','By Client'],['compressed','Compressed by Client']].forEach(function (entry) {
            var choice = button(entry[1], function () {
                draftMode = entry[0];
                choices.querySelectorAll('button').forEach(function (node) { node.setAttribute('aria-pressed', String(node === choice)); });
            });
            choice.setAttribute('aria-pressed', String(draftMode === entry[0])); choices.append(choice);
        });
        dialog.append(choices, element('p','text-muted','Client groups start alphabetically. Drag to reorder, or use the arrow buttons. Files inside each group use your recent opens, then the existing dashboard order. Saved for this account on this browser.'));
        var names = new Map();
        if (typeof window.getClientFileGroups === 'function') window.getClientFileGroups().forEach(function(group){ names.set(clientKey(group.name),group.name); });
        document.querySelectorAll('#quotesList .qd-compact-card').forEach(function (card) { var name=card.dataset.clientName || 'Unnamed Client'; names.set(clientKey(name),name); });
        var keys = Array.from(names.keys()).sort(function(a,b) { return names.get(a).localeCompare(names.get(b)); });
        keys.sort(function(a,b) { var ai=draftOrder.indexOf(a),bi=draftOrder.indexOf(b); return (ai<0?Infinity:ai)-(bi<0?Infinity:bi) || 0; });
        var rows = element('div','qd-client-reorder');
        function draw() {
            rows.replaceChildren();
            keys.forEach(function(key,index) {
                var row=element('div','qd-client-order-row'); row.dataset.clientKey=key;
                var handle=element('span','qd-client-drag-handle','☰'); handle.setAttribute('aria-hidden','true');
                row.append(handle,element('span','',names.get(key)));
                [-1,1].forEach(function(delta){
                    var move=button(delta<0?'↑':'↓',function(){ var next=index+delta; [keys[index],keys[next]]=[keys[next],keys[index]]; draw(); rows.children[next].querySelector(delta<0?'button':'button:last-child').focus(); });
                    move.setAttribute('aria-label',(delta<0?'Move up ':'Move down ')+names.get(key)); move.disabled=index+delta<0 || index+delta>=keys.length; row.append(move);
                });
                rows.append(row);
            });
        }
        draw(); dialog.append(rows);
        var alphabetical=false, reordered=false;
        var sortable = window.Sortable ? window.Sortable.create(rows, {
            handle: '.qd-client-drag-handle',
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
            ghostClass: 'sortable-ghost',
            scroll: dialog,
            bubbleScroll: false,
            scrollSensitivity: 70,
            scrollSpeed: 12,
            onEnd: function () {
                keys=Array.from(rows.children).map(function(row){return row.dataset.clientKey;});
                alphabetical=false; reordered=true; draw();
            }
        }) : null;
        dialog.append(button('Reset alphabetical',function(){ alphabetical=true; keys.sort(function(a,b){return names.get(a).localeCompare(names.get(b));}); draw(); }));
        rows.addEventListener('click',function(){alphabetical=false;reordered=true;}); rows.addEventListener('drop',function(){alphabetical=false;reordered=true;});
        var status=element('p','small text-muted'); status.setAttribute('role','status');
        dialog.append(button('Apply organization',function(){
            organization.mode=draftMode;
            organization.order=alphabetical ? [] : reordered ? keys.concat(draftOrder.filter(function(key){return !names.has(key);})) : draftOrder;
            expandedClients.clear(); organizeCards();
            if (!saveOrganization()) {status.textContent='Applied for this visit, but browser storage is unavailable.'; return;}
            dialog.close();
        },'btn btn-primary'),status);
        dialog.addEventListener('close',function(){if(sortable) sortable.destroy();dialog.remove();},{once:true}); document.body.append(dialog); dialog.showModal();
    }
    function element(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text) node.textContent = text;
        return node;
    }
    function button(text, action, cls) {
        var node = element('button', cls || 'btn btn-sm btn-outline-secondary', text);
        node.type = 'button'; node.addEventListener('click', action); return node;
    }
    function disclosure(label, cls) {
        var node = element('details', cls);
        node.append(element('summary', 'btn btn-sm btn-outline-secondary', label));
        node.addEventListener('click', function (event) { event.stopPropagation(); });
        node.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { node.open = false; node.firstElementChild.focus(); event.stopPropagation(); }
        });
        return node;
    }
    function applyTheme(value) {
        selectedTheme = Object.hasOwn(themes, value) ? value : 'light';
        var resolved = selectedTheme === 'system' ? (media.matches ? 'command' : 'light') : selectedTheme;
        document.documentElement.dataset.qdrTheme = resolved;
        document.documentElement.dataset.bsTheme = ['command', 'graphite'].includes(resolved) ? 'dark' : 'light';
        document.querySelectorAll('[data-dashboard-theme]').forEach(function (node) {
            node.setAttribute('aria-pressed', String(node.dataset.dashboardTheme === selectedTheme));
        });
    }
    function setUser(id) {
        userId = id || null;
        var saved = 'light';
        try { saved = userId ? localStorage.getItem('quotedr.dashboard.appearance.' + userId) || 'light' : 'light'; } catch (_) {}
        applyTheme(saved);
        organization = {mode:'recent',order:[],opened:{}}; expandedClients.clear();
        try {
            var stored = JSON.parse(userId && localStorage.getItem('quotedr.dashboard.organization.' + userId) || 'null');
            if (stored && ['recent','clients','compressed'].includes(stored.mode)) organization = {mode:stored.mode, order:Array.isArray(stored.order)?stored.order.filter(function(x){return typeof x==='string';}):[], opened:stored.opened && typeof stored.opened==='object'?stored.opened:{}};
        } catch (_) {}
        organizeCards();
    }
    function chooseTheme(value) {
        applyTheme(value);
        var message = document.getElementById('dashboardAppearanceStatus');
        try {
            if (userId) localStorage.setItem('quotedr.dashboard.appearance.' + userId, selectedTheme);
            if (message) message.textContent = userId ? 'Saved for your account on this browser.' : 'Preview selected. Sign in to remember it on this browser.';
        } catch (_) { if (message) message.textContent = 'Applied for this visit. Browser storage is unavailable.'; }
    }
    media.addEventListener('change', function () { if (selectedTheme === 'system') applyTheme('system'); });
    function appearance() {
        var dialog = document.getElementById('dashboardAppearance');
        if (!dialog) {
            dialog = element('dialog', 'qd-appearance'); dialog.id = 'dashboardAppearance';
            dialog.setAttribute('aria-labelledby', 'dashboardAppearanceTitle');
            var head = element('div', 'qd-dialog-head');
            var title = element('h3', '', 'Dashboard appearance'); title.id = 'dashboardAppearanceTitle';
            head.append(title, button('Close', function () { dialog.close(); }));
            dialog.append(head, element('p', 'text-muted', 'Choose how your dashboard looks. Client documents keep their existing design.'));
            var grid = element('div', 'qd-theme-grid');
            Object.entries(themes).forEach(function (entry) {
                var choice = button(entry[1], function () { chooseTheme(entry[0]); }, 'qd-theme-choice');
                choice.dataset.dashboardTheme = entry[0];
                var swatch = element('span', 'qd-swatch qd-swatch-' + entry[0]); swatch.setAttribute('aria-hidden', 'true');
                choice.prepend(swatch); grid.append(choice);
            });
            var status = element('p', 'small text-muted mt-3 mb-0', 'Saved per account on this browser.');
            status.id = 'dashboardAppearanceStatus'; status.setAttribute('role', 'status');
            dialog.append(grid, status); document.body.append(dialog);
        }
        applyTheme(selectedTheme); dialog.showModal();
    }
    function syncSelection(count) {
        var bar = document.getElementById('quoteBulkBar');
        if (bar) bar.hidden = !selectionMode && !count;
        var toggle = document.getElementById('dashboardSelectMode');
        if (toggle) { toggle.textContent = selectionMode ? 'Done selecting' : 'Select'; toggle.setAttribute('aria-pressed', String(selectionMode)); }
    }
    async function activity(quoteId, title, onClose) {
        var dialog = element('dialog', 'qd-appearance');
        dialog.setAttribute('aria-label', 'Activity for ' + title);
        var head = element('div', 'qd-dialog-head');
        head.append(element('h3', '', 'Activity'), button('Close', function () { dialog.close(); }));
        var panel = element('div', '', 'Loading activity…');
        panel.setAttribute('aria-live', 'polite');
        dialog.append(head, element('p', 'text-muted', title), panel);
        dialog.addEventListener('close', function () { dialog.remove(); if (typeof onClose === 'function') onClose(); }, {once: true});
        document.body.append(dialog); dialog.showModal();
        try {
            var result = await window.loadSecureClientDocumentActivity(quoteId);
            if (!dialog.isConnected) return;
            if (result && result.error) throw new Error('Activity unavailable');
            window.renderPortalShareActivity(result && result.data || [], panel);
        } catch (_) {
            if (dialog.isConnected) panel.textContent = 'Could not load activity. Close this window and try again.';
        }
    }
    function compactCards(container) {
        Array.from(container.querySelectorAll('.quote-card')).forEach(function(card,index){if (!card.classList.contains('qd-compact-card')) card.dataset.recentIndex=index;});
        container.querySelectorAll('.quote-card:not(.qd-compact-card)').forEach(function (card) {
            var header = card.firstElementChild;
            if (!header || !card.querySelector('.quote-card-open-area')) return;
            var blocks = Array.from(card.children).slice(1);
            var actions = blocks.filter(function (node) { return node.matches('button, a'); });
            var notices = blocks.filter(function (node) { return !node.matches('button, a'); });
            card.classList.add('qd-compact-card'); header.classList.add('qd-quote-header');
            var meta = card.querySelector('.portal-added-meta');
            if (meta) {
                card.classList.add('qd-in-portal');
                var portal = element('span', 'qd-portal-chip', '🔒 In portal');
                portal.title = meta.textContent.trim();
                card.querySelector('.quote-card-open-area').append(portal);
                notices.unshift(meta);
            }
            var titleButton = card.querySelector('button[onclick*="startEditTitle"]');
            if (titleButton) {
                titleButton.className = 'btn btn-sm btn-outline-secondary'; titleButton.removeAttribute('style');
                titleButton.textContent = 'Rename document'; actions.unshift(titleButton);
            }
            var remove = card.querySelector('button[onclick*="deleteQuote"]');
            if (remove) { remove.textContent = 'Move to Junk'; actions.push(remove); }
            // Open is keyboard accessible and uses the same guarded route as clicking the title.
            var input = card.querySelector('[data-quote-select]');
            card.addEventListener('click', function(event) {
                var target = event.target.closest('button');
                if (input && ((target && target.textContent === 'Open') || (!event.target.closest('button,a,input,select,label,summary,details') && event.target.closest('.quote-card-open-area')))) {
                    organization.opened[input.dataset.quoteSelect]=Date.now(); saveOrganization();
                }
            }, true);
            if (input) {
                var selectionLabel = input.closest('label');
                var oldSelectionRow = selectionLabel.parentElement;
                selectionLabel.classList.add('qd-card-select'); header.prepend(selectionLabel);
                if (!oldSelectionRow.children.length) oldSelectionRow.remove();
            }
            var open = button('Open', function () { window.openQuote(input.dataset.quoteSelect); }, 'btn btn-sm btn-outline-primary');
            var review = actions.find(function (node) { return (node.getAttribute('onclick') || '').includes('openNotesReview('); });
            var primary = review || actions.find(function (node) { return (node.getAttribute('onclick') || '').includes('shareDocumentThroughPortal('); }) || open;
            if (primary !== open) actions.unshift(open);
            var profitIndex = actions.findIndex(function (node) { return (node.getAttribute('onclick') || '').includes('openQuoteProfitReport('); });
            if (profitIndex !== -1 && input) {
                actions.splice(profitIndex, 0, button('Activity', function () {
                    activity(input.dataset.quoteSelect, card.querySelector('[id^="title-display-"]')?.textContent.trim() || 'Document');
                }, 'btn btn-sm btn-outline-primary'));
            }
            var row = element('div', 'qd-card-actions');
            primary.classList.remove('w-100', 'mt-1', 'mt-2'); row.append(primary);
            var menu = disclosure('•••', 'qd-card-menu');
            menu.firstElementChild.setAttribute('aria-label', 'More actions for ' + (card.querySelector('[id^="title-display-"]')?.textContent || 'document'));
            var menuBody = element('div', 'qd-menu-body');
            actions.filter(function (node) { return node !== primary; }).forEach(function (node) {
                node.classList.remove('w-100', 'mt-1', 'mt-2');
                node.addEventListener('click', function () { menu.open = false; }); menuBody.append(node);
            });
            menu.append(menuBody); row.append(menu); header.append(row);
            if (notices.length) {
                var attention = notices.filter(function (node) { return node.matches('.alert-warning, .alert-danger, .alert-info'); });
                var label = attention.map(function (node) {
                    var strong = node.querySelector('strong');
                    var text = strong ? strong.textContent.trim() : (node.textContent.includes("haven't asked") ? 'Review request reminder' : 'Needs attention');
                    if (node.querySelector('[onclick*="reviewDashboardDepositDecision"]')) text += ' — review deposit decision';
                    return text;
                }).join(' · ');
                var information = notices.filter(function (node) { return node.matches('.alert-success'); }).map(function (node) { return node.querySelector('strong')?.textContent.trim() || ''; }).filter(Boolean).join(' · ');
                var details = disclosure(label || information || 'Details & activity', 'qd-card-details' + (attention.length ? ' qd-needs-attention' : ''));
                if (label || information) details.firstElementChild.append(element('span', 'qd-detail-hint', ' · Details'));
                var detailBody = element('div', 'qd-details-body');
                notices.forEach(function (node) { detailBody.append(node); });
                details.append(detailBody); card.append(details);
            }
        });
        organizeCards();
    }
    function mount() {
        var list = document.getElementById('quotesList');
        if (!list) return;
        document.body.classList.add('qd-dashboard-compact');
        var metric = document.getElementById('totalQuotesCount');
        if (metric) metric.closest('.row').classList.add('qd-stat-strip');
        var panel = list.closest('.card'); panel.classList.add('qd-quotes-panel');
        var header = panel.querySelector('.card-header');
        var oldControls = header.querySelector('.d-flex.gap-2.flex-wrap');
        var tools = disclosure('Options', 'qd-dashboard-options');
        var body = element('div', 'qd-menu-body');
        var backup = disclosure('Backup & export', 'qd-backup-options');
        var backupBody = element('div', 'qd-backup-body');
        var newQuote = oldControls.querySelector('[onclick="openNewQuoteModal()"]');
        var refresh = header.querySelector('[onclick="refreshQuotes()"]');
        refresh.setAttribute('aria-label', 'Refresh quotes');
        Array.from(oldControls.children).forEach(function (node) {
            var handler = node.getAttribute('onclick') || '';
            if (node === newQuote) return;
            if (node.matches('[data-folder-backups], #exportAllQuotesBtn') || handler.includes('Restore a QuoteDr') || handler.includes('To restore a QuoteDr')) backupBody.append(node);
            else if (handler === 'refreshQuotes()') node.remove();
            else body.append(node);
        });
        backup.append(backupBody); body.prepend(backup);
        var defaultButton = document.getElementById('dashboardDefaultViewBtn');
        if (defaultButton) body.append(defaultButton);
        var defaultLabel = document.getElementById('dashboardDefaultViewLabel');
        if (defaultLabel) body.append(defaultLabel);
        body.append(button('Appearance', function () { tools.open = false; appearance(); }));
        body.append(button('Organize by…', function () { tools.open = false; organizeDialog(); }));
        tools.append(body);
        var controlRow = element('div', 'qd-toolbar-actions');
        controlRow.append(newQuote, refresh, tools); oldControls.remove(); header.append(controlRow);
        var statusRow = element('div', 'qd-backup-status-row');
        var existingStatus = backupBody.querySelector('[data-folder-backup-status]');
        var backupStatus = element('span', 'small text-muted', existingStatus ? existingStatus.textContent : 'Optional folder backups — use Manage backup to connect.');
        backupStatus.setAttribute('data-folder-backup-status', ''); backupStatus.setAttribute('role', 'status');
        statusRow.append(backupStatus, button('Manage backup', function () { tools.open = true; backup.open = true; backup.firstElementChild.focus(); }));
        header.after(statusRow);
        var select = button('Select', function () {
            selectionMode = !selectionMode;
            if (!selectionMode && typeof window.clearDashboardQuoteSelection === 'function') window.clearDashboardQuoteSelection();
            syncSelection(document.querySelectorAll('[data-quote-select]:checked').length);
            if (selectionMode) document.querySelectorAll('.qd-client-group').forEach(function(group){group.open=true;});
        });
        select.id = 'dashboardSelectMode'; document.getElementById('viewToggle').parentElement.append(select);
        syncSelection(0); compactCards(list);
        document.addEventListener('click', function (event) {
            document.querySelectorAll('.qd-card-menu[open], .qd-dashboard-options[open]').forEach(function (menu) {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });
    }
    window.QuoteDrDashboardUI = {compactCards: compactCards, syncSelection: syncSelection, setUser: setUser, appearance: appearance, activity: activity};
    applyTheme('light');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
