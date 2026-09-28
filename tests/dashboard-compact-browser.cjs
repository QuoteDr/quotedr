const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {start} = require('../scripts/dashboard-local-preview.cjs');
(async () => {
    const server = await start(0);
    const url = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
    const issues = [];
    try {
        for (const width of [1440, 768, 390, 320]) {
            const page = await browser.newPage({viewport:{width,height:1000}});
            page.on('pageerror',error=>{issues.push(error.message);console.error('Browser:',error.message);});
            await page.route('**/*', route => {
                const u = new URL(route.request().url());
                if (u.hostname==='127.0.0.1' || ['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)) return route.continue();
                return route.abort();
            });
            await page.goto(url+'/preview');
            await page.locator('.qd-compact-card').first().waitFor();
            assert.equal(await page.locator('.qd-compact-card').count(),8);
            const missing = await page.evaluate(()=> {
                const after=Array.from(document.querySelectorAll('#quotesList [onclick], #quotesList [onchange]')).map(n=>n.getAttribute('onclick')||n.getAttribute('onchange'));
                return originalCardActions.filter(action=>!after.includes(action));
            });
            assert.deepEqual(missing,[], 'Every original card action and permission-bearing node survives');
            assert.equal(await page.locator('.qd-portal-chip').count(),6);
            async function organizationDialog() {
                await page.locator('.qd-dashboard-options > summary').click();
                await page.getByRole('button',{name:'Organize by…',exact:true}).click();
            }
            await organizationDialog();
            if (width === 1440) {
                const handle = page.locator('.qd-client-drag-handle').first();
                const start = await handle.boundingBox();
                const target = await page.locator('.qd-client-order-row').nth(2).boundingBox();
                await page.mouse.move(start.x+17,start.y+17);
                await page.mouse.down();
                await page.mouse.move(start.x+17,start.y+30,{steps:5});
                await page.mouse.move(start.x+17,target.y+target.height-5,{steps:20});
                await page.waitForFunction(()=>document.querySelector('.qd-client-order-row').dataset.clientKey!=='sample client a');
                await page.mouse.up();
                assert.notEqual(await page.locator('.qd-client-order-row').first().getAttribute('data-client-key'),'sample client a','Rows shift during drag');
                await page.getByRole('button',{name:'Cancel',exact:true}).click();
                await organizationDialog();
                assert.equal(await page.locator('.qd-client-order-row').first().getAttribute('data-client-key'),'sample client a','Cancelled drag does not persist');
            }
            await page.getByRole('button',{name:'Compressed by Client',exact:true}).click();
            await page.getByRole('button',{name:'Apply organization',exact:true}).click();
            assert.equal(await page.locator('.qd-client-group').count(),7);
            assert.equal(await page.locator('.qd-client-group[open]').count(),0);
            assert.match(await page.locator('.qd-client-group > summary').first().textContent(),/Sample Client A/);
            await page.locator('.qd-client-group > summary').nth(2).click();
            assert.equal(await page.locator('.qd-client-group').nth(2).locator('.qd-compact-card').count(),2);
            const clientC = page.locator('.qd-client-group').nth(2);
            await clientC.locator('.qd-compact-card').nth(1).locator('.qd-card-menu > summary').click();
            await clientC.locator('.qd-compact-card').nth(1).getByRole('button',{name:'Open',exact:true}).click();
            await page.locator('#searchInput').fill('Additional');
            await page.locator('#searchInput').fill('');
            assert.equal(await page.locator('.qd-client-group').nth(2).locator('[data-quote-select]').first().getAttribute('data-quote-select'),'demo-co');
            await organizationDialog();
            await page.getByRole('button',{name:'Move up Sample Client B',exact:true}).click();
            await page.getByRole('button',{name:'Apply organization',exact:true}).click();
            assert.match(await page.locator('.qd-client-group > summary').first().textContent(),/Sample Client B/);
            await organizationDialog();
            await page.getByRole('button',{name:'Reset alphabetical',exact:true}).click();
            await page.getByRole('button',{name:'Cancel',exact:true}).click();
            assert.match(await page.locator('.qd-client-group > summary').first().textContent(),/Sample Client B/);
            await page.reload();
            assert.match(await page.locator('.qd-client-group > summary').first().textContent(),/Sample Client B/);
            await page.locator('#searchInput').fill('Basement');
            assert.equal(await page.locator('.qd-client-group').count(),2);
            await page.locator('#searchInput').fill('');
            await organizationDialog();
            await page.getByRole('button',{name:'Reset alphabetical',exact:true}).click();
            await page.getByRole('button',{name:'By Client',exact:true}).click();
            await page.getByRole('button',{name:'Apply organization',exact:true}).click();
            assert.equal(await page.locator('.qd-client-group[open]').count(),7);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false);
            await organizationDialog();
            await page.getByRole('button',{name:'Recent (default)',exact:true}).click();
            await page.getByRole('button',{name:'Apply organization',exact:true}).click();
            assert.equal(await page.locator('.qd-client-group').count(),0);
            assert.equal(await page.locator('#quoteBulkBar').isVisible(),false);
            await page.locator('#dashboardSelectMode').click();
            assert(await page.locator('#quoteBulkBar').isVisible());
            await page.locator('#dashboardSelectMode').click();
            await page.locator('[data-quote-select="demo-draft"]').check();
            assert(await page.locator('#quoteBulkBar').isVisible());
            await page.locator('#quoteClearSelection').evaluate(el=>el.disabled=false);
            await page.locator('#quoteClearSelection').click();
            assert.equal(await page.locator('#quoteBulkBar').isVisible(),false);
            const invoice = page.locator('.qd-compact-card').nth(1);
            await invoice.locator('.qd-card-menu > summary').click();
            assert.equal(await invoice.getByRole('button',{name:'Activity',exact:true}).evaluate(n=>n.nextElementSibling.textContent.trim()), 'View Quote & Profit (private)');
            await page.evaluate(()=>{
                window.loadSecureClientDocumentActivity=async id=>{window.activityTestId=id;return {data:[]};};
                window.renderPortalShareActivity=(events,panel)=>{panel.textContent='No client activity has been logged for this document yet.';};
            });
            await invoice.getByRole('button',{name:'Activity',exact:true}).click();
            await page.getByRole('dialog').getByText('No client activity has been logged for this document yet.').waitFor();
            assert.equal(await page.evaluate(()=>window.activityTestId),await invoice.locator('[data-quote-select]').getAttribute('data-quote-select'));
            assert.equal(await page.evaluate(()=>demoCalls.some(c=>c.name==='shareDocumentThroughPortal')),false,'Activity does not publish or open sharing');
            await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
            await invoice.locator('.qd-card-menu > summary').click();
            await invoice.getByRole('button',{name:'View Quote & Profit (private)'}).click();
            assert.equal(await page.evaluate(()=>demoCalls.at(-1).name),'openQuoteProfitReport');
            await invoice.locator('.qd-card-details > summary').click();
            assert(await invoice.getByRole('button',{name:'Edit received amount'}).isVisible());
            assert(await invoice.getByRole('button',{name:'Add payment proof'}).isVisible());
            await invoice.locator('.qd-card-details > summary').click();
            await page.locator('.qd-dashboard-options > summary').click();
            await page.locator('.qd-backup-options > summary').click();
            assert(await page.locator('#exportAllQuotesBtn').isVisible());
            await page.getByRole('button',{name:'Appearance',exact:true}).click();
            for (const theme of ['command','graphite','soft','light']) {
                await page.locator('[data-dashboard-theme="'+theme+'"]').click();
                assert.equal(await page.locator('html').getAttribute('data-qdr-theme'),theme);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false,'No horizontal overflow at '+width+' '+theme);
            }
            await page.locator('[data-dashboard-theme="command"]').click();
            await page.getByRole('button',{name:'Close',exact:true}).click();
            await page.reload();
            assert.equal(await page.locator('html').getAttribute('data-qdr-theme'),'command','Theme persists for this account');
            await page.evaluate(()=>QuoteDrDashboardUI.setUser('different-demo-user'));
            assert.equal(await page.locator('html').getAttribute('data-qdr-theme'),'light','Theme does not leak between accounts');
            await page.evaluate(()=>QuoteDrDashboardUI.setUser('synthetic-preview'));
            await page.locator('#searchInput').fill('Basement');
            assert.equal(await page.locator('.qd-compact-card').count(),2,'Re-rendered cards stay compact');
            fs.mkdirSync(path.resolve('artifacts/dashboard-review'),{recursive:true});
            await page.locator('#searchInput').fill('');
            await page.screenshot({path:path.resolve('artifacts/dashboard-review/command-'+width+'.png'),fullPage:true});
            await page.close();
        }
        assert.deepEqual(issues,[],'No browser JavaScript errors');
        console.log('PASS: preserved actions, portal states, payment controls, overflow menu, backup menu, selection, theme persistence/isolation, re-render and 1440/768/390/320 layouts.');
    } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
