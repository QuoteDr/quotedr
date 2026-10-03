const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AdamL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent('<div id="quotesList"><div class="quote-card"><div><div class="quote-card-open-area">Test quote</div><div><label><input data-quote-select="synthetic" value="synthetic"></label></div><button onclick="startEditTitle()">Title</button></div><button data-account-permission="payments.manage" onclick="event.stopPropagation();recordDashboardDeposit(\'synthetic\')">Record Deposit Received</button></div></div>');
   const html=fs.readFileSync('dashboard.html','utf8');
   const source=html.slice(html.indexOf('var dashboardDepositAttempts ='),html.indexOf('async function decideDashboardManualPayment('));
   await page.evaluate(()=>{
    window.answers=['100.00','E-transfer'];window.calls=[];window.messages=[];
    window.qdPrompt=async()=>answers.shift();window.qdConfirm=async()=>true;window.qdAlert=async text=>messages.push(text);window.qdToast=()=>{};
    window.dashboardPaymentAmountToCents=value=>/^\d+(\.\d{1,2})?$/.test(value)?Math.round(Number(value)*100):null;
    window.dashboardFullQuoteRows={};window.refreshQuotes=async()=>{};window.promptDashboardDepositShortfall=async()=>{};
    window.callDocumentPaymentFunction=async(payload,auth)=>{calls.push({payload,auth});return {payment:{documentId:'synthetic'}};};
   });
   // About:blank lacks secure-context randomUUID. Only the synthetic test shim
   // substitutes a key; production uses HTTPS crypto.randomUUID.
   await page.evaluate(()=>{crypto.randomUUID=()=> 'synthetic-receipt-12345678';});
   await page.addScriptTag({content:source});
   await page.addScriptTag({content:fs.readFileSync('dashboard-compact.js','utf8')});
   await page.evaluate(()=>QuoteDrDashboardUI.compactCards(document.getElementById('quotesList')));
   await page.locator('.qd-card-menu summary').click();
   await page.getByRole('button',{name:'Record Deposit Received'}).click();
   await page.waitForFunction(()=>calls.length===1);
   const call=await page.evaluate(()=>calls[0]);assert.equal(call.auth,true);assert.equal(call.payload.action,'owner_record_deposit');assert.equal(call.payload.amountCents,10000);assert.equal(call.payload.method,'etransfer');
   assert.equal(await page.locator('button[onclick*="recordDashboardDeposit"]').getAttribute('data-account-permission'),'payments.manage');
   await page.evaluate(async()=>{answers=['0'];await recordDashboardDeposit('synthetic');});
   assert.equal(await page.evaluate(()=>calls.length),1);assert.match(await page.evaluate(()=>messages[0]),/valid amount/);
   await page.close();
  }
  console.log('Local browser: mobile/desktop compact action, receipt payload and invalid input passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
