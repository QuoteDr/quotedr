// Synthetic fixture only; no customer data, Supabase traffic or event writes.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require(process.env.QD_PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('dashboard.html','utf8');
const extract = (start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:process.env.QD_BROWSER_PATH});
 try {
  for(const width of [1440,390]) {
   const page = await browser.newPage({viewport:{width,height:900}});
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='cdn.jsdelivr.net'?r.continue():r.abort());
   await page.setContent('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"><div class="modal" id="clientActivityModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"><div id="clientActivityList"></div></div></div></div></div>');
   await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'});
   await page.addStyleTag({content:fs.readFileSync('dashboard-compact.css','utf8')});
   await page.addScriptTag({content:fs.readFileSync('portal-activity-visits.js','utf8')});
   await page.addScriptTag({content:fs.readFileSync('dashboard-compact.js','utf8')});
   await page.addScriptTag({content:`
    var clientActivityEvents=[{id:'synthetic-alert',document_id:'synthetic-document',client_name:'Sample',document_title:'Test invoice',quote_number:'I-DEMO',read_at:null}];
    function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    function clientActivityTitle(){return 'Sample opened your invoice';} function clientActivityIcon(){return 'fa-eye';} function timeAgo(){return 'just now';}
    window.loadSecureClientDocumentActivity=async id=>{window.requestedId=id;return window.failActivity?{error:'fixture denied'}:{data:[{event_type:'document_opened',created_at:'2026-09-28T12:00:00Z',metadata:{location_source:'cloudflare_approximate',location_city:'Oakville',location_region:'Ontario',location_country:'CA'}}]};};
    ${extract('        function renderClientActivityEvents()', '        async function toggleClientActivityRead(')}
    ${extract('        function dashboardPortalActivityDuration(', '        async function togglePortalShareActivity(')}
    renderClientActivityEvents(); bootstrap.Modal.getOrCreateInstance(document.getElementById('clientActivityModal')).show();
   `});
   await page.getByRole('button',{name:'Show Activity'}).click();
   await page.getByRole('dialog',{name:'Activity for Sample · I-DEMO · Test invoice'}).waitFor();
   assert.equal(await page.evaluate(()=>requestedId),'synthetic-document');
   await page.locator('dialog summary').click();
   assert.match(await page.locator('dialog').innerText(),/Oakville, Ontario, Canada/);
   await page.locator('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('button',{name:'Show Activity'}).waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>clientActivityEvents[0].read_at),null);
   assert.equal(await page.getByRole('button',{name:'Show Activity'}).evaluate(el=>el===document.activeElement),true);
   await page.evaluate(()=>window.failActivity=true);
   await page.getByRole('button',{name:'Show Activity'}).click();
   await page.getByText('Could not load activity. Close this window and try again.').waitFor();
   await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Show Activity'}).waitFor({state:'visible'});
   await page.close();
  }
  console.log('Notification browser: desktop/mobile, real Bootstrap/native-dialog focus, location, error, Close/Escape return and unread preservation passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
