import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDesignHtml,validateSelfContained} from '../portal-design-prepare.mjs';
const lib=JSON.parse(fs.readFileSync('vendor/design-runtime-1/runtime.json'));
const load=async()=>lib;
const model='<script type="application/json" id="model">{"meshes":[1,2]}</script>';
const html='<html><body>'+model+'<script type="module">const THREE=await import("https://esm.sh/three@0.160.1");</script></body></html>';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const wrapped='<html><iframe srcdoc="'+escape(html)+'"></iframe></html>';
for(const source of [html,wrapped]){
  const out=await prepareDesignHtml(source,load);
  assert(out.prepared);assert(out.html.includes(model));validateSelfContained(out.html);
  assert(out.html.includes('Promise.resolve(QDDesignModules.THREE)'));
  assert(!out.html.includes('<iframe'));
  assert(Buffer.byteLength(out.html)<8*1024*1024);
}
const plain='<html><canvas></canvas><script>window.modelReady=true;</script></html>';
assert.deepEqual(await prepareDesignHtml(plain,()=>{throw Error('unexpected fetch');}),{html:plain,prepared:false});
for(const bad of [
  html.replace('https://esm.sh/three@0.160.1','https://attacker.invalid/payload.js'),
  html.replace('https://esm.sh/three@0.160.1','https://esm.sh/three@0.160.1?other'),
  html.replace('"https://esm.sh/three@0.160.1"','window.source'),
  html.replace('</body>','<script src="https://attacker.invalid/a.js"></script></body>'),
  wrapped+wrapped, html+'<iframe src="https://example.test"></iframe>',
  'x'.repeat(8*1024*1024+1)
])await assert.rejects(()=>prepareDesignHtml(bad,load));
const expanded={...lib,modules:'x'.repeat(8*1024*1024)};
await assert.rejects(()=>prepareDesignHtml(html,async()=>expanded),/prepared viewer is over/);
const ui=fs.readFileSync('portal-designs.js','utf8');
assert(ui.includes("frame.setAttribute('sandbox','allow-scripts')"));
assert(ui.includes("connect-src 'none'"));
assert(ui.includes('previewedFile!==file.files[0]'));
assert(ui.includes('reviewed.disabled=true'));
assert(!fs.readFileSync('portal-design-prepare.mjs','utf8').includes('fetch(url'));
// Optional private-file check: never copies customer model data into the repo/tests.
if(process.env.QD_DESIGN_TEST_FILE){const original=fs.readFileSync(process.env.QD_DESIGN_TEST_FILE,'utf8');const out=await prepareDesignHtml(original,load);validateSelfContained(out.html);console.log('Current private viewer prepared:',Buffer.byteLength(out.html),'bytes');}
console.log('Automatic preparation, allowlist, size, isolation and confirmation checks passed');
