import {MAX_DESIGN_BYTES} from './portal-design-policy.mjs';
const unsupported='This viewer needs files QuoteDr cannot package yet. Export a self-contained HTML file, or choose External design link and paste its hosted HTTPS address. ZIP uploads are not supported yet.';
const modulePaths=['objects/Reflector','postprocessing/EffectComposer','postprocessing/RenderPass','postprocessing/SSAOPass','postprocessing/OutputPass','environments/RoomEnvironment','controls/OrbitControls'];
const known=new Map([['three','THREE'],['https://esm.sh/three@0.160.1','THREE'],['https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js','THREE']]);
for(const path of modulePaths){for(const base of ['https://esm.sh/three@0.160.1/','https://cdn.jsdelivr.net/npm/three@0.160.1/'])known.set(base+'examples/jsm/'+path+'.js',path.split('/').pop());}
export function validateSelfContained(html){
  if (/<(?:iframe|frame|object|embed)\b|<script\b[^>]*\bsrc\s*=|<link\b[^>]*stylesheet/i.test(html) || /\bimport\s*(?:\(|[^;\n]*?\bfrom\s*|["'])/.test(html)) throw Error(unsupported);
}
function checkSize(html){if(new TextEncoder().encode(html).length>MAX_DESIGN_BYTES)throw Error('The prepared viewer is over 8 MB. Reduce the model size or use External design link.');}
function decodeAttribute(text){return text.replace(/&quot;/g,'"').replace(/&apos;|&#x27;|&#39;/gi,"'").replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v<=0x10ffff?String.fromCodePoint(v):'\ufffd';}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
let runtimePromise;
async function runtime(){
  if(!runtimePromise)runtimePromise=fetch(new URL('./vendor/design-runtime-1/runtime.json',import.meta.url),{credentials:'omit',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Could not load QuoteDr’s viewer libraries. Please retry.');return r.json();}).catch(e=>{runtimePromise=null;throw e;});
  return runtimePromise;
}
const inline=code=>'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';
// Treat uploaded text as data only: never DOMParser, eval or source-URL fetch.
export async function prepareDesignHtml(source,loadRuntime=runtime){
  checkSize(source);
  try{validateSelfContained(source);return {html:source,prepared:false};}catch{}
  let html=source;
  const frames=[...html.matchAll(/<iframe\b[^>]*\bsrcdoc\s*=\s*(["'])([\s\S]*?)\1[^>]*>\s*<\/iframe\s*>/gi)];
  if(frames.length){
    if(frames.length!==1)throw Error(unsupported);
    html=decodeAttribute(frames[0][2]);
  }
  if(/<(?:iframe|frame|object|embed)\b/i.test(html))throw Error(unsupported);
  const replacements=[];
  html=html.replace(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,(_all,_q,url)=>{
    const key=known.get(url);if(!key)throw Error(unsupported+' Unsupported library: '+url.slice(0,160));
    replacements.push(key);return 'Promise.resolve(QDDesignModules.'+key+')';
  });
  // Static imports are intentionally not rewritten in v1. Unsupported syntax
  // fails closed rather than being evaluated by a bundler in the parent page.
  if(/\bimport\s*(?:\(|[^;\n]*?\bfrom\s*|["'])/.test(html))throw Error(unsupported);
  if(!replacements.length)throw Error(unsupported);
  const lib=await loadRuntime();
  if(lib.version!==1||lib.threeVersion!=='0.160.1')throw Error('Viewer library version mismatch. Refresh QuoteDr and try again.');
  html=html.replace(/<script\b([^>]*)\bsrc\s*=\s*(["'])([^"']+)\2[^>]*>[\s\S]*?<\/script\s*>/gi,(_all,_attrs,_q,url)=>{
    if(!Object.prototype.hasOwnProperty.call(lib.scripts,url))throw Error(unsupported+' Unsupported script: '+url.slice(0,160));
    return inline(lib.scripts[url]);
  });
  // Discard export CSP only; the portal always injects its stricter policy first.
  html=html.replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*>/gi,'');
  validateSelfContained(html);
  html=inline(lib.modules)+html;
  checkSize(html);
  return {html,prepared:true};
}
