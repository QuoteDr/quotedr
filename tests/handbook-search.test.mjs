import fs from 'node:fs';
import assert from 'node:assert/strict';
import {searchHandbook,validHandbook} from '../handbook-search.mjs';
const book=JSON.parse(fs.readFileSync('qdr-handbook.json','utf8'));
assert(validHandbook(book));
const cases=[
 ['Portal show amount still owing instead of invoice total theme','portal-document-amount-display'],
 ['Where do I choose balance remaining on client portal cards?','portal-document-amount-display'],
 ['Deposit already recorded why is portal Balance Due full price?','portal-document-amount-display'],
 ['Does switching portal total to owing mark invoice paid?','portal-document-amount-display'],
 ['Recommended portals should be first not alphabetical with others','recommended-portal-assignment'],
 ['Why do two suggested client portals have the same name?','recommended-portal-assignment'],
 ['Does a recommended portal automatically share my invoice?','recommended-portal-assignment'],
 ['Invoice Show more blurs last line but no extra text','invoice-viewer-wide-layout'],
 ['Invoice description expand collapse when rotating phone','invoice-viewer-wide-layout'],
 ['Invoice Show less do I need to save or resend?','invoice-viewer-wide-layout'],
 ['Preview Invoice PDF creates duplicate invoices dashboard','invoice-preview-read-only'],
 ['Does preview use an invoice number or save to cloud?','invoice-preview-read-only'],
 ['Can I send the local unissued preview link to a client?','invoice-preview-read-only'],
 ['Accepted signed quote expired date banner after acceptance','accepted-document-dates'],
 ['Signed invoice date missing does signing mean paid?','accepted-document-dates'],
 ['Do I renew an already accepted quote to remove expiry warning?','accepted-document-dates'],
 ['Upload 30 MB interactive rendering walkthrough monthly allowance','portal-render-upload-limits'],
 ['Does replacing my render count toward three uploads?','portal-render-upload-limits'],
 ['Fourth design upload blocked does withdrawing refund allowance?','portal-render-upload-limits'],
 ['Can my walkthrough use embedded blob libraries without reducing texture quality?','portal-render-upload-limits'],
 ['Discount fifty dollars off each door unit honour old pricing','line-discount-per-unit'],
 ['Does each unit discount change when I change quantity?','line-discount-per-unit'],
 ['Why is dollar discount not multiplied by six doors?','line-discount-per-unit'],
 ['Phone reminders for daily work logs without SMS','daily-work-push-reminders'],
 ['Push test accepted but no notification arrived','daily-work-push-reminders'],
 ['Turn off reminders will my work log disappear?','daily-work-push-reminders'],
 ['Combine basement rooms into an existing dashboard quote','combine-existing-quotes'],
 ['Combine failed or highlight meanings conflict should I retry?','combine-existing-quotes'],
 ['Can I merge quotes for different clients?','combine-existing-quotes'],
 ['Turn off an upgrade for this quote only','quote-only-upgrade-offers'],
 ['Will hidden upgrade still charge or change my saved database?','quote-only-upgrade-offers'],
 ['Re-enable an upgrade after reopening the item editor','quote-only-upgrade-offers'],
 ['Find in Quote Show Values drywall quantities and prices','find-quote-show-values'],
 ['Daily Work Check-in actual hours quote item labour rate','labor-line-item-work-checkin'],
 ['rework waiting excluded labour rate suggestions approve log','labor-line-item-work-checkin'],
 ['phone keypad no minus negative rate material reimbursement','line-item-negative-rate'],
 ['credit sign button disabled Price TBD','line-item-negative-rate'],
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
for (const q of ['Attach three photos to one line item', 'Replace just one line item picture', 'Why is Add Photos disabled after three pictures?']) {
 assert(searchHandbook(book,q).some(a=>a.id==='quote-only-item-photo'),q);
}
assert(searchHandbook(book,'Can I remove only one?', 'line item photos').some(a=>a.id==='quote-only-item-photo'));
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
for (const q of ['View expired quote portal activity', 'Do I have to renew a quote just to see its activity?', 'Update Quote Expiry blocks opening my existing Client Portal']) {
 assert(searchHandbook(book,q).some(a=>a.id==='expired-quote-portal-activity'),q);
}
assert(searchHandbook(book,'Can I still email it?', 'expired quote portal activity').some(a=>a.id==='expired-quote-portal-activity'));
for(const q of ['Standalone presentation order video before model', 'Require viewing in this order without a quote', 'I cannot view the tutorial how do I continue?', 'Does QDR verify external video playback?']) {
 assert(searchHandbook(book,q).some(a=>a.id==='standalone-design-presentation-order'),q);
}
assert(searchHandbook(book,'Does it remember after reloading?', 'standalone design presentation order').some(a=>a.id==='standalone-design-presentation-order'));
console.log('Handbook retrieval: questions, follow-up, unknown, validation and limit passed');
for(const q of ['Empty portal client link zero documents', 'Get a client link before adding a quote', 'Client link unavailable no documents']) {
 assert(searchHandbook(book,q).some(a=>a.id==='empty-portal-client-link'),q);
}
assert(searchHandbook(book,'Will this work later?', 'empty portal client link').some(a=>a.id==='empty-portal-client-link'));
assert(searchHandbook(book,'Invoice viewer discounts overflowing narrow page').some(a=>a.id==='invoice-viewer-wide-layout'));
for(const q of ['Check storage monthly upload bytes', 'Does deleting a file refund my monthly upload allowance?', 'Storage warning existing files still available']) {
 assert(searchHandbook(book,q).some(a=>a.id==='shared-storage-budget'),q);
}
assert(searchHandbook(book,'Does it reset?','shared storage monthly allowance').some(a=>a.id==='shared-storage-budget'));
for(const q of ['Warning only storage account unlimited uploads', 'Can I bypass my storage cap with my email?', 'Does warning only remove the render file size limit?']) {
 assert(searchHandbook(book,q).some(a=>a.id==='storage-warning-only-exception'),q);
}
