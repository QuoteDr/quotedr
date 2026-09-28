const { chromium } = require(process.env.QD_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.QD_BROWSER_PATH, headless: true });
 try {
  const page = await browser.newPage();
  await page.setContent('<textarea class="item-description-textarea">Important warning</textarea>');
  await page.addScriptTag({content:fs.readFileSync('description-format.js','utf8')});
  await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
  for (const label of ['Bold','Italic','Underline','Highlight']) {
   await page.locator('textarea').evaluate(f=> {f.value='Important warning';const e=f.nextElementSibling;e.focus();const r=document.createRange();r.setStart(e.firstChild,0);r.setEnd(e.firstChild,9);getSelection().removeAllRanges();getSelection().addRange(r);});
   await page.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.getByRole('textbox',{name:'Item description'}).textContent(),'Important warning');
   await page.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.locator('textarea').inputValue(),'Important warning', label + ' toggle: ' + await page.getByRole('textbox',{name:'Item description'}).innerHTML());
  }
  await page.evaluate(()=> {const f=document.createElement('textarea');f.className='item-description-textarea';document.body.append(f);});
  await page.getByRole('group',{name:'Description formatting'}).nth(1).waitFor();
  assert.equal(await page.getByRole('group',{name:'Description formatting'}).count(),2);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.getByRole('button',{name:'Highlight',exact:true}).first().isVisible(),true);
  console.log('Formatting selection/toggle, dynamic editor and mobile controls passed');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
