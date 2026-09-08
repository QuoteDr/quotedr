import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {quoteDesignState,publicDesignReview,lockedQuoteSummary,reviewViewer} from '../supabase/functions/_shared/quote-design-review.mjs';
import {visibleDesignTimer} from '../quote-design-review.js';
const viewer='11111111-1111-4111-8111-111111111111';
const row={id:'quote',user_id:'owner',status:'sent',type:'quote',total:5847.75,data:{portal_id:'portal',fileName:'Closet',rooms:[{rate:9999}],grandTotal:5847.75}};
const tables={quote_design_links:[{document_id:'quote',design_id:'design',require_review:true,updated_at:'link1'}],portal_designs:[{id:'design',library_id:'lib',visible:true,title:'Closet design',version:'1',updated_at:'v1',kind:'interactive',storage_path:'private'}],portal_design_libraries:[{id:'lib',user_id:'owner',portal_id:'portal'}],quote_design_reviews:[],portal_document_events:[]};
class Query{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}eq(key,value){this.filters.push(r=>r[key]===value);return this;}maybeSingle(){this.single=true;return this;}
  insert(value){this.inserted=value;return this;}upsert(value,options){this.upserted=value;this.options=options;return this;}
  update(value){this.updated=value;return this;}
  then(resolve){const list=tables[this.table];if(this.inserted)list.push(this.inserted);
    if(this.upserted){const value=this.upserted,keys=this.options.onConflict.split(',');const found=list.find(r=>keys.every(k=>r[k]===value[k]));if(!found)list.push(value);else if(!this.options.ignoreDuplicates)Object.assign(found,value);}
    const matches=list.filter(r=>this.filters.every(f=>f(r)));if(this.updated)matches.forEach(r=>Object.assign(r,this.updated));return Promise.resolve({data:this.single?matches[0]||null:matches,error:null}).then(resolve);}
}
const db={from:table=>new Query(table),storage:{from:()=>({download:async()=>({data:new Blob(['<html>model</html>'])})})}};
let state=await quoteDesignState(db,row,viewer);assert(state.locked);
assert(!JSON.stringify(lockedQuoteSummary(row,state)).includes('5847'));assert(!JSON.stringify(lockedQuoteSummary(row,state)).includes('rooms'));
assert.equal((await quoteDesignState(db,{...row,type:'invoice'},viewer)).locked,false);
assert.equal((await quoteDesignState(db,{...row,status:'accepted'},viewer)).locked,false);
tables.portal_design_libraries[0].user_id='other';assert.equal(await quoteDesignState(db,row,viewer),null);tables.portal_design_libraries[0].user_id='owner';
assert.equal(reviewViewer('bad'), '');
let owner=false;
const src=fs.readFileSync('supabase/functions/client-document/index.ts','utf8');
const viewSource=src.slice(src.indexOf('async function viewDocument('),src.indexOf('async function portalDocuments('));
const actualView=new Function('normalizeId','assertTokenAccess','quoteDesignState','adminClient','publicDesignReview','json',stripTypeScriptTypes(viewSource)+';return viewDocument;')(v=>v||'',async()=>({target:row}),quoteDesignState,()=>db,publicDesignReview,data=>data);
const lockedResponse=await actualView({documentId:row.id,token:'valid',designViewerId:viewer});
assert(lockedResponse.designReview.locked);assert.equal(lockedResponse.document,undefined);assert(!JSON.stringify(lockedResponse).includes('5847'));
const extracted=src.slice(src.indexOf('async function designReviewRequest('),src.indexOf('async function viewDocument('));
const factory=new Function('assertTokenAccess','normalizeId','adminClient','reviewViewer','quoteDesignState','userFromAuthHeader','sanitizeSessionId','portalId','json',stripTypeScriptTypes(extracted)+';return designReviewRequest;');
const handler=factory(async()=>({target:row}),v=>v||'',()=>db,reviewViewer,quoteDesignState,async()=>owner?{id:'owner'}:null,v=>v||'',r=>r.data.portal_id,(data,status=200)=>({data,status}));
const base={documentId:'quote',token:'valid',designViewerId:viewer,revision:state.revision,sessionId:'test-session'};
assert.equal((await handler({}, {...base,operation:'continue'})).status,400);
assert.equal((await handler({}, {...base,revision:'stale',operation:'open'})).status,409);
assert.equal((await handler({}, {...base,operation:'open'})).status,200);
assert((await quoteDesignState(db,row,viewer)).locked,'Opening does not unlock');
await handler({}, {...base,operation:'duration',durationSeconds:15});
await handler({}, {...base,operation:'duration',durationSeconds:9999});
assert.deepEqual(tables.portal_document_events.filter(e=>e.event_type==='design_view_duration').map(e=>e.duration_seconds),[15,30]);
await handler({}, {...base,operation:'continue'});assert.equal((await quoteDesignState(db,row,viewer)).locked,false);
assert.equal((await quoteDesignState(db,row,'22222222-2222-4222-8222-222222222222')).locked,true);
tables.portal_designs[0].updated_at='v2';state=await quoteDesignState(db,row,viewer);assert(state.locked,'New design requires fresh review');
await handler({}, {...base,revision:state.revision,operation:'problem'});assert.equal((await quoteDesignState(db,row,viewer)).locked,false);
assert.equal(tables.portal_document_events.at(-1).event_type,'design_viewing_problem');
owner=true;const count=tables.portal_document_events.length;await handler({}, {...base,revision:state.revision,operation:'open'});assert.equal(tables.portal_document_events.length,count,'Owner preview is excluded');
assert((await quoteDesignState(db,row,viewer)).receipt.opened_at,'Reopening after fallback supports timing');
tables.portal_designs[0].visible=false;assert.equal(await quoteDesignState(db,row,viewer),null,'Withdrawal releases quote');
// Foreground time and background/suspend behaviour use the real timer.
let now=0,tick,hiddenHandler;const values=[];const doc={hidden:false,addEventListener:(_,fn)=>hiddenHandler=fn,removeEventListener:()=>{}};
const stop=visibleDesignTimer(n=>values.push(n),doc,()=>now,fn=>{tick=fn;return 1;},()=>{});
for(let i=0;i<15;i++){now+=1000;tick();}assert.deepEqual(values,[15]);
doc.hidden=true;hiddenHandler();for(let i=0;i<60;i++){now+=1000;tick();}assert.deepEqual(values,[15]);
doc.hidden=false;hiddenHandler();now+=1000;tick();stop();stop();assert.deepEqual(values,[15,1]);
console.log('PASS: quote locking, redaction, attachment scope, review/version receipts, explicit fallback, owner exclusion and foreground duration');
