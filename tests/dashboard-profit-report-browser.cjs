// Local synthetic data only; never loads the dashboard or any client portal.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
(async () => {
    const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
    try {
        for (const width of [1440,390]) {
            const page = await browser.newPage({viewport:{width,height:900}});
            await page.setContent('<button id="launch">View Quote &amp; Profit (private)</button>');
            await page.addScriptTag({path:path.resolve(__dirname,'../quote-discounts.js')});
            await page.addScriptTag({path:path.resolve(__dirname,'../quote-profit-report.js')});
            await page.evaluate(() => {
                document.querySelector('#launch').onclick = () => QuoteDrProfitReport.open({quote_number:'TEST', total:113, data:{rooms:[{name:'Bedroom',items:[{description:'Test closet',itemDescription:'Synthetic scope',category:'Cabinetry',quantity:1,rate:100,materialCost:30}]}]}});
            });
            await page.click('#launch');
            assert(await page.locator('dialog').evaluate(d => d.open));
            assert((await page.locator('dialog').innerText()).includes('$70.00'));
            const size = await page.locator('dialog').boundingBox();
            assert(size.x >= 0 && size.x + size.width <= width + 1, 'dialog fits viewport');
            await page.keyboard.press('Escape');
            await page.locator('dialog').waitFor({state:'detached'});
            assert.equal(await page.locator('dialog').count(),0);
            await page.click('#launch');
            await page.getByRole('button',{name:'Close',exact:true}).click();
            await page.locator('dialog').waitFor({state:'detached'});
            assert.equal(await page.locator('dialog').count(),0);
            await page.close();
        }
        console.log('Private report desktop/mobile modal checks passed');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
