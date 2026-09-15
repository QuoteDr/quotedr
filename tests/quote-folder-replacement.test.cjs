const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let stored={name:'Old folder'}, approve=false, fail=false, confirmation='';
const output={};
const indexedDB={open(){const request={};queueMicrotask(()=>{
 request.result={close(){},transaction(){const tx={};tx.objectStore=()=>({
 get(){const op={result:stored};queueMicrotask(()=>tx.oncomplete());return op;},
 put(value){const op={};queueMicrotask(()=>{if(fail){tx.error=Error('storage failed');tx.onerror();}else{stored=value;tx.oncomplete();}});return op;}
 });return tx;}};request.onsuccess();});return request;}};
const window={addEventListener(){},getCurrentUser:async()=>({id:'owner'}),
 showDirectoryPicker:async()=>({name:'New folder'}),qdConfirm:async message=>{confirmation=message;return approve;},
 listQuotesForBackup:async()=>({data:[]}),QuoteDrBackups:{makeBundle:()=>({documents:[]})}};
vm.runInNewContext(fs.readFileSync('quote-folder-backups.js','utf8'),{window,indexedDB,document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[output]}});
(async()=>{
 await window.QuoteDrFolderBackups.connect();assert.equal(stored.name,'Old folder');
 assert.match(confirmation,/Replace the current backup folder \(Old folder\) with New folder/);
 assert.match(confirmation,/not be moved or deleted/);
 approve=true;fail=true;await window.QuoteDrFolderBackups.connect();assert.equal(stored.name,'Old folder');
 fail=false;await window.QuoteDrFolderBackups.connect();assert.equal(stored.name,'New folder');
 console.log('Folder replacement, cancellation and failed-persistence checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
