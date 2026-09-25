// Local-only, read-only model check. No customer asset is copied into the repo.
// node scripts/serve-render-compatibility.mjs <absolute-html-path>
import http from 'node:http';
import fs from 'node:fs/promises';
import {prepareDesignHtml} from '../portal-design-prepare.mjs';
const model=await prepareDesignHtml(await fs.readFile(process.argv[2],'utf8'));
const csp=(await fs.readFile('_headers','utf8')).match(/Content-Security-Policy: (.*)/)[1];
const files=new Set(['/portal-designs.js','/portal-design-policy.mjs','/portal-design-prepare.mjs','/portal-designs.css','/storage-budget-client.mjs','/tests/portal-render-isolation-browser.html']);
const page=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/portal-designs.css"><button id="open">Open unchanged model in QDR sandbox</button><script type="module">import {showDesign} from '/portal-designs.js';document.querySelector('button').onclick=()=>showDesign(async()=>({kind:'interactive',file:await (await fetch('/model')).blob()}),'Local render compatibility');</script>`;
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;let data,type;if(path==='/'){data=page;type='text/html';}else if(path==='/model'){data=model.html;type='application/octet-stream';}else if(files.has(path)){data=await fs.readFile('.'+path);type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript';}else{res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':csp,'Cache-Control':'no-store'}).end(data);}catch{res.writeHead(500).end();}}).listen(8879,'127.0.0.1',()=>console.log('Local sandbox test: http://127.0.0.1:8879'));
