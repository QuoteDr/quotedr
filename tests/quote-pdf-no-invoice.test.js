const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const builder=fs.readFileSync('quote-builder.html','utf8');
const style=fs.readFileSync('quote-style.js','utf8');
const ctx=vm.createContext({URL,rooms:[{}],document:{getElementById:()=>({value:'Q-TEST'})},
  window:{location:{href:'https://example.test/quote-builder'}},
  markQuoteNumberUsed(){}, showQuoteGenerationProgress:()=>true,hideQuoteGenerationProgress(){},
  initStyleModal:async()=>{},createInteractiveQuoteLink:async()=>'/interactive-quote-viewer?id=quote-test',saveSessionQuote(){},
  alert(message){throw Error(message)},console});
// Run actual export/preview code. No invoice generation, numbering or save APIs
// exist in this context: calling any of them fails this regression.
vm.runInContext(style.slice(style.indexOf('async function previewInteractiveQuote('),style.indexOf('        syncQuoteStyleGlobal();',style.indexOf('async function previewInteractiveQuote('))),ctx);
vm.runInContext(builder.slice(builder.indexOf('function exportToPDF()'),builder.indexOf('function toggleTimelines()',builder.indexOf('function exportToPDF()'))),ctx);
(async()=>{
  await ctx.exportToPDF();
  const url=new URL(ctx.window.location.href);
  assert.equal(url.pathname,'/interactive-quote-viewer');
  assert.equal(url.searchParams.get('print'),'1');
  assert.equal(url.searchParams.get('admin_preview'),'1');
  assert.equal(url.searchParams.get('id'),'quote-test');
  await ctx.previewInteractiveQuote();
  assert.equal(new URL(ctx.window.location.href).searchParams.has('print'),false,'ordinary preview does not print');
  console.log('Quote PDF export opens quote print preview without invoice APIs');
})().catch(error=>{console.error(error);process.exitCode=1;});
