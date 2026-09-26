import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { designInput, MAX_DESIGN_BYTES } from '../portal-design-policy.mjs';
import { budgetedUpload, storageBudgetMessage, storageUsage } from '../supabase/functions/_shared/storage-budget.ts';
import { issueDesignSession, verifyDesignSession, currentDesignPortal, digest } from '../supabase/functions/_shared/portal-design-session.mjs';
import { loadPortalBranding, publicPortalTheme } from '../supabase/functions/_shared/portal-branding.mjs';

const secret='test-only-secret';
const owner='11111111-1111-4111-8111-111111111111', portal='project-a';
const token=await issueDesignSession(secret,owner,portal,'1847');
assert(await verifyDesignSession(secret,token,owner,portal,'1847'));
for(const args of [[secret,token,owner,'project-b','1847'],[secret,token,owner,portal,'9999'],[secret,token+'x',owner,portal,'1847'],['other',token,owner,portal,'1847'],[secret,token,owner,portal,'1847',Date.now()+9*3600000]])assert.equal(await verifyDesignSession(...args),false);
assert.throws(()=>designInput({kind:'link',title:'x',url:'javascript:alert(1)'}));
assert.throws(()=>designInput({kind:'link',title:'x',url:'https://user:pass@example.com'}));
assert.throws(()=>designInput({kind:'interactive',title:'x',mime:'text/html',size:MAX_DESIGN_BYTES+1}));
assert.throws(()=>designInput({kind:'image',title:'x',mime:'image/svg+xml',size:100}));
assert.equal(designInput({kind:'link',title:'A',url:'https://example.com/view'}).external_url,'https://example.com/view');

// Execute the actual Edge handler with a deterministic database/authorization adapter.
// The session validator and current-portal resolver are the real implementations.
let storageReads=0, authPermission='', quotaFailure=false;
const tables={
  quotes:[],quote_design_links:[],portal_design_activity:[],
  user_data:[{user_id:owner,key:'client_portals',value:[{id:portal,name:'Design-only project',pin:'1847',updatedAt:new Date().toISOString()}]}],
  portal_design_libraries:[{id:'lib-a',user_id:owner,portal_id:portal,share_token:'a'.repeat(48)}],
  portal_designs:[
    {id:'one',library_id:'lib-a',title:'Closet',kind:'interactive',storage_path:'private-model',mime_type:'text/html',visible:true,updated_at:'v1'},
    {id:'hidden',library_id:'lib-a',title:'Draft',kind:'interactive',storage_path:'private-draft',visible:false,updated_at:'v1'},
    {id:'other',library_id:'lib-b',title:'Other customer',visible:true,updated_at:'v1'}
  ]
};
class Query{
  constructor(table){this.table=table;this.filters=[];this.mode='select';}
  select(fields){this.fields=fields;return this;}eq(k,v){this.filters.push([k,v]);return this;}order(){return this;}maybeSingle(){this.one=true;return this;}single(){this.one=true;return this;}
  update(value){this.mode='update';this.value=value;return this;}insert(value){this.mode='insert';this.value=value;return this;}
  upsert(value){this.mode='insert';this.value=value;return this;}
  gte(){return this;}limit(){return this;}
  in(k,values){this.inFilter=[k,values];return this;}delete(){this.mode='delete';return this;}
  then(resolve){if(quotaFailure&&this.table==='portal_designs'&&this.mode==='insert')return Promise.resolve({data:null,error:{message:'render_upload_quota_exceeded'}}).then(resolve);let rows=tables[this.table].filter(r=>this.filters.every(([k,v])=>k==='data->>portal_id'?r.data?.portal_id===v:r[k]===v));
    if(this.mode==='update')rows.forEach(r=>Object.assign(r,this.value));
    if(this.inFilter)rows=rows.filter(r=>this.inFilter[1].includes(r[this.inFilter[0]]));
    if(this.mode==='delete')tables[this.table]=tables[this.table].filter(r=>!rows.includes(r));
    if(this.mode==='insert'){const r={id:'generated-library',...this.value};tables[this.table].push(r);rows=[r];}
    const output=rows.map(r=>this.fields&&this.fields!=='*'?Object.fromEntries(this.fields.split(',').map(k=>[k,r[k]])):{...r});
    return Promise.resolve({data:this.one?output[0]||null:output,error:null}).then(resolve);
  }
}
const stored=new Map([['private-model',new Blob(['<html>model</html>'])]]);
const db={from:t=>new Query(t),storage:{from:()=>({download:async path=>{storageReads++;return{data:stored.get(path),error:null};},upload:async(p,b)=>{stored.set(p,new Blob([b]));return{};},remove:async paths=>{paths.forEach(p=>stored.delete(p));return{};}})}};
db.rpc=async name=>quotaFailure&&name==='qdr_storage_reserve'?{error:{message:'storage_monthly_limit'}}:{data:{existing:false}};
class AccountAccessError extends Error{constructor(message,status=403){super(message);this.status=status;}}
const authorize=async(req,account,permission)=>{authPermission=permission;if(req.headers.get('authorization')!=='Bearer owner-test')throw new AccountAccessError('Forbidden');return{ownerUserId:owner};};
let source=await fs.readFile('supabase/functions/portal-designs/index.ts','utf8');
source=source.replace(/^import .*;\r?\n/gm,'').replace('export async function handleDesignRequest','async function handleDesignRequest').replace('Deno.serve(handleDesignRequest);','');
const handler=new Function('ACCOUNT_PERMISSION','AccountAccessError','requireAccountPermissionWithDefault','serviceClient','currentDesignPortal','verifyDesignSession','designInput','MAX_DESIGN_BYTES','Deno','budgetedUpload','storageBudgetMessage','storageUsage','digest','loadPortalBranding','publicPortalTheme',stripTypeScriptTypes(source)+'\nreturn handleDesignRequest;')({QUOTES_SEND:'quotes.send',QUOTES_READ:'quotes.read'},AccountAccessError,authorize,()=>db,currentDesignPortal,verifyDesignSession,designInput,MAX_DESIGN_BYTES,{env:{get:()=>secret}},budgetedUpload,storageBudgetMessage,storageUsage,digest,loadPortalBranding,publicPortalTheme);
async function call(body,ownerAuth=false){return handler(new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json',authorization:ownerAuth?'Bearer owner-test':'Bearer anon'},body:JSON.stringify({contractorId:owner,portalId:portal,...body})}));}
// Empty full-portal entry requires a current PIN grant, and creates no fake quote.
tables.user_data.push({user_id:owner,key:'business_profile',value:{business_name:'Example Builder',privateSecret:'hidden'}},{user_id:owner,key:'portal_theme',value:{layoutStyle:'client-hub',privateSecret:'hidden'}});
tables.user_data[0].value[0].theme={headerColor:'#abcdef',privateSecret:'hidden'};
assert.equal((await call({action:'branding'})).status,401);
assert.equal((await call({action:'branding',session:token+'bad'})).status,401);
assert.equal((await call({action:'branding',session:token,portalId:'other'})).status,404);
const branded=await (await call({action:'branding',session:token})).json();
assert.equal(branded.branding.businessProfile.business_name,'Example Builder');
assert.equal(branded.branding.portalTheme.layoutStyle,'client-hub');
assert.deepEqual(branded.theme,{headerColor:'#abcdef'});
assert(!JSON.stringify(branded).includes('privateSecret'));
assert.equal(tables.quotes.length,0,'Branding does not create a placeholder quote');
assert.equal((await call({action:'portal_access'})).status,401);
assert.equal((await call({action:'portal_access',session:token,portalId:'other'})).status,404);
assert.equal((await call({action:'portal_access',session:token+'bad'})).status,401);
assert.deepEqual(await (await call({action:'portal_access',session:token})).json(),{name:'Design-only project',token:null});
assert.equal(tables.quotes.length,0);
const entryQuote={id:'entry-quote',user_id:owner,updated_at:'2026-09-25T00:00:00Z',data:{portal_id:portal,portal_name:'Design-only project',portal_visible:true,portal_pin:'1847',rooms:[{name:'Keep me'}]}};
tables.quotes.push(entryQuote,{id:'private-draft',user_id:owner,data:{portal_id:portal,portal_visible:false}});
const entry=await (await call({action:'portal_access',session:token})).json();
assert.equal(entry.anchorId,'entry-quote');assert.equal(entry.token.length,48);
assert.equal(entryQuote.public_share_token_hash,await digest(entry.token));
assert.deepEqual(entryQuote.data.rooms,[{name:'Keep me'}]);
assert.deepEqual(await (await call({action:'portal_access',session:token})).json(),entry,'Repeated visits reuse the token');
entryQuote.data.portal_visible=false;entryQuote.data.portal_anchor_only=true;
assert.deepEqual(await (await call({action:'portal_access',session:token})).json(),entry,'Preserved anchor keeps the same link after removal');
tables.quotes=[];
let response=await call({action:'list'});assert.equal(response.status,401);
response=await call({action:'read',id:'one'});assert.equal(response.status,401);assert.equal(storageReads,0,'No bytes read before a valid PIN grant');
response=await call({action:'resolve',shareToken:'a'.repeat(48)});assert.deepEqual(await response.json(),{contractorId:owner,portalId:portal,name:'Design-only project'});
response=await call({action:'list',session:token});assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.designs.map(r=>r.id),['one']);assert(!JSON.stringify(data).includes('private-model'));
for(const id of ['hidden','other'])assert.equal((await call({action:'read',id,session:token})).status,404);
assert.equal(storageReads,0);
response=await call({action:'read',id:'one',session:token});assert.equal(response.status,200);assert.equal(storageReads,1);assert.equal(atob((await response.json()).base64),'<html>model</html>');
assert.equal((await call({action:'visibility',id:'one',visible:false,session:token})).status,403);
assert.equal((await call({action:'list',ownerMode:true})).status,403);
response=await call({action:'list',ownerMode:true},true);assert.equal(response.status,200);assert.equal(authPermission,'quotes.read');
response=await call({action:'visibility',id:'one',visible:false,ownerMode:true,baseVersion:'wrong'},true);assert.equal(response.status,409);assert(tables.portal_designs[0].visible);
response=await call({action:'visibility',id:'one',visible:false,ownerMode:true,baseVersion:'v1'},true);assert.equal(response.status,200);assert.equal(authPermission,'quotes.send');assert.equal((await call({action:'read',id:'one',session:token})).status,404);
const save={action:'save',ownerMode:true,title:'New model',kind:'interactive',mime:'text/html',size:5,base64:btoa('hello'),thumbnailBase64:btoa('card'),thumbnailMime:'image/webp',thumbnailSize:4};
const count=stored.size;
response=await call({...save,id:'one',baseVersion:'stale'},true);assert.equal(response.status,409);assert.equal(stored.size,count,'Conflict cleans up the new upload, not the old model');
response=await call(save,true);assert.equal(response.status,200);const savedId=(await response.json()).id;
const saved=tables.portal_designs.find(r=>r.id===savedId);assert(stored.has(saved.storage_path));
quotaFailure=true;const beforeQuota=stored.size;
response=await call(save,true);assert.equal(response.status,409);assert.equal(stored.size,beforeQuota,'Quota rejection writes no new files');quotaFailure=false;
// Exercise exact 30 MB multipart transfer through the real handler, then binary read.
const large=new Uint8Array(MAX_DESIGN_BYTES);large[0]=60;large[large.length-1]=62;
const multipart=new FormData();multipart.append('metadata',JSON.stringify({...save,contractorId:owner,portalId:portal,base64:undefined,thumbnailBase64:undefined,size:large.length}));multipart.append('file',new Blob([large],{type:'text/html'}),'fixture.html');
response=await handler(new Request('https://local.test',{method:'POST',headers:{authorization:'Bearer owner-test'},body:multipart}));assert.equal(response.status,200);
const largeId=(await response.json()).id;
response=await call({action:'read',id:largeId,session:token,binary:true});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/octet-stream');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),large);
assert.equal((await call({...save,size:MAX_DESIGN_BYTES+1},true)).status,400);
response=await call({action:'read',session:token,id:savedId});assert.equal(atob((await response.json()).base64),'hello');
response=await call({action:'thumbnail',id:savedId});assert.equal(response.status,401);
response=await call({action:'thumbnail',session:token,id:savedId});assert.equal(atob((await response.json()).base64),'card');
response=await call({...save,id:savedId,baseVersion:saved.updated_at,keepFile:true,title:'Renamed model'},true);assert.equal(response.status,200);assert(stored.has(saved.storage_path),'Metadata edit preserves bytes');
response=await call({action:'save',ownerMode:true,title:'Provider design',kind:'link',url:'https://example.com/model'},true);assert.equal(response.status,200);
assert.equal((await call({...save,kind:'image',mime:'image/svg+xml'},true)).status,400);
assert.equal((await call({action:'list',ownerMode:true,contractorId:'22222222-2222-4222-8222-222222222222'},true)).status,403);
tables.quotes.push({id:'attached-quote',user_id:owner,type:'quote',data:{portal_id:portal}},{id:'different-portal',user_id:owner,data:{portal_id:'elsewhere'}});
const attach={action:'attach_quote',ownerMode:true,id:savedId,documentId:'attached-quote',requireReview:true};
assert.equal((await call(attach)).status,403);
assert.equal((await call({...attach,documentId:'different-portal'},true)).status,400);
assert.equal((await call({...attach,id:'other'},true)).status,400);
assert.equal((await call(attach,true)).status,200);
assert(tables.quote_design_links[0].require_review);
assert.equal((await call(attach,true)).status,409,'Stale attachment update is rejected');
const attachmentVersion=tables.quote_design_links[0].updated_at;
const secondId=tables.portal_designs.find(d=>d.id!==savedId&&d.library_id===tables.portal_designs.find(x=>x.id===savedId).library_id&&d.visible)?.id;
assert(secondId);
assert.equal((await call({...attach,designIds:[savedId,savedId],baseVersion:attachmentVersion},true)).status,400);
assert.equal((await call({...attach,designIds:[savedId,'other'],baseVersion:attachmentVersion},true)).status,400);
assert.equal((await call({...attach,designIds:[secondId,savedId],baseVersion:attachmentVersion},true)).status,200);
assert.deepEqual(tables.quote_design_links[0].design_ids,[secondId,savedId]);
assert.equal((await call({...attach,baseVersion:tables.quote_design_links[0].updated_at},true)).status,409,'Old UI cannot overwrite multi-file list');
assert.equal((await call({...attach,designIds:[savedId],baseVersion:tables.quote_design_links[0].updated_at},true)).status,200,'Explicit replacement');
assert.equal((await call({...attach,designIds:[],baseVersion:tables.quote_design_links[0].updated_at},true)).status,200);
assert.equal(tables.quote_design_links.length,0);
tables.quotes=[];
// Standalone order is independent of quote attachments and owner-only.
const library=tables.portal_design_libraries[0];library.presentation_revision='revision-1';library.presentations=[];
tables.portal_designs.find(r=>r.id===savedId).project='Basement';
const otherDesign=tables.portal_designs.find(r=>r.id===largeId);otherDesign.project='Basement';
const presentation={action:'save_presentation',ownerMode:true,project:'Basement',designIds:[largeId,savedId],requireReview:true,baseVersion:'revision-1'};
assert.equal((await call({...presentation,ownerMode:false,session:token})).status,403);
assert.equal((await call({...presentation,designIds:['other']},true)).status,409);
assert.equal((await call({...presentation,designIds:[savedId,savedId]},true)).status,400);
assert.equal((await call({...presentation,designIds:[savedId]},true)).status,409);
assert.equal((await call(presentation,true)).status,200);
assert.equal(authPermission,'quotes.send');
assert.deepEqual(library.presentations,[{project:'Basement',ids:[largeId,savedId],requireReview:true,reviewId:'legacy',completedAt:null}]);
assert.equal((await call(presentation,true)).status,409,'Stale order cannot overwrite a newer order');
assert.deepEqual((await(await call({action:'list',session:token})).json()).presentations,library.presentations);
const completion={action:'complete_presentation',session:token,project:'Basement',reviewId:'legacy',baseVersion:library.presentation_revision,designIds:[largeId,savedId]};
assert.equal((await call({...completion,session:'invalid'})).status,401);
assert.equal((await call({...completion,ownerMode:true},true)).status,403);
assert.equal((await call({...completion,designIds:[savedId]})).status,409);
assert.equal((await call({...completion,designIds:[savedId,savedId]})).status,409);
assert.equal((await call({...completion,baseVersion:'stale'})).status,409);
assert.equal((await call(completion)).status,200);
const completedAt=library.presentations[0].completedAt;assert(completedAt);
assert.equal((await call(completion)).status,200,'Completion retries are idempotent');
assert.equal((await(await call({action:'list',session:token})).json()).presentations[0].completedAt,completedAt);
assert.equal((await call({...presentation,baseVersion:library.presentation_revision},true)).status,200);
assert.equal(library.presentations[0].completedAt,completedAt,'Ordinary order saves preserve completion');
assert.equal((await call({...presentation,requireAgain:true,requireReview:false,baseVersion:library.presentation_revision},true)).status,200);
assert.equal(library.presentations[0].completedAt,null);
assert.equal(library.presentations[0].requireReview,true);
assert.notEqual(library.presentations[0].reviewId,'legacy');
assert.equal((await call(completion)).status,409,'An old completion cannot undo an owner reset');
otherDesign.visible=false;
assert.deepEqual((await(await call({action:'list',session:token})).json()).presentations[0].ids,[savedId]);
assert.equal(tables.quote_design_links.length,0,'Standalone order does not attach designs to quotes');
const track={action:'track_activity',session:token,event:'design_opened',id:savedId};
assert.equal((await call({...track,session:'invalid'})).status,401);
assert.equal((await call({...track,id:'other'})).status,404,'Cannot log another portal design');
assert.equal((await call({...track,id:largeId})).status,404,'Cannot log withdrawn design');
assert.equal((await call({...track,event:'invented'})).status,400);
assert.equal((await call({...track,event:'external_clicked'})).status,400);
assert.equal((await call({...track,ownerMode:true},true)).status,200);
assert.equal(tables.portal_design_activity.length,0,'Admin preview excluded');
assert.equal((await call(track)).status,200);
assert.equal(tables.portal_design_activity[0].title,tables.portal_designs.find(r=>r.id===savedId).title);
assert.notEqual(tables.portal_design_activity[0].session_hash,token,'No raw PIN session stored');
assert.equal((await call({action:'activity',session:token})).status,403,'Clients cannot read analytics');
assert.equal((await call({action:'activity',ownerMode:true},true)).status,200);
assert.equal((await call({action:'activity',ownerMode:true})).status,403);
tables.user_data[0].value[0].pin='2345';assert.equal((await call({action:'list',session:token})).status,401,'PIN reset invalidates old grants');
tables.user_data[0].value=[];assert.equal((await call({action:'list',session:token})).status,404,'Deleted portal revokes access');
// Execute the PIN endpoint too, including legacy-oracle throttling.
tables.user_data[0].value=[{id:portal,name:'Project',pin:'1847'}];
let allowed=true, lastScope='';
db.rpc=async(name,args)=>{assert.equal(name,'portal_design_pin_attempt');lastScope=args.p_scope;return{data:allowed,error:null};};
let pinHandler;
let pinSource=await fs.readFile('supabase/functions/verify-portal-pin/index.ts','utf8');
pinSource=pinSource.replace(/^import .*;\r?\n/gm,'');
new Function('createClient','currentDesignPortal','digest','issueDesignSession','Deno',stripTypeScriptTypes(pinSource))(()=>db,currentDesignPortal,digest,issueDesignSession,{serve:f=>{pinHandler=f;},env:{get:()=>secret}});
const pinCall=body=>pinHandler(new Request('https://local.test',{method:'POST',body:JSON.stringify({contractorId:owner,portalId:portal,pin:'1847',...body})}));
let pinResult=await(await pinCall({})).json();assert(pinResult.valid);assert(await verifyDesignSession(secret,pinResult.session,owner,portal,'1847'));
const canonicalScope=lastScope;assert.equal(canonicalScope.length,64);
assert.equal((await(await pinCall({pin:'0000'})).json()).valid,false);
allowed=false;assert.equal((await pinCall({})).status,429);
tables.quotes.push({id:'legacy',user_id:owner,client_name:'Test Client',data:{portal_id:portal,portal_pin:'1847',portal_visible:true}});
assert.equal((await pinCall({portalId:'',clientName:'Test Client'})).status,429);assert.equal(lastScope,canonicalScope,'Legacy names consume the same rate-limit bucket');
console.log('PASS: sessions, expiry, tamper, PIN reset, portal isolation, private reads, visibility, owner authorization, conflict protection, design-only registry and validation');
