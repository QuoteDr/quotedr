(function(global) {
    'use strict';
    var chain = Promise.resolve(), syncing = false, folderBusy = false, pending = 0;
    function status(message, failed) {
        document.querySelectorAll('[data-folder-backup-status]').forEach(function(el) {
            el.textContent = message;
            el.className = failed ? 'small text-danger' : 'small text-muted';
        });
    }
    function safeName(value) {
        return String(value || 'Unnamed').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70) || 'Unnamed';
    }
    async function owner() {
        var user = await global.getCurrentUser();
        if (!user || !user.id) throw new Error('Sign in to connect your private backup folder.');
        return user.id;
    }
    function config(id, value, remove) {
        return new Promise(function(resolve,reject) {
            var request = indexedDB.open('quotedr-folder-backups',1);
            request.onupgradeneeded = function(){request.result.createObjectStore('folders');};
            request.onerror = function(){reject(request.error);};
            request.onsuccess = function(){
                var db=request.result;
                var tx=db.transaction('folders',value !== undefined || remove ? 'readwrite':'readonly');
                var store=tx.objectStore('folders');
                var op=remove ? store.delete(id) : value !== undefined ? store.put(value,id) : store.get(id);
                tx.oncomplete=function(){db.close();resolve(op.result);};
                tx.onerror=tx.onabort=function(){db.close();reject(tx.error || new Error('Could not remember backup folder.'));};
            };
        });
    }
    async function digest(text) {
        var bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
        return Array.from(new Uint8Array(bytes),function(b){return b.toString(16).padStart(2,'0');}).join('');
    }
    function contentOf(q) {
        var data=JSON.parse(JSON.stringify(q));
        ['savedAt','_clientEditedAt','_editorInstanceId','_serverUpdatedAt','_saveMeta','_remoteUpdatePending','_backupReviewOnly'].forEach(function(key){delete data[key];});
        return data;
    }
    function canonical(value) {
        if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
        if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+canonical(value[k]);}).join(',')+'}';
        return JSON.stringify(value);
    }
    async function writeSnapshot(root, userId, quote) {
        if (!quote || !Array.isArray(quote.rooms)) throw new Error('No complete quote snapshot available.');
        var id=quote.supabaseId || quote._localBackupId;
        if (!id) throw new Error('Quote has no stable backup identity.');
        var content=contentOf(quote), hash=await digest(canonical(content));
        var dir=await root.getDirectoryHandle('QuoteDr Backups',{create:true});
        dir=await dir.getDirectoryHandle('account-'+safeName(userId),{create:true});
        dir=await dir.getDirectoryHandle('client-'+safeName(quote.clientName || 'Unnamed client')+'-'+safeName(quote.clientId || quote.clientNumber || 'unassigned'),{create:true});
        dir=await dir.getDirectoryHandle('quote-'+safeName(id),{create:true});
        var name='snapshot-'+hash+'.qdr';
        try {
            var existing=await dir.getFileHandle(name);
            var parsed=JSON.parse(await (await existing.getFile()).text());
            if (await digest(canonical(contentOf(parsed))) === hash) return 'unchanged';
            // Never replace a corrupt, incomplete, or user-modified previous backup.
            name='snapshot-'+hash+'-recovered-'+crypto.randomUUID()+'.qdr';
        } catch(error) {
            if (error.name !== 'NotFoundError') {
                if (error.name === 'SyntaxError') name='snapshot-'+hash+'-recovered-'+crypto.randomUUID()+'.qdr';
                else throw error;
            }
        }
        var file=await dir.getFileHandle(name,{create:true});
        var writable=await file.createWritable();
        try { await writable.write(JSON.stringify(quote,null,2)); await writable.close(); }
        catch(error){try{await writable.abort();}catch(_){}throw error;}
        var verified=JSON.parse(await (await file.getFile()).text());
        if (await digest(canonical(contentOf(verified))) !== hash) throw new Error('Backup read-back verification failed.');
        return 'saved';
    }
    function enqueue(work) {
        pending++;
        var next=chain.catch(function(){}).then(work).finally(function(){pending--;});
        chain=next;
        return next;
    }
    async function saveDraft(quote, expectedOwner) {
        // Freeze this revision before waiting behind another disk write.
        var snapshot=JSON.parse(JSON.stringify(quote));
        var capturedOwner;
        try { capturedOwner=expectedOwner || await owner(); }
        catch(error){status(error.message,true);return {state:'failed',error:error.message};}
        return enqueue(async function(){
            try {
                var id=await owner(), handle=await config(id);
                if(id !== capturedOwner) throw new Error('Account changed; folder backup stopped.');
                if (!handle) return {state:'not_configured'};
                if (await handle.queryPermission({mode:'readwrite'}) !== 'granted') throw new Error('Folder permission needed — click Connect Folder again.');
                var result=await writeSnapshot(handle,id,snapshot);
                status('Folder backup verified at '+new Date().toLocaleTimeString()+'. Earlier versions retained.');
                return {state:result};
            } catch(error) {
                status('Folder backup NOT confirmed: '+error.message,true);
                return {state:'failed',error:error.message};
            }
        });
    }
    async function syncAll() {
        if(syncing) return;
        syncing=true;
        try {
            var id=await owner();
            if(!await config(id)) return;
            var result=await global.listQuotesForBackup();
            if(result.error) throw new Error(result.error.message || result.error);
            var bundle=global.QuoteDrBackups.makeBundle(result.data);
            for(var doc of bundle.documents) {
                // Account switching must not put the previous account's data in a new folder.
                if(await owner() !== id) throw new Error('Account changed; folder sync stopped.');
                var saved=await saveDraft(doc.quote,id);
                if(saved.state==='failed') throw new Error(saved.error);
                if(saved.state==='not_configured') throw new Error('Folder disconnected; sync stopped.');
            }
            status('Dashboard folder backup checked: '+bundle.documents.length+' quotes. '+new Date().toLocaleTimeString());
        } catch(error){status('Folder backup NOT confirmed: '+error.message,true);}
        finally{syncing=false;}
    }
    async function connect() {
        if(folderBusy) return;
        if(!global.showDirectoryPicker) {await global.qdAlert('This browser does not support automatic folder backups. Use Export All Quotes or Save Locally to download a backup instead.');return;}
        folderBusy=true;
        try {
            // Call the picker immediately inside the click gesture.
            var handle=await global.showDirectoryPicker({id:'quotedr-backups',mode:'readwrite'});
            var id=await owner();
            if(!await global.qdConfirm('Enable private, unencrypted quote backups in '+handle.name+'? QuoteDr will keep changed versions under client folders and never delete old files. Backups run only while QuoteDr is open. They exclude linked media files. Keep this folder private and monitor free disk space. Clearing browser data requires reconnecting the folder, but does not delete its files.',{title:'Enable Folder Backups',okText:'Enable Backups'})) return;
            await config(id,handle);
            status('Folder connected. Preparing backup…');
            if(typeof global.collectQuoteData==='function' && global.quoteStorageNeedsCloudSave && typeof global.quoteStorageHasOpenDocument==='function' && global.quoteStorageHasOpenDocument()) await saveDraft(global.collectQuoteData());
            else await syncAll();
        } catch(error){if(error.name!=='AbortError')status('Could not connect backup folder: '+error.message,true);}
        finally{folderBusy=false;}
    }
    async function disconnect() {
        if(!await global.qdConfirm('Stop future folder backups on this browser? Existing files will not be deleted.',{title:'Disconnect Folder',okText:'Disconnect'}))return;
        await enqueue(async function(){await config(await owner(),undefined,true);status('Folder disconnected. Existing backups remain on disk.');});
    }
    function mount() {
        document.querySelectorAll('[data-folder-backups]').forEach(function(el){
            el.innerHTML='<button type="button" class="btn btn-sm btn-outline-primary" data-folder-connect>Connect Backup Folder</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-folder-sync>Back Up Now</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-folder-disconnect>Disconnect</button><div data-folder-backup-status class="small text-muted" role="status" aria-live="polite">Optional disk backups — changed versions retained, no automatic deletion. Requires folder permission.</div>';
            el.querySelector('[data-folder-connect]').onclick=connect;
            el.querySelector('[data-folder-sync]').onclick=async function(){try {
                if(!await config(await owner())){await global.qdAlert('Connect a backup folder first.');return;}
                if(typeof global.collectQuoteData==='function' && global.quoteStorageHasOpenDocument()) await saveDraft(global.collectQuoteData());else await syncAll();
            } catch(error){status(error.message,true);}};
            el.querySelector('[data-folder-disconnect]').onclick=function(){disconnect().catch(function(e){status(e.message,true);});};
        });
        setTimeout(async function(){
            try {
                var handle=await config(await owner());
                if(handle) {
                    if(await handle.queryPermission({mode:'readwrite'}) !== 'granted') status('Backup folder needs permission. Click Connect Backup Folder to reconnect; existing files are safe.',true);
                    else status('Backup folder connected: '+handle.name+'. New edits will be backed up while QuoteDr is open.');
                }
            } catch(error){status('Folder backup unavailable: '+error.message,true);}
        },1000);
        if(typeof global.collectQuoteData!=='function') {
            setTimeout(syncAll,5000);
            setInterval(function(){if(!document.hidden && navigator.onLine)syncAll();},60000);
        }
    }
    global.QuoteDrFolderBackups={saveDraft:saveDraft,syncAll:syncAll,connect:connect,writeSnapshot:writeSnapshot,contentOf:contentOf,safeName:safeName,isPending:function(){return pending>0;}};
    global.addEventListener('beforeunload',function(event){if(pending>0){event.preventDefault();event.returnValue='';}});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
