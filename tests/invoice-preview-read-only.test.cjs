const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('quote-builder.html','utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const calls={number:0,review:0,status:0,save:0,open:0};
const stored=new Map();
const context=vm.createContext({rooms:[{items:[]}],console,Date,encodeURIComponent,
 window:{_supabaseQuoteId:'existing-quote',_currentInvoiceData:{id:'existing-share'},open:()=>{calls.open++;return {};},location:{}},
 _supabase:{},buildInvoiceData:id=>({id,quoteNumber:'Q-123',paymentSettings:{},rooms:[{items:[]}]}),
 clientSafePaymentSettings:x=>x,getInvoiceBaseUrl:()=>'/invoice-viewer.html',
 localStorage:{setItem:(k,v)=>stored.set(k,v)},qdAlert:m=>{throw Error(m);},
 reviewDocumentCardPaymentRules:async()=>{calls.review++;return {};},
 qdEnsureInvoiceDocumentNumber:async d=>{calls.number++;d.quoteNumber='I-456';},
 qdDurableSupabaseOperation:()=>{calls.status++;},saveInvoiceForSharing:async()=>{calls.save++;return {data:{id:'saved'}};}
});
vm.runInContext(section('async function prepareInvoiceForViewer(options)','async function ensureInvoiceSavedForPortal(')+section('async function previewInvoice()','async function exportToPDF()'),context);
(async()=>{
 for(let i=0;i<3;i++)await vm.runInContext('previewInvoice()',context);
 assert.deepEqual(calls,{number:0,review:0,status:0,save:0,open:3});
 assert.equal(context.window._currentInvoiceData.id,'existing-share','Preview must not replace pending sharing state');
 const key=stored.get('ald_last_preview_invoice');const data=JSON.parse(stored.get(key));
 assert.equal(data.previewOnly,true);assert.equal(data.quoteNumber,'Preview — not issued');
 context.state={invoiceData:data};await vm.runInContext('saveInvoiceForViewer(state)',context);assert.equal(calls.save,0);
 await vm.runInContext('prepareInvoiceForViewer({markInvoiced:true})',context);
 assert.equal(calls.number,1);assert.equal(calls.review,1);assert.equal(calls.status,1,'Explicit issue flow remains unchanged');
 const viewer=fs.readFileSync('invoice-viewer.html','utf8');
 for(const name of ['confirmInvoiceSignature','handleClientInvoicePayment','reportManualInvoicePayment','pushInvoiceToQB'])assert.match(viewer,new RegExp('async function '+name+'\\([^)]*\\) \\{\\s*if \\(invoiceData.previewOnly === true\\) return;'));
 console.log('PASS repeated invoice preview: no cloud save, numbering, status change or payment review; explicit issuing preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
