const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('invoice-viewer.html','utf8');
const code = source.slice(source.indexOf('        function renderCollapsibleDescription('), source.indexOf('        var portalActivityStarted'));
let wraps = [];
const context = {escapeHtml:s=>s, document:{querySelectorAll:()=>wraps}, window:{addEventListener(){}}, getComputedStyle:()=>({lineHeight:'20px'}), cancelAnimationFrame(){}, requestAnimationFrame(){}};
vm.createContext(context); vm.runInContext(code,context);
function fixture(height,width=600) {
 const classes=new Set(); const button={setAttribute(k,v){this[k]=v;}};
 const desc={scrollHeight:height,getBoundingClientRect:()=>({width})};
 const wrap={dataset:{},classList:{remove:k=>classes.delete(k),toggle(k,on){if(on===undefined)on=!classes.has(k);on?classes.add(k):classes.delete(k);return on;}},querySelector:s=>s.includes('collapsible')?desc:button};
 button.closest=()=>wrap; return {wrap,desc,button,classes};
}
const short=fixture(40),long=fixture(100),boundary=fixture(61);
wraps=[short.wrap,long.wrap,boundary.wrap]; context.refreshInvoiceDescriptions();
assert(short.button.hidden); assert(!short.classes.has('is-collapsed')); assert(boundary.button.hidden);
assert(!long.button.hidden); assert(long.classes.has('is-collapsed'));
context.toggleItemDescription(long.button); assert.equal(long.button['aria-expanded'],'true');
context.refreshInvoiceDescriptions(); assert(!long.classes.has('is-collapsed'));
long.desc.scrollHeight=40; context.refreshInvoiceDescriptions(); assert(long.button.hidden);
long.desc.scrollHeight=100; context.refreshInvoiceDescriptions(); assert(!long.button.hidden); assert(!long.classes.has('is-collapsed'));
context.toggleItemDescription(long.button); assert(long.classes.has('is-collapsed'));
assert(!context.renderCollapsibleDescription('x'.repeat(300)).includes('is-collapsed'));
assert.match(source,/window.addEventListener\('resize', scheduleInvoiceDescriptions\)/);
assert.match(source,/document.fonts.ready.then\(scheduleInvoiceDescriptions\)/);
assert.match(source,/innerHTML = html;\s*scheduleInvoiceDescriptions\(\)/);
console.log('PASS actual overflow, no fade for fitting text, expand/collapse, resizing and preserved choice');
