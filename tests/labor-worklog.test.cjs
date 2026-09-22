const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('labor-worklog.js','utf8'),context);
const api=context.window.QuoteDrLaborWorklog;
const quote={data:{rooms:[{id:7,name:'Basement',items:[{description:'Drywall',category:'Walls',unitType:'sq ft',quantity:100,laborTime:{mode:'units_per_hour',unitsPerHour:10,crewSize:2}},{description:'Removed',_removed:true}]}]}};
const item=api.items(quote)[0];assert.equal(api.items(quote).length,1);
const input={date:'2026-09-20',elapsed:4,crew:2,quantity:80,kind:'normal',quoteId:'quote-a',notes:'Boarded walls'};
const row=api.makeRow(input,item,'user-a','op-a');
assert.equal(row.hours,8);assert.equal(row.units_per_hour,10);assert.equal(row.reviewed,false);assert.equal(row.raw_payload.status,'pending');
assert.equal(api.estimatedHours(item,80),8); // Labour-hours, not four-hour crew duration.
assert.equal(api.suggestions([row]).length,0);
const approved={...row,reviewed:true,raw_payload:{...row.raw_payload,status:'approved'}};
const second={...approved,hours:2,raw_payload:{...approved.raw_payload,completedQuantity:40}};
assert.equal(api.suggestions([approved,second])[0].unitsPerHour,12); // Weighted, not average of rates.
for(const kind of ['rework','extra_scope','waiting'])assert.equal(api.suggestions([{...approved,raw_payload:{...approved.raw_payload,kind}}]).length,0);
assert.equal(api.suggestions([{...approved,item_unit:'lf'},approved]).length,2);
assert.equal(api.suggestions([{...approved,raw_payload:{...approved.raw_payload,status:'rejected'}}]).length,0);
assert.equal(api.suggestions([{...approved,raw_payload:{}}]).length,0); // Legacy unreviewed learning excluded.
for(const patch of [{elapsed:0},{elapsed:Infinity},{crew:1.5},{quantity:0},{kind:'invented'},{date:'2026-02-30'},{elapsed:0.001}])assert.throws(()=>api.makeRow({...input,...patch},item,'user','op'));
quote.data.rooms[0].items[0].laborTime.unitsPerHour=999;assert.equal(item.labor.unitsPerHour,10);
const source=fs.readFileSync('labor-worklog.js','utf8');
assert.match(source,/\.eq\('user_id',user.id\)/);assert.match(source,/crypto.randomUUID\(\)/);
assert.match(source,/\.eq\('updated_at',row.updated_at\)/);
assert.doesNotMatch(source,/\.from\('labor_item_production_rates'\)|service_role|\.from\('items'\)/);
console.log('Labour work logs: allocation, estimate snapshot, weighted approved-only suggestions, exclusions, validation and owner filters passed');
