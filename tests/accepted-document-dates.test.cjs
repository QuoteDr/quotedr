const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const quote = fs.readFileSync('interactive-quote-viewer.html','utf8');
const invoice = fs.readFileSync('invoice-viewer.html','utf8');
function between(source,start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const nodes = Object.fromEntries(['quoteDateLabel','quoteDateDisplay','quoteExpiry','invoiceDateDisplay'].map(id=>[id,{textContent:'',innerHTML:''}]));
const context = vm.createContext({quoteData:{},invoiceData:{},window:{},document:{getElementById:id=>nodes[id]},resolveViewerDocumentStyle:()=>({expiryMode:'fixed',expiryDate:'2000-01-01'}),Date});
vm.runInContext(between(quote,'function quoteIsAccepted()','function quoteDepositIsPaid()')+between(quote,'function showExpiryNotice()','function isContractorPreviewView('),context);
for(const data of [{status:'accepted',accepted_at:'2026-09-09T12:00:00Z'},{status:'approved',signed_at:'2026-09-09T12:00:00Z'},{status:'viewed',signed_at:'2026-09-09T12:00:00Z'},{status:'paid'},{accepted_at:'2026-09-09T12:00:00Z'},{status:'accepted',signed_at:'bad-date'}]){
  context.quoteData=data; nodes.quoteExpiry.innerHTML='expired';
  vm.runInContext('showExpiryNotice(); renderQuoteRecordDate();',context);
  assert.equal(nodes.quoteExpiry.innerHTML,'');
  assert(!nodes.quoteDateDisplay.textContent.includes('Invalid Date'));
  assert.equal(nodes.quoteDateLabel.textContent,data.signed_at==='bad-date'||!data.accepted_at&&!data.signed_at?'Status':'Accepted On');
}
context.quoteData={status:'draft'};
vm.runInContext('showExpiryNotice(); renderQuoteRecordDate();',context);
assert(nodes.quoteExpiry.innerHTML.includes('This quote has expired'));
assert.equal(nodes.quoteDateLabel.textContent,'Prepared On');
context.quoteData={id:'fixture',status:'accepted'};
context.window._quoteRow={id:'fixture',accepted_at:'2026-09-09T12:00:00Z'};
vm.runInContext('renderQuoteRecordDate()',context);
assert(nodes.quoteDateDisplay.textContent.includes('2026'));
context.quoteData={id:'other',status:'draft'};
assert.equal(vm.runInContext('quoteIsAccepted()',context),false,'A different preview cannot inherit row acceptance');
vm.runInContext(between(invoice,'function invoiceHasSignature()','function renderInvoiceSignatureState()'),context);
for(const data of [{invoice_acknowledged:true,signed_at:'2026-09-09T12:00:00Z'},{invoice_acknowledged:true},{invoice_acknowledged:true,signed_at:'invalid'}]){
  context.invoiceData=data; vm.runInContext('renderInvoiceRecordDate()',context);
  assert(nodes.invoiceDateDisplay.textContent.startsWith('Signed'));
  assert(!nodes.invoiceDateDisplay.textContent.includes('Invalid Date'));
}
context.invoiceData={status:'paid'};vm.runInContext('renderInvoiceRecordDate()',context);
assert(!nodes.invoiceDateDisplay.textContent.startsWith('Signed'),'Payment alone is not an invoice signature');
assert(between(quote,'function applyQuoteCompletionState()','function scrollToPostApprovalActions()').includes('showExpiryNotice()'));
assert(between(invoice,'function renderInvoiceSignatureState()','function getInvoiceSigningTerms()').includes('renderInvoiceRecordDate()'));
console.log('PASS accepted quote expiry suppression, recorded dates, legacy missing/invalid dates, unsigned expiry and invoice signing state');
