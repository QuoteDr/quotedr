// Only activity writes use this route. All other traffic remains static Pages assets.
// Never forward visitor IP/device headers or trust browser-supplied location.
const UPSTREAM = 'https://axmoffknvblluibuitrq.supabase.co/functions/v1/client-document';
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '';
function reply(message, status, forwarded = false) {
    return Response.json({error: message}, {status, headers: {'Cache-Control': 'no-store', 'X-QDR-Activity-Proxy': forwarded ? 'forwarded' : 'not-forwarded'}});
}
export default {
    async fetch(request, env) {
        if (new URL(request.url).pathname !== '/api/document-activity') return env.ASSETS.fetch(request);
        if (request.method !== 'POST') return reply('Method not allowed', 405);
        if (!env.QDR_ACTIVITY_LOCATION_SECRET || env.QDR_ACTIVITY_LOCATION_SECRET.length < 32) return reply('Activity location not configured', 503);
        if (!request.headers.get('content-type')?.includes('application/json')) return reply('JSON required', 415);
        // Bound untrusted input even when Content-Length is absent or inaccurate.
        const reader = request.body?.getReader();
        if (!reader) return reply('Missing body', 400);
        const chunks = []; let bytes = 0;
        while (true) {
            const {done, value} = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > 16384) { await reader.cancel(); return reply('Activity too large', 413); }
            chunks.push(value);
        }
        const raw = new Uint8Array(bytes); let offset = 0;
        for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
        let body;
        try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return reply('Invalid JSON', 400); }
        const designReview = body?.action === 'design_review' && ['open','duration','continue','problem'].includes(body.operation);
        const portalActivity = body?.action === 'track_activity';
        if (!body || !(body.action === 'log_event' || designReview || portalActivity || body.action === 'location_check')) return reply('Unsupported action', 400);
        const cf = request.cf || {};
        const location = {city: clean(cf.city), region: clean(cf.region), country: /^[A-Z]{2}$/.test(cf.country || '') && !['XX','T1'].includes(cf.country) ? cf.country : ''};
        const proof = JSON.stringify({at: Date.now(), location});
        const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(proof)));
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.QDR_ACTIVITY_LOCATION_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
        const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded + '\n' + JSON.stringify(body)));
        const headers = new Headers({'Content-Type':'application/json', 'X-QDR-Location':encoded, 'X-QDR-Location-Signature':Array.from(new Uint8Array(signature), b=>b.toString(16).padStart(2,'0')).join('')});
        for (const name of ['authorization','apikey']) { const value = request.headers.get(name); if (value) headers.set(name,value); }
        try {
            const response = await fetch(portalActivity ? UPSTREAM.replace('/client-document','/portal-designs') : UPSTREAM, {method:'POST', headers, body:JSON.stringify(body), redirect:'manual'});
            if(response.status>=300 && response.status<400)return reply('Activity upstream redirect refused',502,true);
            const outputHeaders = new Headers({'Content-Type':response.headers.get('Content-Type') || 'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-QDR-Activity-Proxy':'forwarded'});
            for (const name of ['X-Design-Kind','X-Design-Mime']) if(response.headers.has(name))outputHeaders.set(name,response.headers.get(name));
            return new Response(response.body, {status:response.status, headers:outputHeaders});
        } catch { return reply('Activity request unavailable', 502, true); }
    }
};
