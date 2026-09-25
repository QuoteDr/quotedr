import {requireAccountPermissionWithDefault,serviceClient,AccountAccessError} from '../_shared/account-authorization.ts';
import {budgetedUpload,storageUsage,storageBudgetMessage} from '../_shared/storage-budget.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Content-Type':'application/json','Cache-Control':'private, no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const permissions:Record<string,string>={'item-full-res-photos':'items.manage','room-photos':'quotes.update','portal-job-assets':'quotes.send'};
export async function handleStorageBudget(req:Request) {
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return json({error:'POST required'},405);
  try{
    // This compatibility route deliberately remains bounded. Large-file TUS
    // support is a separate release gate, not a silent increase to Edge memory.
    const multipart=req.headers.get('content-type')?.startsWith('multipart/form-data');
    const limit=multipart?50000000+16384:16384;
    if(Number(req.headers.get('content-length'))>limit)return json({error:'Request body too large'},413);
    let received=0;
    const stream=req.body?.pipeThrough(new TransformStream({transform(chunk,c){received+=chunk.byteLength;if(received>limit)throw new RangeError('Request body too large');c.enqueue(chunk);}}));
    const response=new Response(stream,{headers:{'Content-Type':req.headers.get('content-type')||'application/json'}});
    let body:any,file:File|null=null;
    if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
      const form=await response.formData(),meta=form.get('metadata');
      if(typeof meta!=='string'||meta.length>8192)throw Error('Invalid upload');
      body=JSON.parse(meta);file=form.get('file') as File;
      if(!(file instanceof File)||!file.size||file.size>50000000)throw Error('Invalid upload');
    }else {body=await response.json();}
    const action=body.action||'usage',bucket=String(body.bucket||'');
    if(action!=='usage'&&!permissions[bucket])return json({error:'Unsupported storage bucket'},400);
    let auth;
    try { auth=await requireAccountPermissionWithDefault(req,body.accountId,action==='usage'?'account.read':permissions[bucket]); }
    catch(error) {
      const paths=action==='remove'?body.paths:[body.path];
      if(!(error instanceof AccountAccessError)||error.status!==403||bucket!=='item-full-res-photos'||!Array.isArray(paths)||!paths.length||!paths.every(p=>typeof p==='string'&&p.split('/')[1]==='thumbnails'))throw error;
      auth=await requireAccountPermissionWithDefault(req,body.accountId,'quotes.update');
    }
    const db=serviceClient();
    if(action==='usage')return json({usage:await storageUsage(db,auth.ownerUserId)});
    const paths=action==='remove'?body.paths:[body.path];
    if(!Array.isArray(paths)||!paths.length||paths.length>100||paths.some(p=>typeof p!=='string'||p.length>1024||p.includes('..')||![auth.ownerUserId,auth.user.id].includes(p.split('/')[0])))return json({error:'Invalid storage path'},403);
    if(action==='remove'){
      for(const path of paths){
        const record=await db.from('qdr_storage_uploads').select('owner_id').eq('bucket',bucket).eq('path',path).maybeSingle();
        if(record.error)throw record.error;
        if(record.data?record.data.owner_id!==auth.ownerUserId:path.split('/')[0]!==auth.ownerUserId)return json({error:'Storage access denied'},403);
      }
      // Record any successful pending upload before deletion, so deleting a
      // file frees retained space but cannot refund this month's uploaded bytes.
      await storageUsage(db,auth.ownerUserId);
      const result=await db.storage.from(bucket).remove(paths);
      if(result.error)throw result.error;
      return json({data:result.data,usage:await storageUsage(db,auth.ownerUserId)});
    }
    if(action!=='upload'||!file)return json({error:'Choose a file'},400);
    const result=await budgetedUpload(db,auth.ownerUserId,bucket,body.path,file,{contentType:file.type||'application/octet-stream',cacheControl:'3600'});
    return json(result);
  }catch(error){
    if(error instanceof RangeError)return json({error:error.message},413);
    if(error instanceof AccountAccessError)return json({error:error.message},error.status);
    const budget=storageBudgetMessage(error);
    if(budget)return json({error:budget},409);
    return json({error:'Storage request failed. Keep your original file and retry after refreshing.'},500);
  }
}
Deno.serve(handleStorageBudget);
