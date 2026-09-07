const encoder = new TextEncoder();
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
async function key(secret) {
  if (!secret) throw new Error('Portal session service unavailable');
  return crypto.subtle.importKey('raw', encoder.encode('portal-design-session-v1:' + secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
export async function issueDesignSession(secret, owner, portal, pin, now = Date.now()) {
  const payload = btoa(JSON.stringify({ owner, portal, pin:await digest(secret + ':pin:' + pin), expires:now + 8 * 60 * 60 * 1000 }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)));
  return payload + '.' + btoa(String.fromCharCode(...signature));
}
export async function verifyDesignSession(secret, token, owner, portal, pin, now = Date.now()) {
  try {
    if (!pin || typeof token !== 'string' || token.length > 2000) return false;
    const [payload, signature, extra] = token.split('.');
    if (extra || !await crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(atob(signature), c=>c.charCodeAt(0)), encoder.encode(payload))) return false;
    const value = JSON.parse(atob(payload));
    return value.owner === owner && value.portal === portal && value.pin === await digest(secret + ':pin:' + pin) && value.expires > now && value.expires <= now + 8*60*60*1000;
  } catch { return false; }
}

// One current PIN, chosen from the latest portal record. Old copies never unlock designs.
export async function currentDesignPortal(db, owner, portal) {
  const [quotes, registry] = await Promise.all([
    db.from('quotes').select('data,updated_at').eq('user_id',owner).eq('data->>portal_id',portal).order('updated_at',{ascending:false}),
    db.from('user_data').select('value,updated_at').eq('user_id',owner).eq('key','client_portals').maybeSingle()
  ]);
  if (quotes.error || registry.error) throw new Error('Portal access is temporarily unavailable');
  const records = (quotes.data || []).filter(q=>q.data?.portal_visible === true || q.data?.portal_anchor_only === true).map(q=>({
    name:q.data.portal_name || 'Client Portal', pin:String(q.data.portal_pin || ''), updated:q.updated_at
  }));
  const saved = Array.isArray(registry.data?.value) ? registry.data.value.find(p=>p.id === portal) : null;
  if (saved) records.push({ name:saved.name, pin:String(saved.pin || ''), updated:saved.updatedAt || saved.createdAt });
  records.sort((a,b)=>new Date(b.updated || 0)-new Date(a.updated || 0));
  return records[0] || null;
}
