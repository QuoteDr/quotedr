const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('quote-builder.html','utf8');
const source=html.slice(html.indexOf('        // A backdrop click'),html.indexOf('        function setLinePriceTbdState'));
const listeners={},field={id:'description',value:'original'},modal={querySelectorAll:()=>[field],addEventListener:(n,f)=>listeners[n]=f};
let answers=[],saved=0,closed=0;
const ctx={document:{getElementById:()=>modal},linePhotoDraft:{photos:[],full:[],busy:false},qdConfirm:async()=>answers.shift(),confirmAddLine:async()=>{saved++},bootstrap:{Modal:{getInstance:()=>({hide:()=>closed++})}}};
vm.runInNewContext(source,ctx);
(async()=>{
 listeners['shown.bs.modal'].call(modal);let prevented=false;
 await listeners['hide.bs.modal'].call(modal,{preventDefault(){prevented=true}});assert(!prevented);
 field.value='new text';answers=[false,false];await listeners['hide.bs.modal'].call(modal,{preventDefault(){prevented=true}});assert(prevented);assert.equal(closed,0);assert.equal(field.value,'new text');
 answers=[true];await listeners['hide.bs.modal'].call(modal,{preventDefault(){}});assert.equal(saved,1);assert.equal(closed,0); // validation may keep open
 answers=[false,true];await listeners['hide.bs.modal'].call(modal,{preventDefault(){}});assert.equal(closed,1);
 assert(html.includes("document.getElementById('addLineModal')._draftAllowClose=true;"));
 console.log('PASS unchanged, keep editing, save validation, explicit discard and successful-save bypass');
})().catch(e=>{console.error(e);process.exit(1)});
