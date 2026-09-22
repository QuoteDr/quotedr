const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('quote-builder.html', 'utf8');
const nodes = {};
let serial = 0;
let fail = false;
let delayed = false;
let pending;
const node = () => ({style:{}, appendChild(){}, replaceChildren(){}, setAttribute(){}, click(){}, getContext(){return {fillRect(){},drawImage(){}};}, toDataURL(){return 'image'+(++serial);}});
const context = vm.createContext({
 document:{createElement:node,getElementById(id){return nodes[id] ||= node();}},
 URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},
 Image:class {naturalWidth=2000;naturalHeight=1000;set src(value){const finish=()=>fail ? this.onerror(new Error('bad image')) : this.onload(); if(delayed)pending=finish;else queueMicrotask(finish);}}
});
vm.runInContext(source.slice(source.indexOf('let linePhotoDraft ='),source.indexOf('function addLine(roomId)')),context);
const run = code => vm.runInContext(code,context);
const file = {type:'image/jpeg',size:200};
context.files = [file,file];
(async()=>{
 run("resetLinePhotoDraft({photo:'legacy',photoFull:'original'});");
 await run("readLinePhoto({files,value:''})");
 assert.equal(run('linePhotoDraft.photos.length'),3);
 assert.equal(run('linePhotoDraft.photos[0]'),'legacy');
 assert.equal(nodes.linePhotoChoose.disabled,true);
 const before=run('JSON.stringify(linePhotoDraft.photos)');
 await run("readLinePhoto({files,value:''})");
 assert.equal(run('JSON.stringify(linePhotoDraft.photos)'),before);
 assert.match(nodes.linePhotoStatus.textContent,/already has 3/);
 context.files=[file];
 run('chooseLinePhotos(1)');
 await run("readLinePhoto({files,value:''})");
 assert.equal(run('linePhotoDraft.photos[0]'),'legacy');
 assert.equal(run('linePhotoDraft.photos[2]'),'image2');
 assert.equal(run('linePhotoDraft.full[0]'),'original');
 fail=true;
 const prior=run('JSON.stringify(linePhotoDraft.photos)');
 await run("readLinePhoto({files,value:''})");
 assert.equal(run('JSON.stringify(linePhotoDraft.photos)'),prior);
 assert.equal(run('linePhotoDraft.busy'),false);
 fail=false; delayed=true;
 const upload=run("readLinePhoto({files,value:''})");
 run("resetLinePhotoDraft({photo:'different quote'})");
 pending(); await upload;
 assert.equal(run('linePhotoDraft.photos.join()'),'different quote');
 assert.equal(run('linePhotoDraft.changed'),false);
 console.log('Multi-photo upload limit, append, replace, failure and stale-editor tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
