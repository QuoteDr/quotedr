// Internal appendices stay in this browser tab; never add them to shared quote data.
(function(root) {
    'use strict';
    const prefix = 'qdr-internal-pdf:';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function choose() {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.style.cssText = 'width:min(520px,94vw);border:1px solid #ccd5df;border-radius:12px;padding:24px';
            dialog.innerHTML = '<form method="dialog"><h2>Export quote as PDF</h2><p>Who is this PDF for?</p><label><input type="radio" name="audience" value="client" checked> Client</label><br><label><input type="radio" name="audience" value="internal"> My records (internal)</label><p><label><input type="checkbox" id="pdfProfit" disabled> Include profit report</label></p><p class="small">Internal copies are marked NOT FOR CLIENT. Profit estimates exclude labour and overhead. PDFs are records, not editable recovery backups.</p><button value="cancel" class="btn btn-secondary">Cancel</button> <button value="export" class="btn btn-primary">Continue to PDF</button></form>';
            const profit = dialog.querySelector('#pdfProfit');
            dialog.addEventListener('change', () => {
                profit.disabled = dialog.querySelector('[name=audience]:checked').value !== 'internal';
                if (profit.disabled) profit.checked = false;
            });
            dialog.addEventListener('close', () => {
                const result = dialog.returnValue === 'export' ? {internal: dialog.querySelector('[name=audience]:checked').value === 'internal', profit: !profit.disabled && profit.checked} : null;
                dialog.remove(); resolve(result);
            }, {once:true});
            document.body.appendChild(dialog); dialog.showModal();
        });
    }
    function stage(data, url, includeProfit) {
        const now = Date.now();
        // Prune abandoned exports without touching any quote recovery storage.
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key.startsWith(prefix)) sessionStorage.removeItem(key);
        }
        const key = prefix + crypto.randomUUID();
        const quote = {data, total: data.grandTotal, quote_number: data.quoteNumber};
        const report = includeProfit ? root.QuoteDrProfitReport.calculate(quote) : null;
        const missing = report ? report.rooms.flatMap(r => r.lines).filter(l => l.included && !l.materials).length : 0;
        const name = data.fileName || data.quoteTitle || data.quoteNumber || 'Quote';
        const html = '<h1>Internal record</h1><p><strong>'+esc(name)+'</strong></p><p>Quote: '+esc(data.quoteNumber || 'Not assigned')+' · Status: '+esc(data.status || 'Draft')+' · Exported: '+esc(new Date(now).toLocaleString())+'</p><p>This is a snapshot, not an editable backup. Keep the JSON/folder backup for recovery.</p>' + (includeProfit ? '<h2>Profit report</h2><p>'+missing+' included line(s) have zero material estimates. Zero may be intentional or a missing cost. Confirm costs before relying on these figures.</p>'+root.QuoteDrProfitReport.html(quote) : '');
        sessionStorage.setItem(key, JSON.stringify({createdAt:now, documentId:url.searchParams.get('id'), title:'INTERNAL - '+name, html}));
        url.searchParams.set('internal_export', key);
    }
    function consume(url) {
        const key = url.searchParams.get('internal_export');
        if (!key) return null;
        if (!key.startsWith(prefix)) throw new Error('Invalid internal export. Start again from the builder.');
        const raw = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        const payload = raw && JSON.parse(raw);
        if (!payload || url.searchParams.get('admin_preview') !== '1' || url.searchParams.get('print') !== '1' || !payload.documentId || payload.documentId !== url.searchParams.get('id') || Date.now() - payload.createdAt > 300000 || payload.createdAt > Date.now()) throw new Error('Internal export expired or unavailable. Start again from the builder.');
        return payload;
    }
    function mount(payload) {
        document.title = payload.title;
        const label = document.createElement('div');
        label.className = 'qdr-internal-label'; label.textContent = 'INTERNAL — NOT FOR CLIENT';
        const appendix = document.createElement('section');
        appendix.className = 'qdr-internal-appendix'; appendix.innerHTML = payload.html;
        const style = document.createElement('style');
        style.textContent = '.qdr-internal-label{background:white;color:#9b1c1c;font-weight:bold;text-align:center;padding:8px}.qdr-internal-appendix{background:white;color:#182536;max-width:1100px;margin:24px auto;padding:24px;overflow-wrap:anywhere}.qdr-internal-appendix article{break-inside:avoid}@media print{@page{margin:20mm 12mm}.qdr-internal-label{position:fixed;top:-15mm;left:0;right:0;font-size:10pt}.qdr-internal-appendix{break-before:page;margin:0;padding:0}}';
        document.head.appendChild(style); document.body.prepend(label); document.body.appendChild(appendix);
    }
    root.QuoteDrPdfExport = {choose, stage, consume, mount};
})(typeof window !== 'undefined' ? window : globalThis);
