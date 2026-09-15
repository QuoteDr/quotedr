const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('quote-storage.js','utf8');
const fn=source.slice(source.indexOf('async function confirmOverwrite()'),source.indexOf('async function confirmSaveLocally()'));
let written=null,closed=0,result={state:'cloud_saved',data:{id:'destination',updated_at:'next'}};
const number={value:'supplier-tax-id'};
const context={window:{},_saveDialogData:{supabaseId:null,quoteNumber:'supplier-tax-id',forceNew:true,_forceNewQuote:true,rooms:[{items:[{rate:1}]}]},_selectedOverwriteId:'destination',
 _saveDialogRows:[{id:'destination',quote_number:'Q-123',updated_at:'base'}],
 document:{getElementById:id=>id==='quoteNumber'?number:null,querySelector:()=>null},qdConfirm:async()=>true,qdAlert:async()=>{},
 localStorage:{setItem(){}},saveQuoteToSupabase:async q=>{written=JSON.parse(JSON.stringify(q));return result;},
 updateSaveStatus(){},updateDraftWarning(){},quoteStorageShowUnconfirmedSave(){},qdAfterManualQuoteSave(){},bootstrap:{Modal:{getInstance:()=>({hide(){closed++;}})}}};
vm.createContext(context);vm.runInContext(fn,context);
(async()=>{
 await context.confirmOverwrite();
 assert.equal(written.quoteNumber,'Q-123');assert.equal(written.supabaseId,'destination');assert.equal(written._serverUpdatedAt,'base');
 assert.equal(written.forceNew,undefined);assert.equal(written._forceNewQuote,undefined);assert.equal(number.value,'Q-123');assert.equal(closed,1);
 for(result of [{error:'Not authenticated'},{state:'action_required'},{state:'local_pending'},{state:'conflict'}]){await context.confirmOverwrite();assert.equal(closed,1,'failed/pending save must not close dialog');}
 written=null;context._saveDialogRows=[];await context.confirmOverwrite();assert.equal(written,null,'missing destination cannot save');
 console.log('Overwrite preserves destination identity and rejects unconfirmed saves');
})().catch(e=>{console.error(e);process.exitCode=1;});
