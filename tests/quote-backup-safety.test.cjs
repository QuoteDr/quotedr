const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const api = fs.readFileSync('supabase-v2.js', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');
let pages, ranges, team = false, authenticated = true, teamResult;
const query = {select(){return this;},eq(key,id){assert.equal(key,'user_id');assert.equal(id,'owner');return this;},order(){return this;},range(a,b){ranges.push([a,b]);return pages.shift();}};
const ctx = {getCurrentUser:async()=>authenticated ? {id:'owner'} : null,qdUsesTeamAccountApi:async()=>team,
 qdTeamAccountCall:async(action,args)=>{assert.equal(action,'quotes.list');assert.equal(args.limit,500);return teamResult;},
 _supabase:{from(table){assert.equal(table,'quotes');return query;}}};
vm.createContext(ctx);
vm.runInContext(api.slice(api.indexOf('async function listQuotesForBackup()'),api.indexOf('async function listQuotes()')),ctx);
let cloudWrites=0, deviceWrites=0, failDevice=false, status;
const review = {window:{_quoteBackupReviewOnly:true},quoteStoragePortalExitActive:()=>false,quoteStorageHasOpenDocument:()=>true,
 unsavedChanges:true,document:{getElementById:()=>null},collectQuoteData:()=>({rooms:[{items:[{}]}],_backupReviewOnly:true}),
 localStorage:{setItem(){if(failDevice)throw Error('quota');deviceWrites++;}},updateSaveStatus:(...args)=>status=args,
 saveQuoteToSupabase:async()=>{cloudWrites++;}};
vm.createContext(review);
vm.runInContext(storage.slice(storage.indexOf('async function doAutoSave(options)'),storage.indexOf('window.qdSaveBeforeNavigation =')),review);
(async()=>{
 ranges=[];pages=[{count:201,data:Array.from({length:200},(_,id)=>({id}))},{count:201,data:[{id:200}]}];
 assert.equal((await ctx.listQuotesForBackup()).data.length,201);assert.deepEqual(ranges,[[0,199],[200,399]]);
 for(const bad of [{count:202,data:[]},{count:201,data:[]},{data:[]}]){
  pages=[{count:201,data:Array(200).fill({})},bad];assert((await ctx.listQuotesForBackup()).error);
 }
 team=true;teamResult={data:Array(500).fill({})};assert((await ctx.listQuotesForBackup()).error);
 teamResult={data:[{id:1}]};assert.equal((await ctx.listQuotesForBackup()).data.length,1);
 authenticated=false;assert((await ctx.listQuotesForBackup()).error);
 assert.equal((await review.doAutoSave()).state,'local_saved');assert.equal(cloudWrites,0);assert.equal(deviceWrites,2);
 failDevice=true;assert.equal((await review.doAutoSave()).state,'local_failed');assert.equal(status[0],'error');assert.equal(cloudWrites,0);
 assert(storage.includes('_backupReviewOnly: !!window._quoteBackupReviewOnly'));
 assert(storage.includes('window._quoteBackupReviewOnly = !!data._backupReviewOnly'));
 console.log('Backup pagination, permissions, review-only autosave and device-failure checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
