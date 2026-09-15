import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validHandbook} from '../handbook-search.mjs';
const book=JSON.parse(fs.readFileSync('qdr-handbook.json','utf8'));
if(!validHandbook(book)) throw new Error('Invalid handbook');
for(const a of book.articles) {
 if(!Array.isArray(a.sources)||!a.sources.length||a.sources.some(p=>!fs.existsSync(p))) throw new Error('Missing source evidence for '+a.id);
}
const base=process.argv[2];
if(base) {
 const changed=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split('\n');
 const product=changed.filter(p=> /\.(html|js|ts|mjs)$/.test(p) && !/^(tests|scripts|artifacts|config)\//.test(p));
 // Resolve the base first, so a typo cannot silently bypass the initial-introduction case.
 execFileSync('git',['rev-parse','--verify',base+'^{commit}'],{stdio:'ignore'});
 let prior='';
 try {prior=execFileSync('git',['show',base+':qdr-handbook.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});} catch { /* Initial introduction: schema checks still apply. */ }
 if(product.length && prior.replaceAll('\r\n','\n')===fs.readFileSync('qdr-handbook.json','utf8').replaceAll('\r\n','\n')) {
   const notePath='docs/handbook-no-impact.json';
   const note=fs.existsSync(notePath)?JSON.parse(fs.readFileSync(notePath,'utf8')):null;
   const sha=execFileSync('git',['rev-parse',base],{encoding:'utf8'}).trim();
   if(!note||note.base!==sha||typeof note.reason!=='string'||note.reason.length<30||product.some(p=>!note.files?.includes(p))) throw new Error('Product changed without handbook update. Update affected articles, or provide docs/handbook-no-impact.json with exact base SHA, files and a specific reason.');
 }
}
console.log('Handbook schema, source references and release impact checks passed');
