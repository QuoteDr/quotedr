(function(root) {
    'use strict';
    const marks = [['Bold', '**', 'strong'], ['Italic', '*', 'em'], ['Underline', '__', 'u'], ['Highlight', '==', 'mark']];
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function render(value, depth = 0) {
        const text = String(value ?? '');
        if (depth > 8) return escape(text);
        let out = '', pos = 0;
        while (pos < text.length) {
            const combinedEnd = text.startsWith('***', pos) ? text.indexOf('***', pos + 3) : -1;
            if (combinedEnd > pos + 3) {
                out += '<strong><em>' + render(text.slice(pos + 3, combinedEnd), depth + 1) + '</em></strong>';
                pos = combinedEnd + 3;
                continue;
            }
            const mark = marks.find(m => text.startsWith(m[1], pos));
            const end = mark ? text.indexOf(mark[1], pos + mark[1].length) : -1;
            if (mark && end > pos + mark[1].length) {
                out += '<' + mark[2] + '>' + render(text.slice(pos + mark[1].length, end), depth + 1) + '</' + mark[2] + '>';
                pos = end + mark[1].length;
            } else { out += escape(text[pos++]); }
        }
        return out;
    }
    function attach(field) {
        if (field.dataset.formattingReady) return;
        field.dataset.formattingReady = 'true';
        const bar = document.createElement('div');
        bar.className = 'd-flex gap-1 flex-wrap mt-2 mb-1';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Description formatting');
        const hint = document.createElement('small');
        hint.className = 'text-muted align-self-center';
        hint.textContent = 'Select text to format; save to keep changes.';
        const preview = document.createElement('div');
        preview.className = 'form-control mt-1';
        preview.style.whiteSpace = 'pre-wrap';
        preview.style.minHeight = Math.max(100, field.rows * 24) + 'px';
        preview.setAttribute('role', 'textbox');
        preview.setAttribute('aria-multiline', 'true');
        preview.setAttribute('aria-label', field.id === 'lineNotes' ? 'Job-specific note' : 'Item description');
        preview.spellcheck = true;
        let syncing = false;
        const update = () => {
            if (!syncing) preview.innerHTML = render(field.value);
            preview.contentEditable = String(!field.disabled && !field.readOnly);
        };
        // Existing save/autofill/AI Refine code continues using the textarea value.
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        Object.defineProperty(field, 'value', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); update(); } });
        const serialize = node => {
            if (node.nodeType === 3) return node.nodeValue;
            if (node.nodeType !== 1) return '';
            if (node.tagName === 'BR') return '\n';
            let text = Array.from(node.childNodes).map(serialize).join('');
            if (!text) return '';
            const style = node.style;
            if (node.matches('b,strong') || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) text = '**' + text + '**';
            if (node.matches('i,em') || style.fontStyle === 'italic') text = '*' + text + '*';
            if (node.matches('u') || style.textDecoration.includes('underline')) text = '__' + text + '__';
            if (node.matches('mark') || (style.backgroundColor && style.backgroundColor !== 'transparent')) text = '==' + text + '==';
            if (node.matches('div,p') && node.nextSibling) text += '\n';
            return text;
        };
        const save = () => {
            syncing = true;
            descriptor.set.call(field, Array.from(preview.childNodes).map(serialize).join(''));
            field.dispatchEvent(new Event('input', { bubbles: true }));
            syncing = false;
        };
        preview.addEventListener('input', save);
        preview.addEventListener('paste', e => {
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
            save();
        });
        preview.addEventListener('drop', e => e.preventDefault());
        field.addEventListener('qdr-format-refresh', update);
        marks.forEach(([label, token]) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn btn-sm btn-outline-secondary'; button.textContent = label;
            button.title = 'Select text, then apply or remove ' + label.toLowerCase();
            button.addEventListener('mousedown', e => e.preventDefault());
            button.addEventListener('click', () => {
                if (field.disabled || field.readOnly) return;
                const selection = window.getSelection();
                if (!selection.rangeCount || !preview.contains(selection.anchorNode) || !preview.contains(selection.focusNode)) { preview.focus(); return; }
                preview.focus();
                const command = {Bold:'bold', Italic:'italic', Underline:'underline', Highlight:'hiliteColor'}[label];
                document.execCommand('styleWithCSS', false, false);
                const anchor = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
                const highlighted = anchor.closest('mark,span[style*="background-color"]');
                if (label === 'Highlight' && highlighted && preview.contains(highlighted) && selection.toString() === highlighted.textContent) {
                    const range = document.createRange();
                    const replacement = document.createElement('span');
                    replacement.append(...highlighted.childNodes);
                    highlighted.replaceWith(replacement); range.selectNodeContents(replacement);
                    selection.removeAllRanges(); selection.addRange(range);
                } else document.execCommand(command, false, label === 'Highlight' ? '#ffff00' : null);
                save();
            });
            bar.append(button);
        });
        bar.append(hint);
        field.before(bar); field.after(preview);
        field.hidden = true;
        field.style.display = 'none';
        field.addEventListener('focus', () => preview.focus());
        field.addEventListener('input', update); field.addEventListener('focus', update);
        update();
    }
    root.QDRDescriptionFormat = { render };
    if (typeof document === 'undefined') return;
    const scan = () => document.querySelectorAll('textarea.item-description-textarea:not(.upgrade-desc)').forEach(attach);
    document.addEventListener('DOMContentLoaded', () => {
        scan();
        new MutationObserver(records => { if (records.some(r => Array.from(r.addedNodes).some(n => n.nodeType === 1 && (n.matches?.('textarea') || n.querySelector?.('textarea'))))) scan(); }).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('shown.bs.modal', () => document.querySelectorAll('textarea[data-formatting-ready]').forEach(f => f.dispatchEvent(new Event('qdr-format-refresh'))));
    });
})(typeof window === 'undefined' ? globalThis : window);
