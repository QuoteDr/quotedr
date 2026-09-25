const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('invoice-viewer.html','utf8');
assert(source.includes('class="container invoice-page py-4"'));
assert(!source.includes('style="max-width: 860px;"'));
assert.match(source,/@media screen\s*\{\s*\.container\.invoice-page\s*\{\s*width: 96%;\s*max-width: none;/);
assert.match(source,/\.invoice-line-discount\s*\{\s*white-space: normal;\s*overflow-wrap: anywhere;/);
assert.match(source,/@media print\s*\{\s*\.container\.invoice-page \{ width: 100%; max-width: none; \}/);
const fn=source.slice(source.indexOf('function invoiceDiscountHtml('),source.indexOf('function invoiceRoomIconClass('));
const render=new Function('invDiscounts','invoiceMarkedAmount','formatMoney','escapeHtml','invoiceLineTotal',fn+';return invoiceDiscountHtml;')(
 ()=>({hasDiscount:()=>true,originalTotal:()=>600,discountAmount:()=>50,discountLabel:()=> 'Courtesy discount',appliesToUpgrades:()=>false}),
 (room,item,n)=>n,n=>'$'+n,s=>s,()=>550);
assert.equal(render({},'CAD',{}),'<div class="invoice-line-discount"><div class="small text-muted"><span>Was </span><s>$600</s></div><div class="small text-success">Courtesy discount (base item only) -$50</div><div class="small text-muted">Now $550</div></div>');
console.log('PASS wide invoice screen layout, separate print sizing, wrapping discount and unchanged amounts');
