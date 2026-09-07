import { ACCOUNT_PERMISSION, AccountAccessError, requireAccountPermissionWithDefault, serviceClient } from '../_shared/account-authorization.ts';
import { currentDesignPortal, verifyDesignSession } from '../_shared/portal-design-session.mjs';
import { designInput, MAX_DESIGN_BYTES } from '../../../portal-design-policy.mjs';

const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Content-Type':'application/json' };
const json = (data:unknown, status=200) => new Response(JSON.stringify(data), {status,headers});
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const publicFields = 'id,project,title,note,version,kind,mime_type,size_bytes,visible,created_at,updated_at';

export async function handleDesignRequest(req:Request) {
  if (req.method === 'OPTIONS') return new Response('ok',{headers});
  if (req.method !== 'POST') return json({error:'POST required'},405);
  try {
    // Bound both the declared and actual body; never download a caller-supplied URL.
    if (Number(req.headers.get('content-length')) > MAX_DESIGN_BYTES*1.4) return json({error:'File too large'},413);
    const raw = await req.text();
    if (raw.length > MAX_DESIGN_BYTES*1.4) return json({error:'File too large'},413);
    const body = JSON.parse(raw);
    const db = serviceClient();
    const action = String(body.action || 'list');
    if (action === 'resolve') {
      if (!/^[a-f0-9]{48}$/.test(body.shareToken || '')) return json({error:'Invalid portal link'},404);
      const result = await db.from('portal_design_libraries').select('user_id,portal_id').eq('share_token',body.shareToken).maybeSingle();
      if (result.error) throw result.error;
      const lib = result.data;
      const portal = lib && await currentDesignPortal(db, lib.user_id, lib.portal_id);
      if (!portal) return json({error:'This portal is no longer available'},404);
      // No asset metadata, PIN, or files are sent before authentication.
      return json({contractorId:lib.user_id,portalId:lib.portal_id,name:portal.name});
    }
    const owner = String(body.contractorId || '');
    const portalId = String(body.portalId || '');
    if (!/^[a-f0-9-]{36}$/i.test(owner) || !portalId || portalId.length > 180) return json({error:'Invalid portal'},400);
    const write = ['save','visibility','share','rotate_share'].includes(action);
    const ownerMode = body.ownerMode === true;
    if (ownerMode) {
      const auth = await requireAccountPermissionWithDefault(req, body.accountId, write ? ACCOUNT_PERMISSION.QUOTES_SEND : ACCOUNT_PERMISSION.QUOTES_READ);
      if (auth.ownerUserId !== owner) return json({error:'Portal access denied'},403);
    } else if (write) return json({error:'Contractor access required'},403);
    const portal = await currentDesignPortal(db,owner,portalId);
    if (!portal) return json({error:'Portal not found'},404);
    if (!ownerMode && !await verifyDesignSession(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),body.session,owner,portalId,portal.pin)) return json({error:'Unlock the portal again to view designs.',code:'pin_required'},401);

    let result = await db.from('portal_design_libraries').select('*').eq('user_id',owner).eq('portal_id',portalId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data && ownerMode && write) {
      const created = await db.from('portal_design_libraries').upsert({user_id:owner,portal_id:portalId,share_token:randomToken()},{onConflict:'user_id,portal_id',ignoreDuplicates:true});
      if (created.error) throw created.error;
      result = await db.from('portal_design_libraries').select('*').eq('user_id',owner).eq('portal_id',portalId).single();
      if (result.error) throw result.error;
    }
    const library = result.data;
    if (!library) return action === 'list' ? json({designs:[]}) : json({error:'Design not found'},404);
    if (action === 'share' || action === 'rotate_share') {
      if (!/^\d{4}$/.test(portal.pin)) return json({error:'Set a four-digit portal PIN before sharing designs.'},400);
      let token = library.share_token;
      if (action === 'rotate_share') {
        token = randomToken();
        const changed = await db.from('portal_design_libraries').update({share_token:token}).eq('id',library.id);
        if (changed.error) throw changed.error;
      }
      return json({shareToken:token});
    }
    if (action === 'list') {
      let query = db.from('portal_designs').select(publicFields).eq('library_id',library.id).order('created_at',{ascending:false});
      if (!ownerMode) query = query.eq('visible',true);
      const rows = await query;
      if (rows.error) throw rows.error;
      return json({designs:rows.data || []});
    }
    let previous = null;
    if (body.id) {
      const found = await db.from('portal_designs').select('*').eq('library_id',library.id).eq('id',body.id).maybeSingle();
      if (found.error) throw found.error;
      previous = found.data;
      if (!previous || (!ownerMode && !previous.visible)) return json({error:'Design not found'},404);
    }
    if (action === 'read' && previous) {
      if (previous.kind === 'link') return json({url:previous.external_url});
      const file = await db.storage.from('portal-designs').download(previous.storage_path);
      if (file.error) throw file.error;
      if (file.data.size > MAX_DESIGN_BYTES) throw new Error('Design exceeds size limit');
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      let binary = '';
      for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
      return json({base64:btoa(binary),mime:previous.mime_type,kind:previous.kind});
    }
    if (action === 'visibility' && previous) {
      const changed = await db.from('portal_designs').update({visible:body.visible === true,updated_at:new Date().toISOString()}).eq('id',previous.id).eq('library_id',library.id).eq('updated_at',body.baseVersion).select('id');
      if (changed.error) throw changed.error;
      if (!changed.data?.length) return json({error:'This design changed in another window. Refresh before editing.'},409);
      return json({ok:true});
    }
    if (action !== 'save') return json({error:'Unknown design action'},400);
    const keepFile = body.keepFile === true && previous && body.kind === previous.kind && previous.storage_path;
    let values;
    try { values = designInput(keepFile ? {...body,mime:previous.mime_type,size:previous.size_bytes} : body); }
    catch(error) { return json({error:error instanceof Error ? error.message : 'Invalid design'},400); }
    const id = previous?.id || crypto.randomUUID();
    let path:string|null = keepFile ? previous.storage_path : null;
    let uploadedNew = false;
    if (values.kind !== 'link' && !keepFile) {
      if (typeof body.base64 !== 'string' || body.base64.length > MAX_DESIGN_BYTES*1.4) return json({error:'Invalid file'},400);
      const bytes = Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));
      if (bytes.length !== values.size_bytes) return json({error:'File size mismatch'},400);
      path = owner + '/' + library.id + '/' + id + '/' + crypto.randomUUID();
      const uploaded = await db.storage.from('portal-designs').upload(path,bytes,{contentType:values.mime_type,upsert:false});
      if (uploaded.error) throw uploaded.error;
      uploadedNew = true;
    }
    const row = {...values, id, library_id:library.id, storage_path:path, external_url:values.external_url || null, visible:true, updated_at:new Date().toISOString()};
    const saved = previous
      ? await db.from('portal_designs').update(row).eq('id',id).eq('library_id',library.id).eq('updated_at',body.baseVersion).select('id')
      : await db.from('portal_designs').insert(row).select('id');
    if (saved.error || !saved.data?.length) {
      if (uploadedNew && path) await db.storage.from('portal-designs').remove([path]);
      return json({error:saved.error ? 'Design could not be saved. Your original is unchanged.' : 'This design changed in another window. Refresh before replacing.'},saved.error ? 500 : 409);
    }
    // Old private objects retained for recovery, never served by the read endpoint.
    return json({ok:true,id});
  } catch(error) {
    if (error instanceof AccountAccessError) return json({error:error.message},error.status);
    console.error('portal-designs request failed', error instanceof Error ? error.message : 'Unknown error');
    return json({error:'The design request could not be completed. Please try again.'},500);
  }
}
Deno.serve(handleDesignRequest);
