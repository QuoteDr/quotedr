const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const ctx={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},crypto:webcrypto,TextEncoder,Uint8Array,SyntaxError};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('quote-folder-backups.js','utf8'),ctx);
const api=ctx.window.QuoteDrFolderBackups;
let writes=0,failClose=false,corruptRead=false;
function directory(){const children=new Map();return {children,async getDirectoryHandle(name){assert(!/[\\/]/.test(name));if(!children.has(name))children.set(name,directory());return children.get(name);},async getFileHandle(name,options){
 if(!children.has(name)){if(!options?.create)throw Object.assign(Error('missing'),{name:'NotFoundError'});children.set(name,{text:''});}
 const node=children.get(name);return {getFile:async()=>({text:async()=>corruptRead?'{}':node.text}),createWritable:async()=>{
  let staged;return {write:async text=>{staged=text;writes++;},close:async()=>{if(failClose)throw Error('disk full');node.text=staged;},abort:async()=>{}};
 }};
}};}
const root=directory(),q={type:'quote',supabaseId:'id-1',clientName:'A/B:Client',clientId:'client-1',savedAt:'first',rooms:[{items:[{rate:123}]}]};
(async()=>{
 assert.equal(await api.writeSnapshot(root,'owner',q),'saved');assert.equal(writes,1);
 assert.equal(await api.writeSnapshot(root,'owner',{...q,savedAt:'later'}),'unchanged');assert.equal(writes,1);
 await api.writeSnapshot(root,'owner',{...q,rooms:[{items:[{rate:456}]}]});assert.equal(writes,2);
 const quoteDir=root.children.get('QuoteDr Backups').children.get('account-owner').children.get('client-A_B_Client-client-1').children.get('quote-id-1');
 assert.equal(quoteDir.children.size,2,'older versions retained');
 const first=[...quoteDir.children.values()][0];first.text='bad json';
 await api.writeSnapshot(root,'owner',q);assert.equal(first.text,'bad json','corrupt snapshot not overwritten');assert.equal(quoteDir.children.size,3);
 failClose=true;await assert.rejects(api.writeSnapshot(root,'owner',{...q,supabaseId:'other'}),/disk full/);failClose=false;
 corruptRead=true;await assert.rejects(api.writeSnapshot(root,'owner',{...q,supabaseId:'another'}),/verification failed/);
 await assert.rejects(api.writeSnapshot(root,'owner',{rooms:[]}),/identity/);
 console.log('Folder backup versioning, deduplication, corruption retention, disk failure and read-back checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
