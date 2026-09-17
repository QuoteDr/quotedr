const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('quote-items.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function parseGuidedDescriptionQuestions'), source.indexOf('function openGuidedDescriptionDialog')), context);
const parse = context.parseGuidedDescriptionQuestions;
const history = [{topic:'framing',question:'Which framing?',answer:'Cedar',skipped:false}, {topic:'railings',question:'Include railings?',answer:'secret skipped answer',skipped:true}];
assert.equal(parse(JSON.stringify({questions:[{topic:'framing',question:'What framing material?'},{topic:'railings',question:'What railings?'},{topic:'tiers',question:'How many tiers?'},{topic:'TIERS',question:'Levels?'}]}),history).length,1);
for(const reply of ['no JSON','{}','{"questions":null}', JSON.stringify({questions:Array(5).fill({topic:'a',question:'b'})}), JSON.stringify({questions:[{topic:3,question:'b'}]}), JSON.stringify({questions:[{topic:'a',question:'b'.repeat(301)}]})]) assert.throws(()=>parse(reply,[]));
assert.equal(parse('{"questions":[]}',history).length,0);
const details = context.guidedDescriptionDetails('Build a deck',history);
assert(details.includes('Cedar'));
assert(!details.includes('secret skipped answer'));
assert(details.includes('Unspecified topics'));
assert(details.includes('Include railings?'));
assert(source.includes("refineMode:'guided_questions'"));
assert(source.includes("refineMode: request.guided ? 'guided_create' : request.mode"));
assert(source.includes('closed || token !== requestId'));
assert(source.includes('textareaEl._guidedVersion !== guidedVersion'));
assert(source.includes("okText:'Use Description', cancelText:'Keep Original'"));
assert(source.includes('if (request.sourceText === null) return;'));
const edge = fs.readFileSync('supabase/functions/ai-assistant/index.ts','utf8');
assert(edge.includes("name: 'description_questions'"));
assert(edge.includes('guidedDescription ||'));
console.log('Guided description parsing, duplicate filtering, skipped answers and source safeguards passed');

async function applyCase({approve=true, mutate=false, cancel=false}={}) {
 const textarea={id:'description',value:'Original',isConnected:true,closest:()=>null,dispatchEvent(){}};
 const button={innerHTML:'AI Refine',parentElement:null,setAttribute(){},removeAttribute(){}};
 let calls=0;
 const sandbox={document:{getElementById:()=>null},console,Event:class{},
  openAiDescriptionModeDialog:async()=>({guided:true,mode:'create_from_task',sourceText:'Build deck'}),
  openGuidedDescriptionDialog:async()=>cancel?null:'Confirmed cedar deck',
  buildAiDescriptionPrompt:()=>'',getSupabaseFunctionAuthHeaders:async()=>({}),
  fetch:async()=>{calls++; return {ok:true,json:async()=>({reply:'New description'})};},
  normalizeAiDescriptionReply:s=>s,qdAlert:()=>{},
  qdConfirm:async()=>{if(mutate)textarea.value='Manual edit';return approve;}};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(source.indexOf('async function refineDescription'),source.indexOf('function toggleRefinedDescription')),sandbox);
 await sandbox.refineDescription(textarea,button);
 assert.equal(textarea.value,mutate?'Manual edit':cancel||!approve?'Original':'New description');
 assert.equal(calls,cancel?0:1);
}
(async()=>{
 await applyCase(); await applyCase({approve:false}); await applyCase({mutate:true}); await applyCase({cancel:true});
 console.log('Guided generation approval, preview refusal, manual edit protection and cancellation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
