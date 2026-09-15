const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('quote-tips.js','utf8');
function setup(path){
 const storage=new Map(),timers=[],events={};let modal=false;
 const doc={readyState:'complete',hidden:false,activeElement:null,querySelector:()=>modal?{}:null,getElementById:()=>null};
 const window={location:{pathname:path},addEventListener:(name,fn)=>events[name]=fn};
 const ctx={window,document:doc,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},console,Date};
 vm.runInNewContext(source,ctx);
 return {api:window.QuoteDrTips,doc,timers,events,setModal:value=>modal=value,storage};
}
(async()=>{
 for(const path of ['/quote-builder','/quote-builder.html','/dashboard','/settings.html']){
 const t=setup(path);await new Promise(setImmediate);assert.equal(t.timers[0].ms,6000,path);assert(t.events.hashchange);
 }
 const t=setup('/interactive-quote-viewer.html');await new Promise(setImmediate);assert.equal(t.timers.length,0);
 assert(t.api.shouldShowAutomaticTip({enabled:true,lastShownAt:0}));
 assert(!t.api.shouldShowAutomaticTip({enabled:false}));
 assert(!t.api.shouldShowAutomaticTip({lastShownAt:Date.now()}));
 t.doc.hidden=true;assert(!t.api.shouldShowAutomaticTip({}));t.doc.hidden=false;
 t.doc.activeElement={tagName:'TEXTAREA'};assert(!t.api.shouldShowAutomaticTip({}));t.doc.activeElement=null;
 t.setModal(true);assert(!t.api.shouldShowAutomaticTip({}));
 const catalog=t.api.getCatalog();assert.equal(new Set(catalog.map(t=>t.id)).size,catalog.length);
 assert(catalog.some(t=>t.id==='folder-backups'));assert(catalog.some(t=>t.id==='highlight-legend'));
 console.log('Tip routes, cooldown, opt-out, editing/modal suppression and catalogue checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
