import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {verifiedActivityLocation} from '../supabase/functions/_shared/activity-location.mjs';
const workerSource = fs.readFileSync(new URL('../_worker.js', import.meta.url),'utf8');
const {default:worker} = await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'));
const secret = 'synthetic-test-secret-not-a-production-key';
const body = {action:'log_event',documentId:'synthetic',token:'fixture',eventType:'document_opened',metadata:{location_city:'Spoofed'}};
let calls = 0, forwarded;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect,'manual');
    calls++; forwarded = new Request(url,options);
    return Response.json({event:{id:'fixture'}});
};
function req(data = body, cf = {city:'Oakville',region:'Ontario',country:'CA',latitude:'not stored',postalCode:'not stored'}) {
    const r = new Request('https://example.test/api/document-activity',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic',apikey:'synthetic','cf-connecting-ip':'not forwarded','user-agent':'not forwarded','x-qdr-location':'spoofed'},body:JSON.stringify(data)});
    Object.defineProperty(r,'cf',{value:cf}); return r;
}
try {
    const result = await worker.fetch(req(), {QDR_ACTIVITY_LOCATION_SECRET:secret});
    assert.equal(result.status,200); assert.equal(calls,1);
    assert.equal(forwarded.url,'https://axmoffknvblluibuitrq.supabase.co/functions/v1/client-document');
    assert.equal(forwarded.headers.get('cf-connecting-ip'),null);
    assert.equal(forwarded.headers.get('user-agent'),null);
    const loc = await verifiedActivityLocation(forwarded,body,secret);
    assert.deepEqual(loc,{location_city:'Oakville',location_region:'Ontario',location_country:'CA',location_source:'cloudflare_approximate'});
    for(const data of [{action:'design_review',operation:'problem'}, {action:'design_review',operation:'open'}, {action:'track_activity',event:'portal_visited'}, {action:'track_activity',event:'model_visible'}, {action:'location_check'}]) {
        await worker.fetch(req(data),{QDR_ACTIVITY_LOCATION_SECRET:secret});
        assert.equal((await verifiedActivityLocation(forwarded,data,secret)).location_city,'Oakville');
        assert(forwarded.url.endsWith(data.action==='track_activity'?'/portal-designs':'/client-document'));
    }
    await worker.fetch(req(),{QDR_ACTIVITY_LOCATION_SECRET:secret});
    assert.deepEqual(await verifiedActivityLocation(forwarded,{...body,documentId:'other'},secret),{});
    assert.deepEqual(await verifiedActivityLocation(forwarded,body,'wrong-secret-with-at-least-32-characters'),{});
    assert.deepEqual(await verifiedActivityLocation(forwarded,body,secret,Date.now()+120000),{});
    assert.deepEqual(await verifiedActivityLocation(req(),body,secret),{});
    const before = calls;
    assert.equal((await worker.fetch(req(),{})).headers.get('X-QDR-Activity-Proxy'),'not-forwarded');
    assert.equal((await worker.fetch(req({action:'document_activity'}),{QDR_ACTIVITY_LOCATION_SECRET:secret})).status,400);
    assert.equal((await worker.fetch(req({...body,large:'x'.repeat(17000)}),{QDR_ACTIVITY_LOCATION_SECRET:secret})).status,413);
    assert.equal(calls,before);
    await worker.fetch(req(body,{}),{QDR_ACTIVITY_LOCATION_SECRET:secret});
    assert.deepEqual(await verifiedActivityLocation(forwarded,body,secret),{});
    const staticResult = await worker.fetch(new Request('https://example.test/dashboard.html'),{ASSETS:{fetch:()=>new Response('static')}});
    assert.equal(await staticResult.text(),'static');
    globalThis.fetch = async()=>{throw Error('offline');};
    assert.equal((await worker.fetch(req(),{QDR_ACTIVITY_LOCATION_SECRET:secret})).headers.get('X-QDR-Activity-Proxy'),'forwarded');
    globalThis.fetch = async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.test'}});
    assert.equal((await worker.fetch(req(),{QDR_ACTIVITY_LOCATION_SECRET:secret})).status,502);
} finally { globalThis.fetch = originalFetch; }
const scope = {Intl}; vm.createContext(scope);
vm.runInContext(fs.readFileSync(new URL('../portal-activity-visits.js',import.meta.url),'utf8'),scope);
assert.match(scope.QuoteDrActivityVisits.locationDetails({}),/Location unavailable/);
assert.match(scope.QuoteDrActivityVisits.locationDetails({metadata:{location_city:'spoof'}}),/Location unavailable/);
const html = scope.QuoteDrActivityVisits.locationDetails({metadata:{location_source:'cloudflare_approximate',location_city:'<img onerror=bad>',location_region:'Ontario',location_country:'CA'}});
assert(!html.includes('<img')); assert(html.includes('Canada')); assert(html.includes('not GPS'));
const edge = fs.readFileSync(new URL('../supabase/functions/client-document/index.ts',import.meta.url),'utf8');
assert(edge.includes("if (key.startsWith('location_')) delete activityMetadata[key]"));
console.log('Activity location relay: signed payload, tampering, expiry, no location, privacy, size limits, static fallback and escaping passed');
