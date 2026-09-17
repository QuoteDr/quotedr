const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('quote-builder.html', 'utf8');
const nodes = {};
const context = vm.createContext({ document: { getElementById(id) { return nodes[id] ||= {removeAttribute() {}}; } } });
vm.runInContext(source.slice(source.indexOf('let linePhotoDraft ='), source.indexOf('function addLine(roomId)')), context);
vm.runInContext(`
const original = {photo:'old', photos:['old'], photoFull:{path:'old'}};
resetLinePhotoDraft(original);
removeLinePhoto();
if (original.photo !== 'old') throw Error('cancel must not mutate item');
resetLinePhotoDraft(original);
const unchanged = JSON.stringify(original);
applyLinePhotoDraft(original);
if(JSON.stringify(original)!==unchanged) throw Error('untouched draft');
linePhotoDraft.photo='new'; linePhotoDraft.changed=true;
applyLinePhotoDraft(original);
if(original.photo!=='new'||original.photos[0]!=='new'||original.photoFull!==null||!original.quotePhotoOverride) throw Error('replace');
removeLinePhoto(); applyLinePhotoDraft(original);
if(original.photo!==''||original.photos.length) throw Error('remove');
const restored=JSON.parse(JSON.stringify(original));
if(!restored.quotePhotoOverride) throw Error('serialization');
resetLinePhotoDraft({photo:'other'});
if(linePhotoDraft.changed||linePhotoDraft.photo!=='other') throw Error('draft leak');
`,context);
assert(source.includes('if (item.quotePhotoOverride) return item;'));
assert(source.includes('if (item.quotePhotoOverride) return false;'));
for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if(script[1].trim() && !script[0].includes('application/ld+json')) new vm.Script(script[1]);
}
console.log('Line photo draft and builder syntax tests passed');
