const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('quote-items.js','utf8');
let pending,posted,alerts=[];
const undo={style:{}},button={innerHTML:'Refine',parentElement:{querySelector:()=>undo},setAttribute(){},removeAttribute(){}},note={id:'lineNotes',value:'Extra 23 sq ft',dispatchEvent(){}};
const ctx={openAiDescriptionModeDialog:async text=>({mode:'refine_existing',sourceText:text}),buildAiDescriptionPrompt:()=> 'Refine supplied text.',getSupabaseFunctionAuthHeaders:async()=>({}),
 fetch:async(url,options)=>{posted=JSON.parse(options.body);return await new Promise(resolve=>pending=resolve);},normalizeAiDescriptionReply:text=>text,qdAlert:text=>alerts.push(text),Event,console};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function refineDescription('),source.indexOf('function toggleRefinedDescription(')),ctx);
async function begin(){const running=ctx.refineDescription(note,button);while(!pending)await new Promise(resolve=>setImmediate(resolve));return {running};}
(async()=>{
 let request=await begin();assert.match(posted.messages[0].content,/job-specific note/);
 pending({ok:true,json:async()=>({reply:'An additional 23 sq ft is required.'})});await request.running;
 assert.equal(note.value,'An additional 23 sq ft is required.');assert.equal(undo._previousDescription,'Extra 23 sq ft');assert.equal(undo._showingRefined,true);
 pending=null;request=await begin();note.value='Manually edited while waiting';pending({ok:true,json:async()=>({reply:'stale result'})});await request.running;
 assert.equal(note.value,'Manually edited while waiting');assert(alerts.length);
 pending=null;request=await begin();note._refineRequestId++;pending({ok:true,json:async()=>({reply:'wrong item'})});await request.running;
 assert.equal(note.value,'Manually edited while waiting');assert.equal(button.disabled,false);
 console.log('Job-note refinement, undo capture, manual edit and editor-switch guards passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
