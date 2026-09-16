const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const builder=fs.readFileSync('quote-builder.html','utf8');
const style=fs.readFileSync('quote-style.js','utf8');
const ctx=vm.createContext({URL,rooms:[{}],document:{getElementById:()=>({value:'Q-TEST'})},
  window:{location:{href:'https://example.test/quote-builder'},QuoteDrPdfExport:{choose:async()=>({internal:false,profit:false}),stage(){throw Error('Client export must never stage private data')}}},
  markQuoteNumberUsed(){}, showQuoteGenerationProgress:()=>true,hideQuoteGenerationProgress(){},
  initStyleModal:async()=>{},createInteractiveQuoteLink:async()=>'/interactive-quote-viewer?id=quote-test',saveSessionQuote(){},
  alert(message){throw Error(message)},console});
// Run actual export/preview code. No invoice generation, numbering or save APIs
// exist in this context: calling any of them fails this regression.
vm.runInContext(style.slice(style.indexOf('async function previewInteractiveQuote('),style.indexOf('        syncQuoteStyleGlobal();',style.indexOf('async function previewInteractiveQuote('))),ctx);
vm.runInContext(builder.slice(builder.indexOf('async function exportToPDF()'),builder.indexOf('function toggleTimelines()',builder.indexOf('async function exportToPDF()'))),ctx);
(async()=>{
  await ctx.exportToPDF();
  const url=new URL(ctx.window.location.href);
  assert.equal(url.pathname,'/interactive-quote-viewer');
  assert.equal(url.searchParams.get('print'),'1');
  assert.equal(url.searchParams.get('admin_preview'),'1');
  assert.equal(url.searchParams.get('id'),'quote-test');
  await ctx.previewInteractiveQuote();
  assert.equal(new URL(ctx.window.location.href).searchParams.has('print'),false,'ordinary preview does not print');
  const unchanged=ctx.window.location.href;
  ctx.window.QuoteDrPdfExport.choose=async()=>null;
  await ctx.exportToPDF();
  assert.equal(ctx.window.location.href,unchanged,'cancel never navigates');
  ctx.window.QuoteDrPdfExport.choose=async()=>({internal:true,profit:true});
  ctx.hasFeature=async()=>false;
  await assert.rejects(ctx.exportToPDF(),/not available on your plan/);
  assert.equal(ctx.window.location.href,unchanged,'no access never exports profit');
  ctx.hasFeature=async()=>true;
  let staged=false;
  ctx.window.QuoteDrPdfExport.stage=(data,url,profit)=>{assert.equal(profit,true);staged=true};
  await ctx.exportToPDF();
  assert(staged,'internal selection stages appendix');
  console.log('Quote PDF export opens quote print preview without invoice APIs');
})().catch(error=>{console.error(error);process.exitCode=1;});
