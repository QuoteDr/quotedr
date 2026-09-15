import fs from 'node:fs';
import assert from 'node:assert/strict';
import {searchHandbook,validHandbook} from '../handbook-search.mjs';
const book=JSON.parse(fs.readFileSync('qdr-handbook.json','utf8'));
assert(validHandbook(book));
const cases=[
 ['I want to highlight a bunch of line items at once, can I do that?','bulk-editing-and-highlight-colours'],
 ['How do I colour several rows yellow?','bulk-editing-and-highlight-colours'],
 ['How do I back up to a folder?','saving-backups-and-recovery'],
 ['It says syncing can I clear browser storage?','saving-backups-and-recovery'],
 ['Does Export All include unsaved edits and photos?','saving-backups-and-recovery'],
 ['Restore local recovery file','saving-backups-and-recovery'],
 ['Can I create an empty category?','manage-items-and-saved-pricing'],
 ['How do I use AI Refine on notes?','old-quote-import-and-writing-assistance'],
 ['Where do I import a PDF?','old-quote-import-and-writing-assistance'],
 ['Can my client pick one material?','saved-choice-groups'],
 ['The payment failed','invoices-and-payments'],
 ['Where is AI Voice Memory?','ai-voice-to-quote'],
];
for(const [q,id] of cases) assert(searchHandbook(book,q).some(a=>a.id===id),q);
assert(searchHandbook(book,'Can I do all of them?','highlight several items').some(a=>a.id==='bulk-editing-and-highlight-colours'));
assert.equal(searchHandbook(book,'quantum banana telescope').length,0);
assert(!validHandbook({...book,articles:[{id:'<script>'}]}));
assert(!validHandbook({...book,articles:[book.articles[0],book.articles[0]]}));
assert(searchHandbook(book,book.articles.map(a=>a.title).join(' ')).length<=4);
console.log('Handbook retrieval: 12 questions, follow-up, unknown, validation and limit passed');
