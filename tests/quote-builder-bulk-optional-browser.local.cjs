// Isolated UI fixture; no authentication, customer records or server writes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AdamL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const src=fs.readFileSync('quote-builder.html','utf8');
 const selection=src.slice(src.indexOf('function quoteBuilderRoomById('),src.indexOf('function cloneQuoteBuilderLineItem('));
 const optional=src.slice(src.indexOf('async function makeQuoteItemsOptional('),src.indexOf('async function applyMarkupToRoomItems('));
 const menu=src.slice(src.indexOf("html += '<li><button type=\"button\" class=\"dropdown-item\" onclick=\"setAllRoomItemSelections("),src.indexOf("html += '<li><button type=\"button\" class=\"dropdown-item disabled\" disabled data-room-bulk-requires-selection=\"' + room.id + '\" onclick=\"openSelectedLineItemHighlightModal("));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent('<ul id="menu"></ul><input class="choice-group-select" data-room-id="1" data-item-index="0" type="checkbox"><input class="choice-group-select" data-room-id="1" data-item-index="1" type="checkbox">');
   await page.evaluate(()=>{
    window.rooms=[{id:1,items:[{rate:100},{choiceGroup:{required:true,options:[{id:'a'}],selectedOptionIds:['a']}}]},{id:2,items:[{rate:200}]}];
    window.undos=0;window.finishes=0;window.qdAlert=async()=>{};window.qdConfirm=async()=>true;window._pushUndo=()=>undos++;window.finishRoomBulkItemAction=()=>finishes++;window.quoteBuilderIsChangeOrderMode=()=>false;
   });
   await page.addScriptTag({content:selection+optional});
   await page.evaluate(code=>{let room=rooms[0],html='';eval(code);document.getElementById('menu').innerHTML=html;},menu);
   assert.equal(await page.getByRole('button',{name:'Make Optional',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Select All Items',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Make Optional',exact:true}).isDisabled(),false);
   await page.getByRole('button',{name:'Make Optional',exact:true}).click();
   await page.waitForFunction(()=>finishes===1);
   const first=await page.evaluate(()=>({ordinary:rooms[0].items[0].optional,group:rooms[0].items[1].choiceGroup.required,other:rooms[1].items[0].optional,undos}));
   assert.deepEqual(first,{ordinary:true,group:false,other:undefined,undos:1});
   await page.getByRole('button',{name:'Make Entire Quote Optional...',exact:true}).click();
   await page.waitForFunction(()=>finishes===2);
   assert.equal(await page.evaluate(()=>rooms[1].items[0].optional),true);
   await page.close();
  }
  console.log('Bulk Optional browser: mobile/desktop Select All + Make Optional, disabled-state update, choice group and whole-quote action passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
