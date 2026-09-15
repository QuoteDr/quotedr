const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{},console,Set,Date,JSON,Array,Error};
vm.createContext(context);
vm.runInContext(fs.readFileSync('quote-backups.js','utf8'),context);
const api=context.window.QuoteDrBackups;
const rows=[{id:'one',quote_number:'Q-1',updated_at:'2026-09-14',data:{quoteTitle:'Room <one>',quoteNumber:'wrong',clientName:'Client A',rooms:[{name:'Room',items:[{description:'Test',rate:123}]}]}},
 {id:'two',data:{clientName:'Client B',type:'quote',rooms:[]}},
 {id:'invoice',data:{type:'invoice',rooms:[]}}];
const before=JSON.stringify(rows);
const bundle=api.makeBundle(rows,'2026-09-14');
assert.equal(bundle.documents.length,2);
assert.equal(bundle.manifest.excludedRecords,1);
assert.equal(bundle.documents[0].quote.quoteNumber,'Q-1');
assert.equal(bundle.documents[0].quote.supabaseId,'one');
assert.equal(JSON.stringify(rows),before);
assert.equal(api.candidates(JSON.parse(JSON.stringify(bundle)))[0].quote.rooms[0].items[0].rate,123);
assert.equal(api.candidates({format:'quotedr-server-recovery-v1',record:{payload:rows[0].data}}).length,1);
assert.throws(()=>api.makeBundle([rows[0],rows[0]]),/Duplicate/);
const mismatched=JSON.parse(JSON.stringify(bundle)); mismatched.documents[0].id='other';
assert.throws(()=>api.candidates(mismatched),/does not match/);
assert.throws(()=>api.recoveryQuote({type:'invoice',rooms:[]}),/not a supported/);
assert.throws(()=>api.candidates({format:'unknown'}),/Unrecognised/);
console.log('Dashboard backup, incident export and round-trip checks passed');
