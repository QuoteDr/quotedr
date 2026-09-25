const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.listeners={};this.value='';this.textContent='';this.disabled=false;this.classList={add:()=>{},remove:()=>{}};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);if(this.tag==='select'&&this.children.length===1)this.value=n.value;}}
  prepend(n){n.parent=this;this.children.unshift(n);}
  replaceChildren(...nodes){this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes);}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  showModal(){}
  close(){for(const fn of this.listeners.close||[])fn();}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  get isConnected(){return this.tag==='body'||!!this.parent?.isConnected;}
  querySelector(q){return q==='header button'?this.children.find(n=>n.tag==='header')?.children.find(n=>n.tag==='button'):null;}
  async click(){assert(!this.disabled,'Cannot click disabled '+this.textContent);await this.onclick?.();for(const fn of this.listeners.click||[])fn();await new Promise(r=>setImmediate(r));}
}
const body=new Element('body');
const document={body,createElement:tag=>new Element(tag)};
const source=fs.readFileSync('portal-designs.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'').replace('import.meta.url',JSON.stringify('https://local.test/portal-designs.js'));
const context=vm.createContext({document,window:{confirm:()=>true},designInput:value=>({external_url:value.url}),Date,Set,Map,URL,Blob,Uint8Array,TextDecoder,TextEncoder,atob,console});
vm.runInContext(source,context);
const rows=[{id:'model',title:'Model',project:'Basement',kind:'interactive',visible:true,updated_at:'v1'},{id:'video',title:'Tutorial',project:'Basement',kind:'link',visible:true,updated_at:'v1'},{id:'new',title:'New',project:'Basement',kind:'link',visible:true,updated_at:'v1'},{id:'hidden',title:'Hidden',project:'Basement',visible:false},{id:'other',title:'Other room',project:'Kitchen',kind:'link',visible:true}];
const presentation={project:'Basement',ids:['video','hidden','model'],requireReview:true};
assert.deepEqual(Array.from(context.presentationRows(rows,presentation),r=>r.id),['video','model','new']);
const all=(root=body)=>[root,...root.children.flatMap(n=>all(n))];
const byText=(text,root=body)=>all(root).find(n=>n.textContent===text);
const modal=()=>body.children.find(n=>n.tag==='dialog');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let finishRead;
 const pending=context.showDesign(()=>new Promise(resolve=>{finishRead=resolve;}),'Slow model',{onContinue:()=>{},onProblem:()=>{throw new Error('Should not skip');}});
 assert(all(modal()).some(n=>n.role==='progressbar'),'Loading activity bar visible');
 assert(!byText('Continue to quote',modal()),'No normal continue during retrieval');
 context.window.confirm=()=>false;
 await byText('I can’t view this — continue anyway').click();assert(modal(),'Cancel skip keeps loading');
 finishRead({kind:'interactive',base64:btoa('<p>Model</p>')});await pending;
 assert(!byText('Continue to quote',modal()),'Wait for embedded page load');
 const frame=all(modal()).find(n=>n.tag==='iframe');frame.listeners.load[0]();
 assert(!all(modal()).some(n=>n.role==='progressbar'),'Loading indicator removed after opening');
 assert(byText('Continue to quote',modal()));await byText('Close',modal()).click();context.window.confirm=()=>true;
 let config=presentation,reads=[],writes=[],failRead=false;
 const request=async payload=>{if(payload.action==='list')return{designs:rows,presentations:[config],presentationRevision:'rev1'};
   if(payload.action==='read'){reads.push(payload.id);if(failRead)throw new Error('File unavailable');return payload.id==='model'?{kind:'interactive',base64:btoa('<p>Model</p>')}:{url:'https://example.com/video'};}
   writes.push(payload);return{ok:true};};
 const root=new Element('div');body.append(root);
 const library=context.mountDesignLibrary(root,{request,isOwner:false});await library.refresh();
 const cards=()=>all(root).filter(n=>n.tag==='article');
 assert.equal(byText('Tutorial',cards()[0]).textContent,'Tutorial');
 await byText('Open design',cards()[1]).click();await tick();
 assert.deepEqual(reads,['video'],'Opening model redirects to first unfinished tutorial');
 let proceed=byText('I’ve watched / reviewed this — continue');assert(proceed.disabled);
 await byText('Open external design').click();assert.equal(proceed.disabled,false);
 await proceed.click();await tick();assert.equal(reads.at(-1),'model');
 await byText('Close',modal()).click();
 await byText('Open design',cards()[1]).click();await tick();assert.equal(reads.at(-1),'model','Completed predecessor not repeated during same visit');
 await byText('I can’t view this — continue anyway').click();await tick();assert.equal(reads.at(-1),'new');
 await byText('Close',modal()).click();
 assert.equal(writes.length,0,'No approvals or receipts written by presentation');
 // Refresh same page retains progress; replacing the tutorial invalidates it.
 await library.refresh();rows[1].updated_at='v2';
 await byText('Open design',cards()[1]).click();await tick();assert.equal(reads.at(-1),'video');
 await byText('Close',modal()).click();
 config={...presentation,requireReview:false};await library.refresh();
 await byText('Open design',cards()[1]).click();await tick();assert.equal(reads.at(-1),'model','Optional sequence allows direct opening');
 await byText('Close',modal()).click();
 failRead=true;await byText('Open design',cards()[0]).click();await tick();assert(byText('File unavailable'));
 await byText('I can’t view this — continue anyway').click();await tick();assert.equal(reads.at(-1),'model');
 await byText('Close',modal()).click();failRead=false;
 // Owner editor saves an explicit complete order and revision, not customer records.
 root.remove();const ownerRoot=new Element('div');body.append(ownerRoot);
 const owner=context.mountDesignLibrary(ownerRoot,{request,isOwner:true});await owner.refresh();
 await byText('Presentation order').click();
 const editor=modal();await all(editor).filter(n=>n.tag==='button'&&n.textContent==='Move down')[0].click();
 await byText('Save presentation',editor).click();assert.equal(writes.length,1);
 assert.equal(writes[0].action,'save_presentation');assert.equal(writes[0].baseVersion,'rev1');
 assert.deepEqual(Array.from(writes[0].designIds),['model','video','new']);
 console.log('PASS: presentation ordering, predecessor gate, external confirmation, fallback, revisions, independent progress and owner save');
})().catch(error=>{console.error(error);process.exitCode=1;});
