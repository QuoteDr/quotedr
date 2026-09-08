const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of ['client-portal.html','interactive-quote-viewer.html','invoice-viewer.html']){
 for(const [,attrs,script] of fs.readFileSync(file,'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  if(!/src=|module|ld\+json/.test(attrs))new vm.Script(script,{filename:file});
 }
}
const portal=fs.readFileSync('client-portal.html','utf8');
const designs=fs.readFileSync('portal-designs.js','utf8');
assert(portal.includes("quote.designReview?.locked===true && (!portalIsAdminView || quote.total==null)"));
assert(portal.includes("}).format(quote.total) : 'Unavailable'"));
assert(designs.includes("action:'thumbnail'"));
assert(designs.includes('Card thumbnail screenshot (optional)'));
assert(designs.includes("kind.value==='image'&&file.files[0]?file.files[0]:null"));
console.log('PASS: viewer syntax, missing-price guards and thumbnail controls');
