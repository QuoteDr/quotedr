const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync('quote-builder.html','utf8');
const attrs = {'data-room-id':'7','data-item-index':'3','data-highlight-mode':'single','data-selected-indexes':''};
const options = {getAttribute: key => attrs[key],setAttribute: (key,value) => {attrs[key]=value;}};
let rendered, cleared;
const ctx = {
  document:{getElementById: id => id === 'lineItemHighlightOptions' ? options : null},
  window:{}, LINE_ITEM_HIGHLIGHTS:{green:{}}, quoteHighlightLabel:()=>'',
  renderLineItemHighlightModalOptions:(...args)=>{rendered=args;},
  setLineItemHighlight:(...args)=>{cleared=args;},
  setSelectedLineItemHighlights:(...args)=>{cleared=args;}
};
vm.createContext(ctx);
const start = html.indexOf('        function setActiveLineItemHighlight(');
const end = html.indexOf('        function renderLineItemHighlightButton(',start);
vm.runInContext(html.slice(start,end),ctx);
ctx.setActiveLineItemHighlight('green');
assert.equal(rendered[0],7);
assert.equal(rendered[1],3);
assert.equal(rendered[2],undefined,'single colour choice must not become bulk row zero');
ctx.setActiveLineItemHighlight('green');
assert.deepEqual(Array.from(cleared),[7,3,''],'clicking the selected colour clears this item');
attrs['data-candidate-color']='';
attrs['data-highlight-mode']='bulk'; attrs['data-selected-indexes']='0,2, ,';
ctx.setActiveLineItemHighlight('green');
assert.deepEqual(Array.from(rendered[2]),[0,2],'real first-row selection remains valid; empty entries are ignored');
ctx.setActiveLineItemHighlight('green');
assert.equal(cleared[0],7); assert.deepEqual(Array.from(cleared[1]),[0,2]); assert.equal(cleared[2],'');
console.log('Single item highlight target and bulk index parsing passed');
