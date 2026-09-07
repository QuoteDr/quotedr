import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const version='6.3.289';
const dir='vendor/pdfjs-'+version;
await fs.mkdir(dir,{recursive:true});
const hashes={};
for(const file of ['build/pdf.mjs','build/pdf.worker.mjs','LICENSE']){
  const response=await fetch('https://cdn.jsdelivr.net/npm/pdfjs-dist@'+version+'/'+file);
  if(!response.ok)throw new Error('PDF.js download failed: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());const name=file.split('/').pop();
  await fs.writeFile(dir+'/'+name,bytes);hashes[name]=crypto.createHash('sha256').update(bytes).digest('hex');
}
await fs.writeFile(dir+'/source.json',JSON.stringify({version,source:'https://github.com/mozilla/pdf.js/releases/tag/v'+version,hashes},null,2)+'\n');
console.log('Pinned PDF.js '+version+' with license and SHA-256 provenance.');
