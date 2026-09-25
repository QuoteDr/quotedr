import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('client-portal.html','utf8');
const start=html.indexOf('    async function getContractorName()');
const end=html.indexOf('\n    function ',start);
const source=html.slice(start,end);
for (const designOnly of [false,true]) {
  let unlocked=false, applied, calls=0;
  const context={console,portalEntry:!designOnly,portalDesignShare:designOnly,portalIsAdminView:false,
    portalToken:null,portalAnchorId:null,portalCompanyName:'',portalBusinessLogoSrc:'',portalDefaultTheme:{},
    contractorNameEl:{textContent:''},sessionStorage:{getItem:()=>unlocked?'session':null},portalDesignSessionKey:()=> 'key',
    portalDesignRequest:async()=>{calls++;return {branding:{businessProfile:{business_name:'Test Builder'},businessLogo:'https://example.com/logo.png',portalTheme:{layoutStyle:'client-hub'}},theme:{headerColor:'#abcdef'}};},
    getLocalDevPortalBranding:()=>({}),renderPortalLogo:()=>{},renderBusinessHeader:()=>{},normalizePortalTheme:x=>x,
    mergePortalTheme:(a,b)=>({...a,...b}),applyPortalTheme:x=>{applied=x;}};
  vm.createContext(context);
  vm.runInContext(source,context);
  await context.getContractorName();assert.equal(calls,0,'No branding read before PIN');
  unlocked=true;await context.getContractorName();
  assert.equal(context.contractorNameEl.textContent,'Test Builder');
  assert.equal(applied.layoutStyle,'client-hub');assert.equal(applied.headerColor,'#abcdef');
  assert.equal(context.portalBusinessLogoSrc,'https://example.com/logo.png');
}
assert.match(html,/if \(portalEntry \|\| portalDesignShare\) await getContractorName\(\);/);
console.log('PASS: quote-free and design-only branding before/after PIN, default theme and override');
