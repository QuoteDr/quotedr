const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, channel:'chrome'});
 try {
  const page = await browser.newPage();
  await page.setContent('<button id="start">Review</button>');
  await page.addScriptTag({path:'quote-deposit-review.js'});
  await page.evaluate(() => {
   window.data={grandTotal:100};
   window.loadPaymentSettings=async()=>({deposit_ask_each_quote:true,deposit_default_pct:50});
   window.qdAlert=async message=>{window.error=message};
   document.querySelector('#start').onclick=()=>{window.result='pending';QuoteDrDepositReview.review(data,window.force).then(value=>window.result=value)};
  });
  await page.click('#start');
  await page.click('[data-apply]');
  assert.match(await page.locator('#depositReviewError').innerText(), /Choose/);
  await page.click('[data-cancel]');
  assert.equal(await page.evaluate(()=>result),false);
  assert.equal(await page.evaluate(()=>data.style),undefined);
  await page.click('#start');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>result),false);
  await page.click('#start');
  await page.selectOption('#depositReviewMode','show');
  await page.fill('#depositReviewAmount','0');
  await page.click('[data-apply]');
  assert.equal(await page.locator('dialog').count(),1);
  await page.fill('#depositReviewAmount','25');
  await page.click('[data-apply]');
  assert.equal(await page.evaluate(()=>data.deposit_due_cents),2500);
  await page.click('#start');
  assert.equal(await page.locator('dialog').count(),0,'reviewed quote does not prompt again');
  await page.evaluate(()=>window.force=true);
  await page.click('#start');
  await page.selectOption('#depositReviewMode','hide');
  await page.click('[data-cancel]');
  assert.equal(await page.evaluate(()=>data.payment_terms.deposit_required),true,'cancel preserves prior choice');
  await page.click('#start');
  await page.selectOption('#depositReviewMode','hide');
  await page.click('[data-apply]');
  assert.equal(await page.evaluate(()=>data.deposit_due_cents),0);
  await page.evaluate(()=>{data.portal_visible=true;});
  await page.click('#start');
  assert.equal(await page.locator('dialog').count(),0);
  assert.match(await page.evaluate(()=>window.error), /already shared/);
  console.log('Chrome dialog: required choice, validation, Cancel, Escape, save, re-review, and shared quote protection passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
