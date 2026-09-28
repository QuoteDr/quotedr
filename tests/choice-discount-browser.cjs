const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.QD_PLAYWRIGHT_MODULE || 'playwright');
const builder=fs.readFileSync('quote-builder.html','utf8'),viewer=fs.readFileSync('interactive-quote-viewer.html','utf8');
function part(s,a,b){return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.QD_BROWSER_PATH});try{
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.setContent('<select id="lineDiscountType"><option>per_unit</option></select><div id="lineDiscountChoicePanel"><select id="lineDiscountChoiceScope" onchange="updateLineDiscountControls()"><option value="all">All choices</option><option value="selected">Selected choices only</option></select><div id="lineDiscountChoiceOptions"></div></div><div id="preview"></div>');
 await page.addScriptTag({content:fs.readFileSync('quote-discounts.js','utf8')});
 await page.addScriptTag({content:part(builder,'        function updateLineDiscountControls()', '        function makeLineItemFree()')});
 await page.addScriptTag({content:`
 var item={quantity:12,discountType:'per_unit',discountValue:25,discountChoiceScope:'selected',discountChoiceOptionIds:['a'],choiceGroup:{type:'single',selectedOptionIds:['a'],options:[{id:'a',name:'Custom stairs',rate:225},{id:'b',name:'Modified stairs',rate:235}]}};
 var quoteData={rooms:[{}]};
 function applyViewerChoiceGroupToItem(i){var o=i.choiceGroup.options.find(o=>i.choiceGroup.selectedOptionIds.includes(o.id));i.rate=o.rate;i.total=i._undiscountedTotal=o.rate*i.quantity;}
 function getViewerChoiceSelectedOptions(g){return g.options.filter(o=>g.selectedOptionIds.includes(o.id));}
 function viewerChangeOrderClientChoicesLocked(){return false;}function viewerChangeOrderChoiceWasReopened(){return false;}
 function viewerVisibleNotes(){return '';}function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}
 function viewerItemMarkedAmount(r,i,v){return v;}function viewerMoney(v){return '$'+Number(v).toFixed(2);}
 function isViewerPriceTbd(){return false;}function qvDiscounts(){return QuoteDrDiscounts;}
 function renderViewerChoiceGroupEnhancements(){return '';}function renderViewerItemUpgradeGroups(){return '';}
 function toggleViewerChoiceOption(r,n,id){item.choiceGroup.selectedOptionIds=[id];render();}
 ${part(viewer,'        function qvDiscountDetailsHtml(', '        function formatDescriptionText(')}
 ${part(viewer,'        function renderViewerChoiceGroup(', '        function renderViewerChoiceGroupEnhancements(')}
 function render(){document.getElementById('preview').innerHTML=renderViewerChoiceGroup(0,0,item,false);}
 renderLineDiscountChoices(item);render();`});
 assert.equal(await page.locator('#lineDiscountChoiceOptions input:checked').count(),1);
 const cards=page.locator('.choice-option-btn');
 assert.match(await cards.nth(0).innerText(),/Was \$2700.00[\s\S]*Now \$2400.00/);
 assert.doesNotMatch(await cards.nth(1).innerText(),/Was|Now/);
 await cards.nth(1).click();
 assert.equal(await page.evaluate(()=>QuoteDrDiscounts.chargedTotal(item)),2820);
 await page.locator('.choice-option-btn').nth(0).click();
 assert.equal(await page.evaluate(()=>QuoteDrDiscounts.chargedTotal(item)),2400);
 await page.locator('#lineDiscountChoiceScope').selectOption('all');
 assert.equal(await page.locator('#lineDiscountChoiceOptions').isVisible(),false);
 await page.close();
 }
 console.log('Synthetic browser UI passed at desktop/mobile: eligibility controls, Was/Now cards and option switching.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
