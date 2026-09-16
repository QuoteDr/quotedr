const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-style.js','utf8');
const save = source.slice(source.indexOf('async function saveQuoteForPortalSharing('),source.indexOf('function getQuoteAdminPreviewUrl('));
async function run(options) {
 let reviews=0, saved;
 const decision={mode:'auto',reviewed:false};
 const ctx={
  window:{}, document:{getElementById:()=>null}, localStorage:{setItem(){}},
  readQuoteStyleFromControls:()=>({}),syncQuoteStyleGlobal(){},
  collectQuoteData:()=>({type:'quote',grandTotal:100,card_payment:decision}),
  reviewDocumentCardPaymentRules:async()=>{reviews++;return {cardPayment:{mode:'on',reviewed:true}}},
  buildQuotePaymentTerms:()=>({}),quoteDepositDueCents:()=>0,
  saveQuoteForSharing:async(data,opts)=>{saved=data;assert.equal(opts.markShared,false);return {data:{id:'fixture'}}}
 };
 vm.createContext(ctx);vm.runInContext(save,ctx);
 await ctx.saveQuoteForPortalSharing(options);
 return {reviews,saved,decision};
}
(async()=>{
 for (const internal of [false,true]) {
  const result=await run({pdfExport:true,internal});
  assert.equal(result.reviews,0);
  assert.equal(result.saved.card_payment,result.decision,'PDF must preserve unanswered card choice');
 }
 for (const options of [undefined,{}, {pdfExport:false}, {pdfExport:'true'}]) {
  const result=await run(options);
  assert.equal(result.reviews,1,'normal sharing still reviews card rules');
 }
 assert(source.includes('createInteractiveQuoteLink({ pdfExport: options.print === true })'));
 assert(source.includes('getQuoteAdminPreviewUrl(await saveQuoteForPortalSharing(options))'));
 console.log('PDF export bypasses card review without resolving it; sharing still reviews');
})().catch(error=>{console.error(error);process.exitCode=1});
