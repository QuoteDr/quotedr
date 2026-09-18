(function(global) {
    'use strict';
    let lastQuery = '';
    let showValues = false;
    function valuesText(room, item) {
        const quantity = Number(item.quantity);
        const qty = item.quantity !== '' && item.quantity != null && Number.isFinite(quantity) ? quantity.toLocaleString(undefined, {maximumFractionDigits: 6}) : 'Not set';
        const unit = item.unitType || item.unit || '';
        const tbd = typeof global.isQuotePriceTbd === 'function' && global.isQuotePriceTbd(item);
        const money = value => typeof global.qdFormatMoney === 'function' ? global.qdFormatMoney(value) : Number(value).toFixed(2);
        const mark = value => global.quoteItemMarkedAmount(room, item, value);
        const amount = global._quoteDocumentType === 'change_order' ? global.coDisplayLineAmount(item) : global.itemChargedTotal(item);
        const rate = tbd ? 'Price TBD' : money(mark(global.qdDiscounts().activeRate(item)));
        const total = tbd ? 'Price TBD' : money(mark(amount));
        const excluded = typeof global.quoteOptionalItemIncludedByDefault === 'function' && !global.quoteOptionalItemIncludedByDefault(item);
        return 'Quantity: ' + qty + (unit ? ' ' + unit : '') + ' · Rate (before discounts): ' + rate + ' · Line total (before tax): ' + total + (excluded ? ' · Not included in quote total' : '');
    }
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function search(rooms, query) {
        const words = normalize(query).trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const results = [];
        (rooms || []).forEach(room => {
            (room.items || []).forEach((item, index) => {
                const title = item.description || item.serviceName || item.name || 'Unnamed item';
                const scope = [...new Set([item.itemDescription, item.displayDescription, item.notes].filter(text => text && text !== title))].join('\n');
                const text = normalize([room.name, item.category, title, scope].join(' '));
                if (words.every(word => text.includes(word))) results.push({roomId:room.id, roomName:room.name || 'Room', index, title, category:item.category || '', scope});
            });
        });
        return results;
    }
    function open(getRooms) {
        const existing = document.getElementById('quoteFindDialog');
        if (existing) { existing.querySelector('input').focus(); return; }
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.id = 'quoteFindDialog';
        dialog.setAttribute('aria-labelledby', 'quoteFindTitle');
        dialog.style.cssText = 'width:min(840px,calc(100% - 24px));max-height:90dvh;border:1px solid #ccd6e0;border-radius:12px;padding:20px;color:#183047;';
        dialog.innerHTML = '<div class="d-flex justify-content-between gap-2"><h4 id="quoteFindTitle">Find in Quote</h4><button type="button" class="btn btn-outline-secondary" data-close>Close</button></div><label for="quoteFindInput">Search item names, categories, descriptions and job notes</label><input id="quoteFindInput" type="search" class="form-control my-2" placeholder="For example: basement pot lights" autocomplete="off"><p class="small text-muted">All search words must match. Includes collapsed descriptions. Ctrl+F (Cmd+F on Mac) opens your browser’s Find for visible page text.</p><p data-count role="status" aria-live="polite"></p><div data-results style="max-height:55dvh;overflow:auto"></div>';
        const input = dialog.querySelector('input');
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'form-check form-switch mb-3';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox'; toggle.className = 'form-check-input'; toggle.checked = showValues;
        toggleLabel.append(toggle, document.createTextNode('Show Values'));
        input.after(toggleLabel);
        const results = dialog.querySelector('[data-results]');
        const count = dialog.querySelector('[data-count]');
        const selected = new Set();
        const actions = document.createElement('div');
        actions.className = 'd-flex gap-2 mb-2 align-items-center';
        actions.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-all>Select all results</button><button type="button" class="btn btn-outline-secondary" data-clear>Clear selection</button><button type="button" class="btn btn-danger" data-delete disabled>Delete selected</button>';
        count.before(actions);
        const deleteButton = actions.querySelector('[data-delete]');
        const updateSelection = () => { deleteButton.disabled = !selected.size; deleteButton.textContent = 'Delete selected (' + selected.size + ')'; };
        actions.querySelector('[data-clear]').onclick = () => { selected.clear(); render(); };
        actions.querySelector('[data-all]').onclick = () => {
            search(getRooms(), input.value).forEach(match => selected.add(getRooms().find(room => room.id === match.roomId).items[match.index]));
            render();
        };
        deleteButton.onclick = () => {
            const entries = [];
            getRooms().forEach(room => room.items.forEach(item => { if (selected.has(item)) entries.push({room, item}); }));
            if (!entries.length) return;
            const names = entries.map(entry => entry.room.name + ' · ' + (entry.item.description || entry.item.name || 'Unnamed item'));
            if (!global.confirm('Delete these ' + entries.length + ' line items from this quote? Rooms and saved database items are kept.\n\n' + names.join('\n') + '\n\nYou can undo immediately with Ctrl+Z or the room Undo button.')) return;
            if (global.deleteQuoteFindItems(entries)) { selected.clear(); render(); }
            else { selected.clear(); render(); count.textContent = 'Nothing deleted. The quote is locked, busy, or these items changed. Close and review the quote before trying again.'; }
        };
        function close() { dialog.close(); dialog.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
        dialog.querySelector('[data-close]').onclick = close;
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        const render = () => {
            updateSelection();
            lastQuery = input.value;
            results.replaceChildren();
            if (!input.value.trim()) { count.textContent = 'Type to search this quote. Nothing will be changed.'; return; }
            const matches = search(getRooms(), input.value);
            count.textContent = matches.length ? matches.length + ' matching line item' + (matches.length === 1 ? '' : 's') : 'No matching line items found. Try fewer words or another spelling.';
            matches.forEach(match => {
                const card = document.createElement('div');
                card.className = 'border rounded p-3 mb-2';
                const item = getRooms().find(room => room.id === match.roomId).items[match.index];
                const select = document.createElement('input');
                select.type = 'checkbox'; select.className = 'form-check-input me-2';
                select.setAttribute('aria-label', 'Select ' + match.roomName + ' · ' + match.title);
                select.checked = selected.has(item);
                select.onchange = () => { if (select.checked) selected.add(item); else selected.delete(item); updateSelection(); };
                card.append(select);
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'btn btn-link p-0 text-start fw-bold';
                button.textContent = match.roomName + ' · ' + match.title;
                button.onclick = () => {
                    close();
                    const checkbox = Array.from(document.querySelectorAll('.choice-group-select[data-item-index]')).find(el => el.dataset.roomId === String(match.roomId) && el.dataset.itemIndex === String(match.index));
                    const target = checkbox && checkbox.closest('tr');
                    if (target) {
                        target.scrollIntoView({block:'center', behavior:'smooth'});
                        target.classList.add('room-jump-highlight');
                        target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});
                        global.setTimeout(() => { target.classList.remove('room-jump-highlight'); target.removeAttribute('tabindex'); }, 2500);
                    } else if (typeof global.jumpToQuoteBuilderRoomById === 'function') global.jumpToQuoteBuilderRoomById(match.roomId);
                };
                const scope = document.createElement('p'); scope.className = 'small mb-0 mt-2'; scope.style.whiteSpace = 'pre-wrap';
                scope.textContent = [match.category, match.scope].filter(Boolean).join('\n');
                card.append(button, scope); results.appendChild(card);
                if (showValues) {
                    const room = getRooms().find(room => room.id === match.roomId);
                    const item = room && room.items[match.index];
                    if (item) {
                        const values = document.createElement('p');
                        values.className = 'small fw-bold mt-2 mb-0';
                        values.textContent = valuesText(room, item);
                        card.appendChild(values);
                    }
                }
            });
        };
        input.addEventListener('input', () => { selected.clear(); render(); });
        toggle.addEventListener('change', () => { showValues = toggle.checked; const top = results.scrollTop; render(); results.scrollTop = top; });
        document.body.appendChild(dialog); dialog.showModal(); input.focus();
        count.textContent = 'Type to search this quote. Nothing will be changed.';
        input.value = lastQuery;
        if (lastQuery) input.dispatchEvent(new Event('input'));
    }
    global.QuoteDrQuoteFind = {search, open, valuesText};
})(window);
