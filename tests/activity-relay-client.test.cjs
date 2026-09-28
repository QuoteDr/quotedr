const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase-v2.js','utf8');
const code=source.slice(source.indexOf('async function logSecureClientDocumentEvent('),source.indexOf('async function loadSecureClientDocumentActivity('));
(async()=>{
 for(const [mode,expected] of [['ok',1],['unconfigured',2],['missing',2],['upstream-failed',1],['network-failed',1]]) {
  const calls=[];
  const context={location:{protocol:'https:'},CLIENT_DOCUMENT_FUNCTION_URL:'https://backend.test',getSupabaseAnonFunctionHeaders:()=>({'Content-Type':'application/json'}),qdDesignViewerId:()=>'',fetch:async(url,options)=>{
   calls.push(url); assert.equal(JSON.parse(options.body).documentId,'fixture');
   if(calls.length>1 || mode==='ok')return Response.json({event:{id:'fixture'}});
   if(mode==='network-failed')throw Error('offline');
   return Response.json({error:'fixture'},{status:mode==='missing'?404:503,headers:mode==='missing'?{}:{'X-QDR-Activity-Proxy':mode==='unconfigured'?'not-forwarded':'forwarded'}});
  }};
  vm.createContext(context);vm.runInContext(code,context);
  const result=await context.logSecureClientDocumentEvent('fixture','token','document_opened',{sessionId:'fixture'});
  assert.equal(calls.length,expected,mode);
  assert.equal(calls[0],'/api/document-activity');
  if(expected===2)assert.equal(calls[1],'https://backend.test');
  assert.equal(!!result.error,['upstream-failed','network-failed'].includes(mode));
 }
 console.log('Client relay: fallback only before forwarding, no duplicate retry after ambiguous failure passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
