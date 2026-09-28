// Verified coarse location only. No GPS, raw IP, user-agent, or client metadata trust.
export async function verifiedActivityLocation(req, body, secret, now = Date.now()) {
    if (!secret || secret.length < 32) return {};
    try {
        const encoded = req.headers.get('x-qdr-location') || '';
        const hex = req.headers.get('x-qdr-location-signature') || '';
        if (encoded.length > 2048 || !/^[a-f0-9]{64}$/.test(hex)) return {};
        const proof = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c=>c.charCodeAt(0))));
        if (!Number.isFinite(proof.at) || Math.abs(now - proof.at) > 60000) return {};
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
        const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(hex.match(/../g), b=>parseInt(b,16)), new TextEncoder().encode(encoded + '\n' + JSON.stringify(body)));
        if (!valid) return {};
        const clean = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100) : '';
        const city = clean(proof.location?.city), region = clean(proof.location?.region);
        const country = /^[A-Z]{2}$/.test(proof.location?.country || '') ? proof.location.country : '';
        if (!city && !region && !country) return {};
        return {location_city:city, location_region:region, location_country:country, location_source:'cloudflare_approximate'};
    } catch { return {}; }
}
