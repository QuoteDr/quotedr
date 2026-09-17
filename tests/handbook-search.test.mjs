import fs from 'node:fs';
import assert from 'node:assert/strict';
import {searchHandbook,validHandbook} from '../handbook-search.mjs';
const book=JSON.parse(fs.readFileSync('qdr-handbook.json','utf8'));
assert(validHandbook(book));
const cases=[
 ['My yellow and orange descriptions disappeared after switching quotes','highlight-explanations-cloud-recovery'],
 ['Can the fix recover already missing highlight wording from a backup?','highlight-explanations-cloud-recovery'],
 ['Can I type immediately in New Quote and press Enter?','modal-keyboard-shortcuts'],
 ['Keyboard autofocus client name and Tab between fields','modal-keyboard-shortcuts'],
 ['Enter does not submit while client suggestions are open','modal-keyboard-shortcuts'],
 ['Does exporting a PDF ask me about card payment?','pdf-client-and-internal-records'],
 ['Will a PDF export answer my Stripe payment review?','pdf-client-and-internal-records'],
 ['Ask me for each quote whether to request a deposit','deposit-choice-per-quote'],
 ['Choose no deposit before sending from the dashboard','deposit-choice-per-quote'],
 ['I cancelled the deposit dialog why did the quote not send?','deposit-choice-per-quote'],
 ['Export PDF for my records with profit report','pdf-client-and-internal-records'],
 ['Does the client PDF include my margin and material costs?','pdf-client-and-internal-records'],
 ['Internal export expired how do I retry?','pdf-client-and-internal-records'],
 ['Can I send an expired quote?','quote-expiry-and-send-time-validity'],
 ['Start the 30 day validity clock when sharing not drafting','quote-expiry-and-send-time-validity'],
 ['Will resending renew the deadline?','quote-expiry-and-send-time-validity'],
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
for (const q of ['Guided description follow-up questions', 'Can I skip questions and generate with what I have?', 'Guided description questions timed out are my answers lost?']) {
 assert(searchHandbook(book,q).some(a=>a.id==='guided-description-follow-up-questions'),q);
}
assert(searchHandbook(book,'Can I skip those?', 'Guided description follow-up questions').some(a=>a.id==='guided-description-follow-up-questions'));
assert(searchHandbook(book,'Can I do all of them?','highlight several items').some(a=>a.id==='bulk-editing-and-highlight-colours'));
assert(searchHandbook(book,'Will it ask again when I resend?','deposit choice for each quote').some(a=>a.id==='deposit-choice-per-quote'));
assert.equal(searchHandbook(book,'quantum banana telescope').length,0);
assert(!validHandbook({...book,articles:[{id:'<script>'}]}));
assert(!validHandbook({...book,articles:[book.articles[0],book.articles[0]]}));
assert(searchHandbook(book,book.articles.map(a=>a.title).join(' ')).length<=4);
console.log('Handbook retrieval: 12 questions, follow-up, unknown, validation and limit passed');
