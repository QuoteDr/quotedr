const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('interactive-quote-viewer.html', 'utf8');
const tip = html.slice(html.indexOf('        function showQuotePdfPrintTip()'), html.indexOf('        async function downloadQuotePdf()'));
const print = html.slice(html.indexOf('        var quotePrintPending'), html.indexOf('        function printQuoteIfRequested()'));
const download = html.slice(html.indexOf('        async function downloadQuotePdf()'), html.indexOf('        function hasConsultationUpgradeSelections()'));
assert.match(html, /@media print\s*\{\s*\/\* Print-only[\s\S]*?body\[data-pdf-size="standard"\] \{ zoom: 0\.85; \}/);
assert.match(html, /body\[data-pdf-size="compact"\] \{ zoom: 0\.75; \}/);
assert.match(html, /<option value="large">Large \(100%\)/);
assert.match(html, /setTimeout\(printQuote, 1200\)/);
function element() {
 const listeners = {};
 return {value:'large', addEventListener(n,f){listeners[n]=f;}, removeEventListener(n){delete listeners[n];}, fire(n){listeners[n]?.();}};
}
(async () => {
 for (const size of ['large','standard','compact','invalid']) {
  const modal=element(), button=element(), select=element(); select.value=size;
  let prints=0, logs=0, updates=0;
  const ctx={quoteStudioMode:false, document:{body:{dataset:{}}, getElementById(id){return {quotePdfPrintTipModal:modal,quotePdfPrintTipContinueBtn:button,quotePdfSize:select}[id];}}, window:{print(){prints++;}}, console, logPortalDocumentActivity(){logs++;}, updateTotal(){updates++;}, qdAlert(){throw Error('unexpected alert');}};
  ctx.bootstrap={Modal:{getOrCreateInstance(){return {show(){},hide(){modal.fire('hidden.bs.modal');}};}}};
  ctx.window.bootstrap=ctx.bootstrap;
  vm.createContext(ctx); vm.runInContext(tip+print+download,ctx);
  const pending=ctx.downloadQuotePdf();
  await ctx.printQuote(); // duplicate request must not open a second flow
  assert.equal(prints,0);
  button.fire('click'); await pending;
  assert.equal(prints,1); assert.equal(logs,1); assert.equal(updates,1);
  assert.equal(ctx.document.body.dataset.pdfSize,size==='invalid'?'large':size);
  const cancel=ctx.printQuote(); select.value='compact'; modal.fire('hidden.bs.modal'); await cancel;
  assert.equal(prints,1); assert.equal(ctx.document.body.dataset.pdfSize,size==='invalid'?'large':size);
 }
 console.log('PDF print layout: presets, cancel, shared entrypoints and duplicate guard passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
