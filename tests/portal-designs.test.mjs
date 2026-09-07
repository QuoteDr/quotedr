import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { designInput, MAX_DESIGN_BYTES } from '../portal-design-policy.mjs';
import { issueDesignSession, verifyDesignSession, currentDesignPortal } from '../supabase/functions/_shared/portal-design-session.mjs';

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
let storageReads=0, authPermission='';
const tables={
  quotes:[],
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
  then(resolve){let rows=tables[this.table].filter(r=>this.filters.every(([k,v])=>k==='data->>portal_id'?r.data?.portal_id===v:r[k]===v));
    if(this.mode==='update')rows.forEach(r=>Object.assign(r,this.value));
    if(this.mode==='insert'){const r={id:'generated-library',...this.value};tables[this.table].push(r);rows=[r];}
    const output=rows.map(r=>this.fields&&this.fields!=='*'?Object.fromEntries(this.fields.split(',').map(k=>[k,r[k]])):{...r});
    return Promise.resolve({data:this.one?output[0]||null:output,error:null}).then(resolve);
  }
}
const stored=new Map([['private-model',new Blob(['<html>model</html>'])]]);
const db={from:t=>new Query(t),storage:{from:()=>({download:async path=>{storageReads++;return{data:stored.get(path),error:null};},upload:async(p,b)=>{stored.set(p,new Blob([b]));return{};},remove:async paths=>{paths.forEach(p=>stored.delete(p));return{};}})}};
class AccountAccessError extends Error{constructor(message,status=403){super(message);this.status=status;}}
const authorize=async(req,account,permission)=>{authPermission=permission;if(req.headers.get('authorization')!=='Bearer owner-test')throw new AccountAccessError('Forbidden');return{ownerUserId:owner};};
let source=await fs.readFile('supabase/functions/portal-designs/index.ts','utf8');
source=source.replace(/^import .*;\r?\n/gm,'').replace('export async function handleDesignRequest','async function handleDesignRequest').replace('Deno.serve(handleDesignRequest);','');
const handler=new Function('ACCOUNT_PERMISSION','AccountAccessError','requireAccountPermissionWithDefault','serviceClient','currentDesignPortal','verifyDesignSession','designInput','MAX_DESIGN_BYTES','Deno',stripTypeScriptTypes(source)+'\nreturn handleDesignRequest;')({QUOTES_SEND:'quotes.send',QUOTES_READ:'quotes.read'},AccountAccessError,authorize,()=>db,currentDesignPortal,verifyDesignSession,designInput,MAX_DESIGN_BYTES,{env:{get:()=>secret}});
async function call(body,ownerAuth=false){return handler(new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json',authorization:ownerAuth?'Bearer owner-test':'Bearer anon'},body:JSON.stringify({contractorId:owner,portalId:portal,...body})}));}
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
const save={action:'save',ownerMode:true,title:'New model',kind:'interactive',mime:'text/html',size:5,base64:btoa('hello')};
const count=stored.size;
response=await call({...save,id:'one',baseVersion:'stale'},true);assert.equal(response.status,409);assert.equal(stored.size,count,'Conflict cleans up the new upload, not the old model');
response=await call(save,true);assert.equal(response.status,200);const savedId=(await response.json()).id;
const saved=tables.portal_designs.find(r=>r.id===savedId);assert(stored.has(saved.storage_path));
response=await call({action:'read',session:token,id:savedId});assert.equal(atob((await response.json()).base64),'hello');
response=await call({...save,id:savedId,baseVersion:saved.updated_at,keepFile:true,title:'Renamed model'},true);assert.equal(response.status,200);assert(stored.has(saved.storage_path),'Metadata edit preserves bytes');
response=await call({action:'save',ownerMode:true,title:'Provider design',kind:'link',url:'https://example.com/model'},true);assert.equal(response.status,200);
assert.equal((await call({...save,kind:'image',mime:'image/svg+xml'},true)).status,400);
assert.equal((await call({action:'list',ownerMode:true,contractorId:'22222222-2222-4222-8222-222222222222'},true)).status,403);
tables.user_data[0].value[0].pin='2345';assert.equal((await call({action:'list',session:token})).status,401,'PIN reset invalidates old grants');
tables.user_data[0].value=[];assert.equal((await call({action:'list',session:token})).status,404,'Deleted portal revokes access');
// Execute the PIN endpoint too, including legacy-oracle throttling.
tables.user_data[0].value=[{id:portal,name:'Project',pin:'1847'}];
let allowed=true, lastScope='';
db.rpc=async(name,args)=>{assert.equal(name,'portal_design_pin_attempt');lastScope=args.p_scope;return{data:allowed,error:null};};
let pinHandler;
let pinSource=await fs.readFile('supabase/functions/verify-portal-pin/index.ts','utf8');
pinSource=pinSource.replace(/^import .*;\r?\n/gm,'');
const {digest}=await import('../supabase/functions/_shared/portal-design-session.mjs');
new Function('createClient','currentDesignPortal','digest','issueDesignSession','Deno',stripTypeScriptTypes(pinSource))(()=>db,currentDesignPortal,digest,issueDesignSession,{serve:f=>{pinHandler=f;},env:{get:()=>secret}});
const pinCall=body=>pinHandler(new Request('https://local.test',{method:'POST',body:JSON.stringify({contractorId:owner,portalId:portal,pin:'1847',...body})}));
let pinResult=await(await pinCall({})).json();assert(pinResult.valid);assert(await verifyDesignSession(secret,pinResult.session,owner,portal,'1847'));
const canonicalScope=lastScope;assert.equal(canonicalScope.length,64);
assert.equal((await(await pinCall({pin:'0000'})).json()).valid,false);
allowed=false;assert.equal((await pinCall({})).status,429);
tables.quotes.push({id:'legacy',user_id:owner,client_name:'Test Client',data:{portal_id:portal,portal_pin:'1847',portal_visible:true}});
assert.equal((await pinCall({portalId:'',clientName:'Test Client'})).status,429);assert.equal(lastScope,canonicalScope,'Legacy names consume the same rate-limit bucket');
console.log('PASS: sessions, expiry, tamper, PIN reset, portal isolation, private reads, visibility, owner authorization, conflict protection, design-only registry and validation');
