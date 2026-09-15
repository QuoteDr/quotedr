const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto');
let handler,email='admin@quotedr.io',sent=[],updates=[],providerOK=true,contactError=null;
const record={operation_id:'incident',user_email:'owner@example.com'};
const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:record}),update(value){updates.push(value);return {eq:async()=>({error:contactError})};}};
const service={from(table){assert.equal(table,'save_recovery_records');return query;},auth:{getUser:async()=>({data:{user:email?{id:'admin-id',email}:null}})}};
const ctx={serve:fn=>handler=fn,createClient:()=>service,Deno:{env:{get:key=>({RESEND_API_KEY:'test-key',SUPABASE_URL:'http://test',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'})[key]}},
 Request,Response,TextEncoder,Uint8Array,AbortSignal,crypto:webcrypto,console,
 fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(options);return new Response(JSON.stringify({id:'receipt'}),{status:providerOK?200:502});}};
vm.createContext(ctx);
const ts=fs.readFileSync('supabase/functions/save-recovery/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(stripTypeScriptTypes(ts),ctx);
function request(extra={}){return new Request('http://test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'send_contact',operationId:'incident',subject:'Review',message:'Please check.',...extra})});}
(async()=>{
 email=null;assert.equal((await handler(request())).status,401);assert.equal(sent.length,0);
 email='not-admin@example.com';assert.equal((await handler(request())).status,403);assert.equal(sent.length,0);
 email='admin@quotedr.io';assert.equal((await handler(request({subject:'bad\r\nsubject'}))).status,400);
 const response=await handler(request({to:'attacker@example.com'}));assert.equal(response.status,200);
 assert.deepEqual(JSON.parse(sent[0].body).to,['owner@example.com']);assert.equal(updates.length,1);assert(!('status' in updates[0]));
 await handler(request());assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
 providerOK=false;assert.equal((await handler(request())).status,502);assert.equal(updates.length,2,'provider failure must not mark contacted');
 providerOK=true;contactError=Error('record failed');const result=await (await handler(request())).json();assert.equal(result.providerAccepted,true);assert.equal(result.contactRecorded,false);
 console.log('Direct support email auth, fixed recipient, idempotency and truthful acknowledgement checks passed (mocked provider)');
})().catch(error=>{console.error(error);process.exitCode=1;});
