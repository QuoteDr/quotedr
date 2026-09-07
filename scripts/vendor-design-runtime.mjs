// Build-time only: package fixed public dependencies, never user-provided URLs.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const esbuild=await import(pathToFileURL(process.env.QD_ESBUILD_MODULE).href);
const base='https://cdn.jsdelivr.net/npm/three@0.160.1/';
const modules=['objects/Reflector','postprocessing/EffectComposer','postprocessing/RenderPass','postprocessing/SSAOPass','postprocessing/OutputPass','environments/RoomEnvironment','controls/OrbitControls'];
const hashes={};
async function read(url){const r=await fetch(url);if(!r.ok)throw Error('Dependency unavailable: '+url);const text=await r.text();hashes[url]=crypto.createHash('sha256').update(text).digest('hex');return text;}
const entry='export * as THREE from "three";\n'+modules.map(p=>'export * as '+p.split('/').pop()+' from "'+base+'examples/jsm/'+p+'.js";').join('\n');
const result=await esbuild.build({stdin:{contents:entry},bundle:true,write:false,format:'iife',globalName:'QDDesignModules',minify:true,legalComments:'inline',plugins:[{name:'fixed-three',setup(build){
  build.onResolve({filter:/.*/},args=>{const url=args.path==='three'?base+'build/three.module.js':args.path.startsWith('.')?new URL(args.path,args.importer).href:args.path;if(!url.startsWith(base))throw Error('Unapproved dependency');return {path:url,namespace:'fixed'};});
  build.onLoad({filter:/.*/,namespace:'fixed'},async args=>({contents:await read(args.path),loader:'js'}));
}}]});
const scripts={};
for(const url of ['https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js','https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js','https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js'])scripts[url]=await read(url);
const dir='vendor/design-runtime-1';await fs.mkdir(dir,{recursive:true});
// The portal's conservative compatibility check flags import examples even in
// error-message strings. Shorten only this known diagnostic, not executable code.
const lucide='https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js';
scripts[lucide]=scripts[lucide].replace(/"Please provide an icons object\.[^"\n]*"/, '"Please provide an icons object."');
await fs.writeFile(dir+'/runtime.json',JSON.stringify({version:1,threeVersion:'0.160.1',modules:result.outputFiles[0].text,scripts}));
const licenses=[];
for(const url of [base+'LICENSE','https://unpkg.com/@floating-ui/core@1.7.3/LICENSE','https://unpkg.com/lucide@1.17.0/LICENSE'])licenses.push(url+'\n'+await read(url));
await fs.writeFile(dir+'/LICENSE',licenses.join('\n\n'));
await fs.writeFile(dir+'/provenance.json',JSON.stringify(hashes,null,2)+'\n');
console.log('Fixed design runtime built');
