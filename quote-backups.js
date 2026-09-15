(function(global) {
    'use strict';
    var busy = false;
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function supported(q) {
        return q && Array.isArray(q.rooms) && ['quote','change_order','revision'].includes(String(q.documentType || q.type || 'quote').toLowerCase());
    }
    function quoteFromRow(row) {
        if (!row || !row.id || !supported(row.data)) return null;
        var q = clone(row.data);
        q.supabaseId = row.id;
        q.quoteNumber = row.quote_number || q.quoteNumber || '';
        q._serverUpdatedAt = row.updated_at || null;
        q.savedAt = row.updated_at || q.savedAt;
        return q;
    }
    function makeBundle(rows, now) {
        var seen = new Set();
        var documents = [];
        var excluded = 0;
        (rows || []).forEach(function(row) {
            if (seen.has(row.id)) throw new Error('Duplicate document identity returned; backup cancelled.');
            seen.add(row.id);
            var q = quoteFromRow(row);
            if (!q || row.status === 'backup' || row.quote_number === '__ITEMS_BACKUP__') { excluded++; return; }
            documents.push({ id: row.id, client: q.clientName || row.client_name || 'Unnamed client', quote: q });
        });
        return { format:'quotedr-dashboard-backup-v1', exportedAt:now || new Date().toISOString(),
            manifest:{documentCount:documents.length,excludedRecords:excluded,scope:'Cloud-saved quotes, revisions and change orders only. Unsynced edits, invoices and standalone designs are not included. Media URLs are retained, but linked media files are not downloaded.',
                clients:Array.from(new Set(documents.map(function(d){return d.client;}))).sort()}, documents:documents };
    }
    function recoveryQuote(payload) {
        if (!supported(payload)) throw new Error('This retained payload is not a supported quote backup.');
        return clone(payload);
    }
    function candidates(data) {
        var quotes;
        if (data.format === 'quotedr-server-recovery-v1') quotes = [recoveryQuote(data.record && data.record.payload)];
        else if (data.format === 'quotedr-dashboard-backup-v1' && Array.isArray(data.documents)) {
            var ids = new Set();
            quotes = data.documents.map(function(d) {
                if (!d.id || ids.has(d.id)) throw new Error('Backup has missing or duplicate document identities.');
                ids.add(d.id);
                var q = recoveryQuote(d.quote);
                if (q.supabaseId !== d.id) throw new Error('Backup document identity does not match its manifest.');
                return q;
            });
        } else throw new Error('Unrecognised backup format.');
        return quotes.map(function(q) {return {quote:q,operation:{localSavedAt:q.savedAt || data.exportedAt || ''}};});
    }
    function download(data, name) {
        var url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
        var a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},1000);
    }
    async function exportAll() {
        if (busy) return;
        if (!await global.qdConfirm('Download cloud-saved quotes, revisions and change orders as a private JSON backup? This excludes unsynced edits, invoices, standalone designs and the actual files behind media links. Keep separate dated backups; downloads do not automatically replace older files.',{title:'Export All Quotes',okText:'Download Backup',cancelText:'Cancel'})) return;
        busy=true;
        var button=document.getElementById('exportAllQuotesBtn');
        if(button){button.disabled=true;button.textContent='Preparing backup…';}
        try {
            var result=await global.listQuotesForBackup();
            if(result.error) throw new Error(result.error.message || result.error);
            var bundle=makeBundle(result.data);
            if(!bundle.documents.length) throw new Error('No supported cloud-saved quotes were found.');
            download(bundle,'QuoteDr Quotes Backup - '+bundle.exportedAt.replace(/[:.]/g,'-')+'.json');
            await global.qdAlert('Backup download started: '+bundle.documents.length+' documents. Check your Downloads folder. To restore, open the bundle through File → Open → Open Local File in the builder, choose one quote, review it, then explicitly Save. Opening a backup does not overwrite your dashboard.');
        } catch(error){await global.qdAlert('Backup not completed: '+error.message);}
        finally{busy=false;if(button){button.disabled=false;button.textContent='Export All Quotes';}}
    }
    global.QuoteDrBackups={makeBundle:makeBundle,candidates:candidates,recoveryQuote:recoveryQuote,download:download,exportAll:exportAll};
})(typeof window !== 'undefined' ? window : globalThis);
