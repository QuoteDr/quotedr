import fs from 'node:fs';
import assert from 'node:assert/strict';
import {searchHandbook,validHandbook} from '../handbook-search.mjs';
const book=JSON.parse(fs.readFileSync('qdr-handbook.json','utf8'));
assert(validHandbook(book));
const cases=[
 ['Combine basement rooms into an existing dashboard quote','combine-existing-quotes'],
 ['Combine failed or highlight meanings conflict should I retry?','combine-existing-quotes'],
 ['Can I merge quotes for different clients?','combine-existing-quotes'],
 ['Turn off an upgrade for this quote only','quote-only-upgrade-offers'],
 ['Will hidden upgrade still charge or change my saved database?','quote-only-upgrade-offers'],
 ['Re-enable an upgrade after reopening the item editor','quote-only-upgrade-offers'],
 ['Find in Quote Show Values drywall quantities and prices','find-quote-show-values'],
 ['delete selected drywall search results across rooms','find-quote-delete-selected'],
 ['bulk cleanup EPS panels clear selection undo deletion','find-quote-delete-selected'],
 ['Can search add square feet and linear feet together?','find-quote-show-values'],
 ['Why is a search result Price TBD not zero?','find-quote-show-values'],
 ['PDF smaller text fewer printed pages compact formatting','pdf-print-layout-size'],
 ['Does compact PDF shrink my interactive quote too?','pdf-print-layout-size'],
 ['PDF too small browser scale shrinking twice','pdf-print-layout-size'],
 ['Split my basement rooms into a separate phase quote','split-quote-rooms'],
 ['Move versus copy rooms to another quote','split-quote-rooms'],
 ['Split quote failed but new draft exists should I retry?','split-quote-rooms'],
 ['Attach a quote-only line item photo without saving to the database','quote-only-item-photo'],
 ['Replace or remove an item picture and cancel the upload','quote-only-item-photo'],
 ['My line item photo upload failed unsupported image','quote-only-item-photo'],
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
assert(searchHandbook(book,'Apply to all highlight colour descriptions including older items').some(a=>a.id==='highlight-colour-display-defaults'));
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
