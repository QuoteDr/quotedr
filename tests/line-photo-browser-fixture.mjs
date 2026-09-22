// Disposable local UI harness. No account, network uploads or customer records.
import http from 'node:http';
import fs from 'node:fs';
const source = fs.readFileSync('quote-builder.html', 'utf8');
const functions = source.slice(source.indexOf('let linePhotoDraft ='), source.indexOf('function addLine(roomId)'));
const html = `<!doctype html><meta charset="utf-8"><title>Line photos local regression</title>
<style>body{font:18px sans-serif;padding:24px}button{padding:12px;margin:4px}#linePhotoPreview{display:flex;gap:20px}img{border:1px solid #ccc}</style>
<h1>Line photos — disposable local test</h1><p>No customer data or cloud writes.</p>
<div id="linePhotoPreview"></div><button id="linePhotoChoose" onclick="chooseLinePhotos()">Add Photos</button>
<input id="linePhotoFile" hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onchange="readLinePhoto(this)">
<p id="linePhotoStatus" role="status"></p>
<button onclick="sample(3)">Test three image upload</button><button onclick="sample(1)">Test fourth image rejection</button>
<button onclick="saveReload()">Save and reopen fixture</button><pre id="result"></pre>
<script>${functions}
resetLinePhotoDraft();
async function sample(count){
 const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#1769aa';ctx.fillRect(0,0,40,40);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 linePhotoDraft.replaceIndex=null;
 await readLinePhoto({files:Array.from({length:count},(_,i)=>new File([blob],'sample'+i+'.png',{type:'image/png'})),value:''});
}
function saveReload(){const item={};applyLinePhotoDraft(item);resetLinePhotoDraft(JSON.parse(JSON.stringify(item)));document.getElementById('result').textContent='Saved and reopened '+item.photos.length+' photos; legacy first photo matches: '+(item.photo===item.photos[0]);}
</script>`;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}).listen(8788,'127.0.0.1',()=>console.log('Photo fixture: http://127.0.0.1:8788'));
