import { ACCOUNT_PERMISSION, AccountAccessError, requireAccountPermissionWithDefault, serviceClient } from '../_shared/account-authorization.ts';
import { currentDesignPortal, verifyDesignSession, digest } from '../_shared/portal-design-session.mjs';
import { designInput, MAX_DESIGN_BYTES } from '../../../portal-design-policy.mjs';
import { budgetedUpload, storageBudgetMessage, storageUsage } from '../_shared/storage-budget.ts';
import { loadPortalBranding, publicPortalTheme } from '../_shared/portal-branding.mjs';

const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Content-Type':'application/json' };
const json = (data:unknown, status=200) => new Response(JSON.stringify(data), {status,headers});
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const publicFields = 'id,project,title,note,version,kind,mime_type,size_bytes,thumbnail_path,visible,created_at,updated_at';
const MAX_THUMBNAIL_BYTES = 1536 * 1024;
type DesignPresentation = {project:string; ids:string[]; requireReview:boolean};
const thumbnailMime = new Set(['image/png','image/jpeg','image/webp']);
const encode = async (blob:Blob) => {
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary);
};

export async function handleDesignRequest(req:Request) {
  if (req.method === 'OPTIONS') return new Response('ok',{headers});
  if (req.method !== 'POST') return json({error:'POST required'},405);
  try {
    // Bound both the declared and actual body; never download a caller-supplied URL.
    const maxRequestBytes=MAX_DESIGN_BYTES*1.4+MAX_THUMBNAIL_BYTES*1.4+8192;
    if (Number(req.headers.get('content-length')) > maxRequestBytes) return json({error:'File too large'},413);
    // Enforce the actual streamed size as well as Content-Length, including chunked requests.
    let received=0;
    const bounded=req.body?.pipeThrough(new TransformStream({transform(chunk,controller){received+=chunk.byteLength;if(received>maxRequestBytes)throw new Error('File too large');controller.enqueue(chunk);}}));
    const reader=new Response(bounded,{headers:{'Content-Type':req.headers.get('content-type')||'application/json'}});
    let body, incomingFile:File|null=null;
    if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
      const form=await reader.formData();const metadata=form.get('metadata'),file=form.get('file');
      if(typeof metadata!=='string'||metadata.length>MAX_THUMBNAIL_BYTES*1.4+8192||!(file instanceof File)||file.size>MAX_DESIGN_BYTES)return json({error:'Invalid design upload'},400);
      body=JSON.parse(metadata);incomingFile=file;
    }else body=await reader.json();
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
    const write = ['save','visibility','share','rotate_share','attach_quote','save_presentation'].includes(action);
    const ownerMode = body.ownerMode === true;
    if (ownerMode) {
      const auth = await requireAccountPermissionWithDefault(req, body.accountId, write ? ACCOUNT_PERMISSION.QUOTES_SEND : ACCOUNT_PERMISSION.QUOTES_READ);
      if (auth.ownerUserId !== owner) return json({error:'Portal access denied'},403);
    } else if (write) return json({error:'Contractor access required'},403);
    const portal = await currentDesignPortal(db,owner,portalId);
    if (!portal) return json({error:'Portal not found'},404);
    if (!ownerMode && !await verifyDesignSession(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),body.session,owner,portalId,portal.pin)) return json({error:'Unlock the portal again to view designs.',code:'pin_required'},401);

    if (action === 'branding') return json({branding:await loadPortalBranding(db,owner),theme:publicPortalTheme(portal.theme)});

    // A full portal entry URL exists before any documents. Only a current, signed
    // PIN session may exchange it for the existing document-viewer capability.
    if (action === 'portal_access') {
      if(ownerMode)return json({error:'Use the admin portal preview.'},400);
      const result=await db.from('quotes').select('id,data,updated_at,public_share_token_hash').eq('user_id',owner).eq('data->>portal_id',portalId).order('created_at',{ascending:true});
      if(result.error)throw result.error;
      const rows=(result.data||[]).filter(row=>row.data?.portal_visible===true||row.data?.portal_anchor_only===true);
      for(const row of rows){
        const token=String(row.data?.portal_share_token||'');
        if(token&&row.public_share_token_hash===await digest(token))return json({name:portal.name,token,anchorId:row.id});
      }
      const anchor=rows.find(row=>row.data?.portal_visible===true&&!row.public_share_token_hash);
      if(!anchor){
        if(rows.some(row=>row.data?.portal_visible===true))return json({error:'The document link needs repair. Ask your contractor to refresh and prepare its portal link.'},409);
        return json({name:portal.name,token:null});
      }
      const token=randomToken(),createdAt=new Date().toISOString();
      if(!anchor.updated_at)return json({error:'Refresh the portal before preparing document access.'},409);
      let update=db.from('quotes').update({data:{...anchor.data,portal_pin:portal.pin,portal_share_token:token,portal_share_anchor_id:anchor.id,portal_share_created_at:createdAt},public_share_token_hash:await digest(token),public_share_token_created_at:createdAt,public_share_token_last4:token.slice(-4),updated_at:createdAt}).eq('id',anchor.id).eq('user_id',owner);
      if(anchor.updated_at)update=update.eq('updated_at',anchor.updated_at);
      const saved=await update.select('id').maybeSingle();
      if(saved.error)throw saved.error;
      if(!saved.data)return json({error:'The portal changed while opening. Refresh and enter your PIN again.'},409);
      return json({name:portal.name,token,anchorId:anchor.id});
    }

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
    if(action === 'save_presentation') {
      const project=body.project, ids=body.designIds;
      if(typeof project!=='string'||!project||project.length>160||!Array.isArray(ids)||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))return json({error:'Choose a project and up to 200 distinct designs.'},400);
      if(!body.baseVersion||body.baseVersion!==library.presentation_revision)return json({error:'Presentation order changed. Refresh and try again.'},409);
      const found=await db.from('portal_designs').select('id,project,visible').eq('library_id',library.id).eq('project',project).eq('visible',true);
      if(found.error)throw found.error;
      const visible=found.data||[];
      if(!visible.length||ids.length!==visible.length||ids.some(id=>!visible.some(row=>row.id===id)))return json({error:'The project designs changed. Refresh before saving the order.'},409);
      const presentations=(library.presentations as DesignPresentation[]||[]).filter(item=>item.project!==project);
      presentations.push({project,ids,requireReview:body.requireReview===true});
      const changed=await db.from('portal_design_libraries').update({presentations,presentation_revision:crypto.randomUUID()}).eq('id',library.id).eq('presentation_revision',body.baseVersion).select('id');
      if(changed.error)throw changed.error;
      if(!changed.data?.length)return json({error:'Presentation order changed. Refresh and try again.'},409);
      return json({ok:true});
    }
    if(action === 'attach_quote') {
      const quoteResult=await db.from('quotes').select('id,user_id,data,status,type').eq('id',body.documentId).eq('user_id',owner).maybeSingle();
      if(quoteResult.error)throw quoteResult.error;
      const quote=quoteResult.data;
      if(!quote || quote.data?.portal_id!==portalId)return json({error:'Choose a quote in this portal.'},400);
      const ids=Array.isArray(body.designIds)?body.designIds:(body.id?[body.id]:[]);
      if(ids.length>20 || new Set(ids).size!==ids.length || ids.some((id:unknown)=>typeof id!=='string'))return json({error:'Choose up to 20 distinct designs.'},400);
      for(const id of ids){
        const design=await db.from('portal_designs').select('id,visible').eq('id',id).eq('library_id',library.id).maybeSingle();
        if(design.error)throw design.error;
        if(!design.data?.visible)return json({error:'Publish the design before attaching it.'},400);
      }
      // Compare the attachment revision, independently of quote edits.
      const current=await db.from('quote_design_links').select('*').eq('document_id',quote.id).maybeSingle();
      if(current.error)throw current.error;
      if(!Array.isArray(body.designIds) && (current.data?.design_ids?.length||0)>1)return json({error:'Refresh to manage this quote’s multiple attachments.'},409);
      if((current.data?.updated_at||null)!==(body.baseVersion||null))return json({error:'The attached design changed. Refresh and try again.'},409);
      const values={document_id:quote.id,design_id:ids[0],design_ids:ids,require_review:body.requireReview===true,updated_at:new Date().toISOString()};
      const change=!ids.length
        ? await db.from('quote_design_links').delete().eq('document_id',quote.id).eq('updated_at',body.baseVersion).select('document_id')
        : current.data
          ? await db.from('quote_design_links').update(values).eq('document_id',quote.id).eq('updated_at',body.baseVersion).select('document_id')
          : await db.from('quote_design_links').insert(values).select('document_id');
      if(change.error || !change.data?.length)return json({error:'The attachment could not be saved. Refresh and try again.'},409);
      return json({ok:true});
    }
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
      let attachments=[];
      if(ownerMode){
        const quotes=await db.from('quotes').select('id').eq('user_id',owner).eq('data->>portal_id',portalId);
        if(quotes.error)throw quotes.error;
        if(quotes.data?.length){const links=await db.from('quote_design_links').select('*').in('document_id',quotes.data.map(q=>q.id));if(links.error)throw links.error;attachments=links.data||[];}
      }
      const designs=(rows.data||[]).map(({thumbnail_path,...row})=>({...row,has_thumbnail:Boolean(thumbnail_path)||row.kind==='image'}));
      // Do not expose withdrawn design IDs or empty, historical projects to clients.
      const presentations=(library.presentations as DesignPresentation[]||[]).map(item=>({...item,ids:(item.ids||[]).filter(id=>designs.some(row=>row.id===id&&row.project===item.project))})).filter(item=>designs.some(row=>row.project===item.project));
      return json({designs,attachments,presentations,presentationRevision:library.presentation_revision});
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
      if(body.binary===true)return new Response(file.data,{headers:{...headers,'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','X-Design-Kind':previous.kind,'X-Design-Mime':previous.mime_type,'Access-Control-Expose-Headers':'X-Design-Kind,X-Design-Mime'}});
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      let binary = '';
      for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
      return json({base64:btoa(binary),mime:previous.mime_type,kind:previous.kind});
    }
    if(action==='thumbnail'&&previous){
      const path=previous.thumbnail_path||(previous.kind==='image'?previous.storage_path:null);
      if(!path)return json({error:'Thumbnail not available'},404);
      const file=await db.storage.from('portal-designs').download(path);
      if(file.error)throw file.error;
      if(path===previous.thumbnail_path&&file.data.size>MAX_THUMBNAIL_BYTES)throw new Error('Thumbnail exceeds size limit');
      if(path===previous.storage_path&&file.data.size>MAX_DESIGN_BYTES)throw new Error('Design exceeds size limit');
      return json({base64:await encode(file.data),mime:path===previous.thumbnail_path?previous.thumbnail_mime:previous.mime_type});
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
    let thumbnailPath:string|null=body.removeThumbnail===true?null:(previous?.thumbnail_path||null);
    let thumbnailMimeType:string|null=body.removeThumbnail===true?null:(previous?.thumbnail_mime||null);
    let thumbnailSize:number|null=body.removeThumbnail===true?null:(previous?.thumbnail_size_bytes||null);
    let uploadedThumbnail=false;
    let thumbnailBytes:Uint8Array|null=null;
    if(body.thumbnailBase64!=null){
      if(!thumbnailMime.has(body.thumbnailMime)||!Number.isInteger(body.thumbnailSize)||body.thumbnailSize<1||body.thumbnailSize>MAX_THUMBNAIL_BYTES||typeof body.thumbnailBase64!=='string'||body.thumbnailBase64.length>MAX_THUMBNAIL_BYTES*1.4)return json({error:'Thumbnail must be a PNG, JPEG, or WebP image under 1.5 MB.'},400);
      thumbnailBytes=Uint8Array.from(atob(body.thumbnailBase64),c=>c.charCodeAt(0));
      if(thumbnailBytes.length!==body.thumbnailSize)return json({error:'Thumbnail size mismatch'},400);
    }
    if (values.kind !== 'link' && !keepFile) {
      if (!incomingFile&&(typeof body.base64 !== 'string' || body.base64.length > MAX_DESIGN_BYTES*1.4)) return json({error:'Invalid file'},400);
      const bytes = incomingFile ? new Uint8Array(await incomingFile.arrayBuffer()) : Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));
      if (bytes.length !== values.size_bytes) return json({error:'File size mismatch'},400);
      path = owner + '/' + library.id + '/' + id + '/' + crypto.randomUUID();
      const uploaded = await budgetedUpload(db,owner,'portal-designs',path,bytes,{contentType:values.mime_type});
      if (uploaded.error) throw uploaded.error;
      uploadedNew = true;
    }
    if(thumbnailBytes){
      thumbnailPath=owner+'/'+library.id+'/'+id+'/thumbnail-'+crypto.randomUUID();
      const uploaded=await budgetedUpload(db,owner,'portal-designs',thumbnailPath,thumbnailBytes,{contentType:body.thumbnailMime});
      if(uploaded.error){if(uploadedNew&&path)await db.storage.from('portal-designs').remove([path]);throw uploaded.error;}
      thumbnailMimeType=body.thumbnailMime;thumbnailSize=thumbnailBytes.length;uploadedThumbnail=true;
    }
    const row = {...values, id, library_id:library.id, storage_path:path,thumbnail_path:thumbnailPath,thumbnail_mime:thumbnailMimeType,thumbnail_size_bytes:thumbnailSize,external_url:values.external_url || null, visible:true, updated_at:new Date().toISOString()};
    const saved = previous
      ? await db.from('portal_designs').update(row).eq('id',id).eq('library_id',library.id).eq('updated_at',body.baseVersion).select('id')
      : await db.from('portal_designs').insert(row).select('id');
    if (saved.error || !saved.data?.length) {
      if (uploadedNew && path) await db.storage.from('portal-designs').remove([path]);
      if(uploadedThumbnail&&thumbnailPath)await db.storage.from('portal-designs').remove([thumbnailPath]);
      if(saved.error?.message?.includes('render_upload_quota_exceeded'))return json({error:'Your account has used its three design file uploads this calendar month (UTC). Replacements count. Existing designs remain available; try again next month.'},429);
      return json({error:saved.error ? 'Design could not be saved. Your original is unchanged.' : 'This design changed in another window. Refresh before replacing.'},saved.error ? 500 : 409);
    }
    // Old private objects retained for recovery, never served by the read endpoint.
    return json({ok:true,id,usage:await storageUsage(db,owner)});
  } catch(error) {
    const budgetMessage=storageBudgetMessage(error);
    if(budgetMessage)return json({error:budgetMessage},409);
    if(error instanceof Error&&error.message==='File too large')return json({error:'File too large'},413);
    if (error instanceof AccountAccessError) return json({error:error.message},error.status);
    console.error('portal-designs request failed', error instanceof Error ? error.message : 'Unknown error');
    return json({error:'The design request could not be completed. Please try again.'},500);
  }
}
Deno.serve(handleDesignRequest);
