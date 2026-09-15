const fs=require('node:fs'),assert=require('node:assert/strict');
const files=['quote-builder.html','interactive-quote-viewer.html','invoice-viewer.html'];
function luminance(hex){const v=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722;}
for(const file of files){
 const html=fs.readFileSync(file,'utf8');
 for(const [name,bg] of [['yellow','#ffff99'],['orange','#ffdbad']]){
  assert(html.includes(`${name}: { label: '${name[0].toUpperCase()+name.slice(1)}', background: '${bg}'`),file+' must use consistent '+name);
  assert((luminance(bg)+0.05)/(luminance('#495057')+0.05)>4.5,'body text must retain AA contrast');
 }
}
console.log('Yellow/orange palette consistency and body-text contrast passed');
