const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('quote-builder.html','utf8');
let events = [], recalculated = 0;
const input = {value:'175.85', disabled:false, focus(){}, dispatchEvent(e){events.push(e.type);}};
const button = {setAttribute(k,v){this[k]=v;}};
const hint = {};
const ctx = {document:{getElementById:id=>({lineRate:input,lineRateSign:button,lineRateCreditHint:hint})[id]}, Event:class {constructor(type){this.type=type;}}, calculateMaterialTotal:()=>recalculated++};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('        function syncLineRateSign()'),html.indexOf("        document.getElementById('addLineModal').addEventListener('shown.bs.modal', syncLineRateSign);")),ctx);
ctx.toggleLineRateSign(); assert.equal(input.value,'-175.85'); assert.equal(hint.hidden,false);
assert.deepEqual(events,['input','change']); assert.equal(recalculated,1);
ctx.toggleLineRateSign(); assert.equal(input.value,'175.85'); assert.equal(hint.hidden,true);
input.disabled=true; ctx.toggleLineRateSign(); ctx.syncLineRateSign(); assert.equal(input.value,'175.85'); assert.equal(button.disabled,true);
input.disabled=false;
for(const value of ['', '0','invalid']) {input.value=value; ctx.toggleLineRateSign(); assert.equal(input.value,value);}
input.value='-12.34'; ctx.syncLineRateSign(); assert.equal(hint.hidden,false);
console.log('Rate sign: decimal toggle, existing credit, TBD, blank/zero/invalid and input events passed');
