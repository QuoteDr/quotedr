const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase-v2.js','utf8');
const save=source.slice(source.indexOf('async function saveQuote(quoteData)'),source.indexOf('// Get all invoices',source.indexOf('async function saveQuote(quoteData)')));
const storage=fs.readFileSync('quote-storage.js','utf8');
const restore=storage.slice(storage.indexOf('var restoredHighlightLegend ='),storage.indexOf('window._quoteServerUpdatedAt =',storage.indexOf('var restoredHighlightLegend =')));
const rows=new Map();
const ctx={console,window:{},getCurrentUser:async()=>({id:'test-owner'}),qdNormalizeQuoteIdentityForSave(){},verifyQuoteIsEditableBeforeSave:async()=>({editable:true}),qdAdoptOwnLatestQuoteVersion(){},prepareQuoteMediaForCloudSave:async()=>{},quoteFullResolutionPhotosEnabledForSave:async()=>false,qdCaptureOnce(){},qdAnalyticsBucketMoney(){},qdDurableSupabaseOperation:async op=>{rows.set(op.entityId,JSON.parse(JSON.stringify(op.target.values.data)));return {data:{id:op.entityId}}}};
vm.createContext(ctx);vm.runInContext(save,ctx);
function load(id){ctx.data=rows.get(id);vm.runInContext(restore,ctx);return JSON.parse(JSON.stringify(ctx.window._quoteHighlightLegend));}
(async()=>{
 const a={supabaseId:'A',highlightLegend:{yellow:'Scope changed',orange:'New item'},rooms:[{items:[{highlightColor:'orange',highlightDescriptionOnItem:false}]}]};
 await ctx.saveQuote(a);
 await ctx.saveQuote({...a,highlightDisplayDefaults:{orange:false}});
 await ctx.saveQuote({supabaseId:'B',highlightLegend:{yellow:'Different meaning'}});
 assert.deepEqual(load('A'),a.highlightLegend);
 assert.equal(ctx.window._quoteHighlightDisplayDefaults.orange,false);
 assert.deepEqual(load('B'),{yellow:'Different meaning'});
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.window._quoteHighlightDisplayDefaults)),{},'another quote does not inherit defaults');
 assert.deepEqual(load('A'),a.highlightLegend,'A → B → A preserves quote-local wording');
 assert.equal(rows.get('A').rooms[0].items[0].highlightDescriptionOnItem,false);
 await ctx.saveQuote({...a,highlightLegend:{},changeOrderHighlightLegend:{}});
 assert.deepEqual(load('A'),{},'intentional clearing survives');
 await ctx.saveQuote({supabaseId:'legacy',changeOrderHighlightLegend:{orange:'Legacy explanation'}});
 assert.deepEqual(load('legacy'),{orange:'Legacy explanation'});
 await ctx.saveQuote({supabaseId:'empty'});assert.deepEqual(load('empty'),{});
 console.log('Actual cloud payload and restore: A/B/A, legacy, clear, empty, and per-item display passed');
})().catch(e=>{console.error(e);process.exitCode=1});
