// Local-only fixture: no Supabase calls, customer data or external video requests.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const {chromium}=require(process.env.QD_PLAYWRIGHT_MODULE);
const fixture=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/portal-designs.css"><main id="library"></main><script type="module">
import {mountDesignLibrary} from '/portal-designs.js';
const rows=[{id:'model',project:'Basement',title:'Interactive model',kind:'interactive',visible:true,updated_at:'2026-09-25'},{id:'video',project:'Basement',title:'Tutorial video',kind:'link',visible:true,updated_at:'2026-09-25'}];
const request=async p=>p.action==='list'?{designs:rows,presentations:[{project:'Basement',ids:['video','model'],requireReview:true}],presentationRevision:'test'}:p.id==='video'?{url:'https://fixture.invalid/video'}:{kind:'interactive',base64:btoa('<p>Fixture model loaded</p>')};
await mountDesignLibrary(document.querySelector('main'),{request,isOwner:false}).refresh();
</script>`;
const allowed=new Set(['portal-designs.js','portal-designs.css','portal-design-policy.mjs','portal-design-prepare.mjs','storage-budget-client.mjs']);
const server=http.createServer((req,res)=>{const path=req.url.slice(1).split('?')[0];if(!path){res.setHeader('Content-Type','text/html');res.end(fixture);}else if(path==='video'){res.end('Fixture video provider');}else if(allowed.has(path)){res.setHeader('Content-Type',path.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync(path));}else{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.QD_BROWSER_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('https://fixture.invalid/**',route=>route.fulfill({body:'Fixture video provider'}));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('heading',{name:'Tutorial video'}).waitFor();
  assert.equal(await page.locator('article h3').first().textContent(),'Tutorial video');
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Interactive model'})}).getByRole('button',{name:'Open design',exact:true}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Tutorial video'}).waitFor();
  const next=page.getByRole('button',{name:'I’ve watched / reviewed this — continue',exact:true});assert(await next.isDisabled());
  const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Open external design'}).click();await(await popup).close();
  assert(await next.isEnabled());await next.click();
  await page.getByRole('dialog').getByRole('heading',{name:'Interactive model'}).waitFor();
  await page.frameLocator('dialog iframe').getByText('Fixture model loaded').waitFor();
  assert.equal(await page.locator('dialog iframe').getAttribute('sandbox'),'allow-scripts');
  await page.getByRole('button',{name:'Finish presentation',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await page.setViewportSize({width:390,height:844});await page.reload();
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Interactive model'})}).getByRole('button',{name:'Open design',exact:true}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Tutorial video'}).waitFor();
  await page.getByRole('button',{name:'I can’t view this — continue anyway'}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Interactive model'}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS browser desktop/mobile: tutorial first, disabled confirmation until opened, model sandbox, finish, reload reset and fallback; no page errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
