(function(global) {
    'use strict';
    let lastQuery = '';
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
        const results = dialog.querySelector('[data-results]');
        const count = dialog.querySelector('[data-count]');
        function close() { dialog.close(); dialog.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
        dialog.querySelector('[data-close]').onclick = close;
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        input.addEventListener('input', () => {
            lastQuery = input.value;
            results.replaceChildren();
            if (!input.value.trim()) { count.textContent = 'Type to search this quote. Nothing will be changed.'; return; }
            const matches = search(getRooms(), input.value);
            count.textContent = matches.length ? matches.length + ' matching line item' + (matches.length === 1 ? '' : 's') : 'No matching line items found. Try fewer words or another spelling.';
            matches.forEach(match => {
                const card = document.createElement('div');
                card.className = 'border rounded p-3 mb-2';
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
            });
        });
        document.body.appendChild(dialog); dialog.showModal(); input.focus();
        count.textContent = 'Type to search this quote. Nothing will be changed.';
        input.value = lastQuery;
        if (lastQuery) input.dispatchEvent(new Event('input'));
    }
    global.QuoteDrQuoteFind = {search, open};
})(window);
