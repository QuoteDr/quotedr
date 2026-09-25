const fs=require('node:fs'),assert=require('node:assert/strict');
const dashboard=fs.readFileSync('dashboard.html','utf8');
const urlCode=dashboard.slice(dashboard.indexOf('        function portalUrlForDashboard('),dashboard.indexOf('        function getClientPortalBaseUrl('));
const urlFor=new Function('window','shortPortalUrlForDashboard','getClientPortalBaseUrl','getAdminPortalBaseUrl',urlCode+';return portalUrlForDashboard;')({location:{hostname:'quotedr.io'}},t=>'https://quotedr.io/p/'+t,()=> 'https://quotedr.io/client-portal.html',()=> 'https://quotedr.io/client-portal.html');
const portal={id:'portal-a',contractorId:'owner-a',clientEmail:'private@example.test',clientName:'Private Name'};
const url=urlFor(portal,'');
assert.equal(url,'https://quotedr.io/client-portal.html?portal_entry=1&contractor=owner-a&portal=portal-a');
assert(!url.includes('private'));assert(!url.includes('admin'));
assert.equal(urlFor({...portal,secureToken:'existing',secureAnchorId:'anchor'},''),'https://quotedr.io/p/existing');
assert(urlFor(portal,'',{admin:true}).includes('admin=1'));
const pinCode=dashboard.slice(dashboard.indexOf('        function renderPortalPinEditor('),dashboard.indexOf('        async function ensurePortalStableShare('));
const render=new Function('escapeHtml','jsAttr',pinCode+';return renderPortalPinEditor;')(s=>s,s=>JSON.stringify(s));
const html=render({...portal,pin:'1234',quotes:[]},url);
assert(html.includes(url));assert(html.includes('Copy Link'));assert(!html.includes('disabled'));assert(!html.includes('Add a document'));
const toggle=dashboard.slice(dashboard.indexOf('        async function togglePortalPinEditor('),dashboard.indexOf('        async function copyPortalPinBundle('));
assert(toggle.includes("!String(portalId).startsWith('legacy-')"));
const copy=dashboard.slice(dashboard.indexOf('        async function copyPortalPinBundle('),dashboard.indexOf('        async function changePortalPin('));
assert(copy.includes("if (String(portal.id).startsWith('legacy-')) await ensurePortalStableShare(portal)"));assert(copy.includes('Clipboard access was blocked'));
const client=fs.readFileSync('client-portal.html','utf8');
assert(client.includes("if (!session) return; // No customer document information before verified PIN access."));
assert(client.includes("if (portalEntry) await loadQuotes();"));
assert(client.includes("error.code==='pin_required'"));
console.log('PASS empty portal copy enabled, no identity in URL, legacy links preserved, no quote creation while copying, PIN session and clipboard guards');
const begin=client.indexOf('        if (portalEntry && !portalIsAdminView && !portalToken)'),end=client.indexOf('        if (portalDesignShare)',begin);
const load=new Function('context','with(context){return (async()=>{'+client.slice(begin,end)+'return "continue";})()}');
async function exercise(session,result){
 let calls=0,empty=false;const nodes={pinGate:{style:{}},portalContent:{style:{}},pinError:{}};
 const context={portalEntry:true,portalIsAdminView:false,portalToken:'',portalAnchorId:'',portalResolvedClientName:'',portalQuotesCache:[],clientNameEl:{},titleCase:s=>s,portalDesignSessionKey:()=> 'session',sessionStorage:{getItem:()=>session,removeItem:()=>{session=null;}},document:{getElementById:id=>nodes[id]},noQuotesEl:{classList:{remove:()=>{empty=true;}}},portalDesignRequest:async()=>{calls++;if(result instanceof Error)throw result;return result;}};
 await load(context);return {context,calls,empty,nodes,session};
}
(async()=>{
 assert.equal((await exercise(null,{})).calls,0);
 let out=await exercise('valid',{name:'Empty project',token:null});assert(out.empty);assert.equal(out.context.clientNameEl.textContent,'Empty project');
 out=await exercise('valid',{name:'Published project',token:'secure',anchorId:'anchor'});assert.equal(out.context.portalToken,'secure');assert.equal(out.context.portalAnchorId,'anchor');assert(!out.empty);
 out=await exercise('expired',Object.assign(new Error('PIN required'),{code:'pin_required'}));assert.equal(out.session,null);assert.equal(out.nodes.pinGate.style.display,'flex');assert.equal(out.nodes.portalContent.style.display,'none');
 console.log('PASS actual portal entry loader: no pre-PIN request, empty state, later document credentials, expired-session re-unlock');
})().catch(error=>{console.error(error);process.exitCode=1;});
