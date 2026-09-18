const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const source=fs.readFileSync('quote-storage.js','utf8');
const ctx={quoteOptionalItemIncludedByDefault:i=>!i.optional||i.selected,
 quoteItemMarkedAmount:(r,i,n)=>n*(1+(r.markup||0)/100),itemChargedTotal:i=>i.total,
 QuoteDrPayableTotal:{calculate:({subtotal,adjustment,taxRate,taxEnabled})=>({payableTotalCents:Math.round((subtotal+adjustment)*(taxEnabled?1+taxRate:1)*100)})}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function splitQuoteCanMove'),source.indexOf('async function openSplitQuote')),ctx);
const original={supabaseId:'original',type:'quote',status:'draft',clientName:'Sample',quoteNumber:'Q1',taxRate:.13,taxEnabled:true,
 rooms:[{id:1,name:'Main',items:[{total:100}]},{id:2,name:'Basement',markup:10,notes:'scope',photos:['room.jpg'],items:[{total:200,photos:['item.jpg'],highlightColor:'yellow'},{total:50,optional:true}]}],
 highlightLegend:{yellow:'Changed'},highlightDisplayDefaults:{yellow:false},quoteAdjustment:{basis:'amount',amount:10,type:'discount'},
 portal_pin:'secret',signature:'signed',payments:[{amount:10}],invoiceId:'invoice',style:{expiryMode:'fixed',expiryDate:'2020-01-01',depositReviewed:true,depositReviewedFor:'old'}};
const before=JSON.stringify(original);
const draft=ctx.buildSplitQuoteDraft(original,[1],'Basement','Q2','operation');
assert.equal(JSON.stringify(original),before,'source untouched');
assert.equal(draft.grandTotal,248.6);assert.equal(draft.quoteNumber,'Q2');assert.equal(draft.status,'draft');
for(const key of ['portal_pin','signature','payments','invoiceId','supabaseId']) assert.equal(draft[key],undefined,key);
assert.equal(draft.style.depositReviewed,undefined);assert.equal(draft.style.expiryMode,'automatic');assert.equal(draft.style.expiryDate,undefined);
assert.equal(draft.rooms[0].photos[0],'room.jpg');assert.equal(draft.rooms[0].items[0].photos[0],'item.jpg');
assert.equal(draft.highlightLegend.yellow,'Changed');assert.equal(draft.highlightDisplayDefaults.yellow,false);
draft.rooms[0].items[0].total=99;assert.equal(original.rooms[1].items[0].total,200);
assert.equal(ctx.splitQuoteTotal(original,[original.rooms[0]],true),101.7);
assert.equal(ctx.splitQuoteCanMove(original),false);
assert.equal(ctx.splitQuoteCanMove({type:'quote',status:'draft'}),true);
for(const data of [{status:'accepted'},{portal_visible:true},{portal_id:'p'},{deposit_paid:true},{paymentsReceived:{amount:1}},{type:'change_order'},{acceptedAt:'today'}]) assert.equal(ctx.splitQuoteCanMove({type:'quote',status:'draft',...data}),false);
assert.throws(()=>ctx.buildSplitQuoteDraft(original,[], 'a','b','c'));
assert.throws(()=>ctx.buildSplitQuoteDraft(original,[99], 'a','b','c'));
assert.throws(()=>ctx.buildSplitQuoteDraft(original,[1,1], 'a','b','c'));
assert(source.indexOf('localStorage.setItem(\'qdr_split_recovery_')<source.indexOf('const result = await saveQuoteToSupabase(draft)'));
assert(source.indexOf("result?.state !== 'cloud_saved'")<source.indexOf('const saved = await saveQuoteToSupabase(reduced)'));
new vm.Script(source);new vm.Script(fs.readFileSync('supabase-v2.js','utf8'));
console.log('Split quote: content isolation, totals, draft reset, eligibility, invalid selection and save ordering passed');

async function runFlow(failure) {
 const savedSource={...original,payments:[],signature:undefined,invoiceId:undefined,_serverUpdatedAt:'v1'};
 const calls=[];let createdDraft;let applied;
 const status={textContent:''};
 const c={...ctx,source:savedSource,selected:()=>[1],mode:{value:'move'},title:{value:'Basement'},destinationSelect:{value:''},
  window:{_supabaseQuoteId:'original'},crypto:{randomUUID:()=> 'operation'},
  localStorage:{setItem(){calls.push('recovery');if(failure==='snapshot')throw Error('storage full');}},
  modalEl:{querySelector:selector=>selector==='#splitStatus'?status:{textContent:'totals'},querySelectorAll:()=>[]},
  qdConfirm:async()=>true,qdAlert:async()=>{},addRecovery(){},addLink(){},unsavedChanges:false,
  collectQuoteData:()=>savedSource,
  QuoteDrDocumentNumbers:{reserve:async()=>({documentNumber:'Q2'})},
  loadQuoteFromSupabase:async id=>id==='original'?{data:{updated_at:'v1',status:'draft',type:'quote',data:savedSource}}:
   failure==='readback'?{error:'offline'}:{data:{data:createdDraft}},
  saveQuoteToSupabase:async data=>{calls.push(data.forceNew?'new':'original');
   if(data.forceNew){createdDraft=JSON.parse(JSON.stringify(data));return failure==='new'?{state:'local_pending'}:{state:'cloud_saved',data:{id:'new'}};}
   return failure==='original'?{state:'conflict',error:'conflict'}:{state:'cloud_saved',data:{id:'original',updated_at:'v2'}};},
  applyQuoteData:data=>{applied=data;},saveSessionQuote(){},updateSaveStatus(){}};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function splitQuoteCanMove'),source.indexOf('async function openSplitQuote')),c);
 const start=source.indexOf('modalEl.querySelector(\'#splitConfirm\').onclick = async function() {');
 const body=source.slice(start+'modalEl.querySelector(\'#splitConfirm\').onclick = '.length,source.indexOf('\n    };\n}',start)+6);
 await vm.runInContext('('+body.replace(/;\s*$/,'')+')()',c);
 assert.equal(c.window._quoteSplitBusy,false);
 if(failure==='snapshot') assert.deepEqual(calls,['recovery']);
 else if(failure==='new'||failure==='readback') {assert.deepEqual(calls,['recovery','new']);assert.equal(applied,undefined);}
 else {assert.deepEqual(calls,['recovery','new','original']);assert.equal(applied.rooms.length,1);}
 if(failure==='original') assert(status.textContent.includes('Do not split again'));
}
(async()=>{for(const failure of [null,'snapshot','new','readback','original'])await runFlow(failure);console.log('Actual split handler: success, recovery failure, queued new draft, failed readback, and source conflict passed');})().catch(e=>{console.error(e);process.exitCode=1;});
