const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('dashboard.html','utf8');
for(const [,attributes,script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|type="module"|application\/ld\+json/.test(attributes))new vm.Script(script);
const selection=html.slice(html.indexOf('        var dashboardQuoteSelection'),html.indexOf('        function renderQuotes'));
const move=html.slice(html.indexOf('        async function moveDashboardQuoteToJunk'),html.indexOf('        function openJunkBox'));
function harness(){
 const controls={},calls=[],alerts=[];
 const rows=['a','b','c'].map(id=>({id,quote_number:id,data:{portal_visible:true},client_name:'Test'}));
 const c={Set,Date,Error,console,window:{currentQuotes:rows.slice(0,2)},allQuotes:rows,junkQuotes:[],JUNK_RETENTION_DAYS:30,JUNK_RETENTION_MS:30*86400000,
 document:{getElementById:id=>controls[id]||(controls[id]={}),querySelectorAll:()=>[]},getQuoteTitle:q=>q.id,
 qdConfirm:async()=>true,qdAlert:async s=>alerts.push(s),loadDashboardFullQuote:async q=>q,dashboardPortalForDocument:()=>({}),
 preparePortalDocumentForJunk:async q=>{calls.push('preserve:'+q.id);return {...q.data,portal_visible:false};},
 qdDurableQuoteRowUpdate:async(id,patch)=>{calls.push('write:'+id);assert.equal(patch.data.portal_visible,false);return id==='b'?{error:new Error('conflict')}:{error:null};},
 renderDashboardResults:()=>{},updateStats:()=>{},updateJunkBadge:()=>{}};
 vm.createContext(c);vm.runInContext(selection+move,c);return {c,calls,alerts};
}
(async()=>{
 let {c,calls,alerts}=harness();c.selectVisibleDashboardQuotes();assert.equal(c.dashboardQuoteSelection.size,2);
 c.window.currentQuotes=[c.allQuotes[0]];c.updateDashboardQuoteSelection();assert.deepEqual([...c.dashboardQuoteSelection],['a'],'filter removes hidden selections');
 c.window.currentQuotes=c.allQuotes.slice(0,2);c.selectVisibleDashboardQuotes();
 let confirmations=0;c.qdConfirm=async text=>{confirmations++;assert.match(text,/Payment records are not cancelled/);return true;};
 await c.junkSelectedDashboardQuotes();assert.equal(confirmations,1);assert.deepEqual(calls,['preserve:a','write:a','preserve:b','write:b']);
 assert.deepEqual([...c.dashboardQuoteSelection],['b']);assert.equal(c.junkQuotes.length,1);assert.equal(c.allQuotes.length,2);assert.match(alerts[0],/1 could not be moved/);assert.equal(c.dashboardBulkBusy,false);
 ({c,calls}=harness());c.selectVisibleDashboardQuotes();c.qdConfirm=async()=>false;await c.junkSelectedDashboardQuotes();assert.equal(calls.length,0);assert.equal(c.dashboardBulkBusy,false);
 ({c,calls}=harness());c.selectVisibleDashboardQuotes();c.preparePortalDocumentForJunk=async()=>{throw Error('portal conflict');};await c.junkSelectedDashboardQuotes();assert.equal(calls.length,0);assert.equal(c.junkQuotes.length,0);
 ({c,calls}=harness());c.selectVisibleDashboardQuotes();let resolve;c.qdConfirm=()=>new Promise(r=>resolve=r);const pending=c.junkSelectedDashboardQuotes();await c.junkSelectedDashboardQuotes();assert.equal(calls.length,0);resolve(false);await pending;
 console.log('PASS: syntax, visible selection, cancel, partial failures, portal preservation and double-submit protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
