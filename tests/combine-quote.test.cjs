const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('quote-storage.js','utf8');
const helpers=code.slice(code.indexOf('function splitQuoteCanMove'),code.indexOf('async function openSplitQuote'));
const base={quoteOptionalItemIncludedByDefault:()=>true,itemChargedTotal:i=>i.total,quoteItemMarkedAmount:(r,i,n)=>n,
 QuoteDrPayableTotal:{calculate:({subtotal,adjustment})=>({payableTotalCents:Math.round((subtotal+adjustment)*100)})}};
vm.createContext(base);vm.runInContext(helpers,base);
const source={supabaseId:'source',_serverUpdatedAt:'s1',status:'draft',currency:'CAD',clientId:'client',rooms:[{id:1,name:'Basement',items:[{total:100,highlightColor:'yellow'}]},{id:2,items:[{total:50}]}],highlightLegend:{yellow:'Changed'},highlightDisplayDefaults:{yellow:false}};
const target={supabaseId:'target',_serverUpdatedAt:'t1',status:'draft',currency:'CAD',clientId:'client',rooms:[{id:1,items:[{total:20}]}],quoteAdjustment:{type:'discount',basis:'amount',amount:5},quoteNumber:'Q2',style:{expiryDate:'fixed'}};
const before=JSON.stringify([source,target]);
const merged=base.buildCombinedQuote(source,target,[0],'op');
assert.equal(JSON.stringify([source,target]),before);
assert.equal(merged.rooms.length,2);assert.equal(merged.rooms[1].id,2);assert.equal(merged.total,115);
assert.equal(merged.quoteNumber,'Q2');assert.equal(merged.style.expiryDate,'fixed');
assert.equal(merged.rooms[1].items[0].highlightDescriptionOnItem,false);
assert.equal(merged.rooms[1].items[0].highlightDescriptionCustom,true);
for(const change of [{status:'accepted'},{portal_visible:true},{currency:'USD'},{highlightLegend:{yellow:'New'}},{supabaseId:'source'}])assert.throws(()=>base.buildCombinedQuote(source,{...target,...change},[0],'op'));
assert.throws(()=>base.buildCombinedQuote(source,merged,[0],'retry'));
async function flow(failure,move=true){
 let combined;const calls=[];let applied;
 const status={textContent:''};
 const ctx={...base,source,destination:target,destinationLoading:false,destinationSelect:{value:'target'},selected:()=>[0],mode:{value:move?'move':'copy'},title:{value:''},
  window:{_supabaseQuoteId:'source'},crypto:{randomUUID:()=> 'op'},unsavedChanges:false,
  modalEl:{querySelector:s=>s==='#splitStatus'?status:{textContent:'Review totals'},querySelectorAll:()=>[]},
  localStorage:{setItem(key){calls.push('snapshot');if(failure==='snapshot'&&key.endsWith('_destination'))throw Error('full');}},
  addRecovery(){},addLink(){},qdAlert:async()=>{},qdConfirm:async()=>true,collectQuoteData:()=>source,
  quoteStorageCloudRowData:row=>({...row.data,supabaseId:row.id,_serverUpdatedAt:row.updated_at}),
  loadQuoteFromSupabase:async id=> {
   if(id==='source')return {data:{id,updated_at:'s1',status:'draft',type:'quote',data:source}};
   if(combined)return failure==='readback'?{error:'offline'}:{data:{id,data:combined}};
   return {data:{id,updated_at:failure==='stale'?'t2':'t1',data:target}};
  },
  saveQuoteToSupabase:async data=>{calls.push(data.supabaseId);
   if(data.supabaseId==='target'){combined=JSON.parse(JSON.stringify(data));return failure==='pending'?{state:'local_pending'}:{state:'cloud_saved',data:{id:'target'}};}
   return failure==='source'?{error:'conflict',state:'conflict'}:{state:'cloud_saved',data:{id:'source',updated_at:'s2'}};
  },applyQuoteData:data=>{applied=data;},saveSessionQuote(){},updateSaveStatus(){}};
 vm.createContext(ctx);vm.runInContext(helpers,ctx);
 const start=code.indexOf("modalEl.querySelector('#splitConfirm').onclick = async function() {");
 const fn=code.slice(start+"modalEl.querySelector('#splitConfirm').onclick = ".length,code.indexOf('\n    };\n}',start)+6);
 await vm.runInContext('('+fn.replace(/;\s*$/,'')+')()',ctx);
 if(['stale','snapshot'].includes(failure))assert(!calls.includes('target'));
 else assert(calls.includes('target'));
 if(!move||['stale','snapshot','pending','readback'].includes(failure)){assert(!calls.includes('source'));assert.equal(applied,undefined);}
 else {assert(calls.indexOf('target')<calls.indexOf('source'));assert.equal(applied.rooms.length,1);}
 assert.equal(ctx.window._quoteSplitBusy,false);
}
(async()=>{for(const failure of [null,'stale','snapshot','pending','readback','source'])await flow(failure);await flow(null,false);console.log('Combine: identity, totals, collision/conflict guards, copy/move and actual save failure ordering passed');})().catch(e=>{console.error(e);process.exitCode=1;});
