const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('quote-builder.html','utf8');
const code=src.slice(src.indexOf('async function makeQuoteItemsOptional('),src.indexOf('async function applyMarkupToRoomItems('));
function setup(){
 let undo=0,finish=0,allowed=true,alerts=[],message='';
 const ctx={rooms:[{id:1,items:[{name:'required',quantity:2,rate:100},{name:'optional',optional:true,optionalSelectedByDefault:false},{name:'choices',choiceGroup:{required:true,selectedOptionIds:['a'],options:[{id:'a'}]}}]},{id:2,items:[{name:'another'}, {_coRemoved:true,name:'removed'}]}],
  quoteBuilderRoomById:id=>ctx.rooms.find(r=>r.id===id),getSelectedRoomItemIndexes:()=>[0,1,2],qdAlert:async m=>alerts.push(m),
  qdConfirm:async m=>{message=m;return allowed;},_pushUndo:()=>undo++,finishRoomBulkItemAction:()=>finish++,quoteBuilderIsChangeOrderMode:()=>false};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,counters:()=>({undo,finish}),cancel:()=>allowed=false,alerts,message:()=>message};
}
(async()=>{
 let f=setup();await f.ctx.makeQuoteItemsOptional(1,false);
 assert.equal(f.ctx.rooms[0].items[0].optional,true);assert.equal(f.ctx.rooms[0].items[0].optionalSelectedByDefault,true);
 assert.equal(f.ctx.rooms[0].items[0].rate,100);assert.equal(f.ctx.rooms[0].items[1].optionalSelectedByDefault,false);
 assert.equal(f.ctx.rooms[0].items[2].choiceGroup.required,false);assert.deepEqual(f.ctx.rooms[0].items[2].choiceGroup.selectedOptionIds,['a']);
 assert.equal(f.ctx.rooms[1].items[0].optional,undefined);assert.deepEqual(f.counters(),{undo:1,finish:1});
 await f.ctx.makeQuoteItemsOptional(1,false);assert.equal(f.counters().undo,1,'already optional is a no-op');
 f=setup();await f.ctx.makeQuoteItemsOptional(1,true);assert.equal(f.ctx.rooms[1].items[0].optional,true);assert.equal(f.ctx.rooms[1].items[1].optional,undefined);assert.match(f.message(),/ALL rooms/);assert.equal(f.counters().undo,1);
 f=setup();f.cancel();await f.ctx.makeQuoteItemsOptional(1,true);assert.equal(f.ctx.rooms[0].items[0].optional,undefined);assert.equal(f.counters().undo,0);
 f=setup();f.ctx.getSelectedRoomItemIndexes=()=>[];await f.ctx.makeQuoteItemsOptional(1,false);assert.equal(f.counters().undo,0);assert.equal(f.alerts.length,1);
 f=setup();f.ctx.rooms[0].items[0].optionalSelectedByDefault=false;f.ctx.rooms[0].items[0]._optionalSelected=true;await f.ctx.makeQuoteItemsOptional(1,false);assert.equal(f.ctx.rooms[0].items[0].optionalSelectedByDefault,true,'required items remain included even if they carry an old optional default');assert.equal(f.ctx.rooms[0].items[0]._optionalSelected,true);
 assert(src.includes('onclick="makeQuoteItemsOptional(\' + room.id + \', false)'));assert(src.includes('Make Entire Quote Optional...'));
 console.log('Bulk Optional: room/all-quote scope, group optionality, preserved defaults/prices, skipped removals, cancel and one Undo passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
