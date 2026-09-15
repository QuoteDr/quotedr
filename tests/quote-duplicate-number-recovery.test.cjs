const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('save-coordinator.js','utf8');
const operation={key:'quote-key',revision:'retained-revision',entityType:'quote',payload:{rooms:[{items:[{rate:123}]}]}};
let captured;
const ctx={OUTBOX_STORE:'outbox',DEFAULT_TIMEOUT_MS:15000,navigator:{onLine:true},
 getStoreValue:async()=>operation,quoteOperationIdentifierError:()=>null,checkConflict:async()=>null,
 adapterFor:()=>({write:async()=>{throw Error('duplicate key value violates unique constraint "quotes_user_quote_unique"');}}),
 cloneValue:q=>JSON.parse(JSON.stringify(q)),withTimeout:p=>p,errorObject:e=>({message:e.message}),
 markActionRequired:async(op,error,options)=>{captured={op,error,options};return {state:'action_required'};}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('async function flushOperation('),source.indexOf('async function flushSavedOperation(')),ctx);
(async()=>{
 const result=await ctx.flushOperation(operation);
 assert.equal(result.state,'action_required');assert.equal(captured.error.code,'QD_DUPLICATE_QUOTE_NUMBER');
 assert.equal(captured.op,operation);assert.equal(operation.payload.rooms[0].items[0].rate,123);
 assert.equal(captured.options.recordAttempt,true);
 console.log('Duplicate quote-number failures retain payload and require action');
})().catch(error=>{console.error(error);process.exitCode=1;});
