const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.route('https://fixture.test/**', route => route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
    await page.goto('https://fixture.test/');
    const html = fs.readFileSync('quote-builder.html','utf8');
    const css = html.slice(html.indexOf('<style>')+7,html.indexOf('</style>'));
    await page.setContent(`<style>${css}</style><div id="manageItemsModal"><button class="manage-mobile-prices" onclick="showManageItemsMobilePrices()">Show units &amp; prices</button><table class="manage-items-table"><tbody><tr class="manage-items-row"><td class="manage-items-portrait-optional" data-manage-portrait-field="unit">Each</td><td class="manage-items-portrait-optional" data-manage-portrait-field="rate"><input value="125"></td></tr></tbody></table></div>`);
    await page.evaluate(() => { localStorage.setItem('ald_manage_items_portrait_fields','[]'); window.pricingDatabase={}; window.customItems={}; window.categoryStyles={}; });
    await page.addScriptTag({path:path.resolve('quote-items.js')});
    await page.evaluate(() => applyManageItemsPortraitFieldSettings());
    const rate = page.locator('[data-manage-portrait-field="rate"]');
    assert.equal(await rate.isVisible(),false);
    await page.locator('.manage-mobile-prices').click();
    assert.equal(await rate.isVisible(),true);
    assert.equal(await page.locator('[data-manage-portrait-field="unit"]').isVisible(),true);
    assert.equal(await page.locator('.manage-mobile-prices').innerText(),'Units & prices shown');
    assert.equal(await rate.locator('input').inputValue(),'125');
    await page.evaluate(() => applyManageItemsPortraitFieldSettings());
    assert.equal(await rate.isVisible(),true);
    console.log('Actual item-module handler and portrait CSS click test passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
