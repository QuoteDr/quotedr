// Service-only helpers. Callers must establish account/purpose authorization.
export async function storageUsage(db:any, owner:string) {
  const result=await db.rpc('qdr_storage_status',{p_owner:owner});
  if(result.error)throw result.error;
  return result.data;
}
export async function reserveStorage(db:any,owner:string,bucket:string,path:string,bytes:number,digest:string) {
  const result=await db.rpc('qdr_storage_reserve',{p_owner:owner,p_bucket:bucket,p_path:path,p_bytes:bytes,p_digest:digest});
  if(result.error)throw result.error;
  return result.data;
}
export async function budgetedUpload(db:any,owner:string,bucket:string,path:string,data:Blob|Uint8Array,options:any={}) {
  const bytes=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):new Uint8Array(data);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  let reservation;
  try { reservation=await reserveStorage(db,owner,bucket,path,bytes.byteLength,hash); }
  catch(error) {
    // Pre-budget content-addressed thumbnails are reusable only after verifying
    // their bytes. Never treat arbitrary path collisions as successful uploads.
    if(String((error as {message?:string})?.message||'').includes('storage_path_conflict')&&path===`${owner}/thumbnails/${hash}.${path.split('.').pop()}`){
      const previous=await db.storage.from(bucket).download(path);
      if(previous.data?.size===bytes.byteLength){
        const previousHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await previous.data.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
        if(previousHash===hash)return {data:{path},error:null,usage:await storageUsage(db,owner)};
      }
    }
    throw error;
  }
  if(!reservation.existing){
    const result=await db.storage.from(bucket).upload(path,bytes,{...options,upsert:false});
    // A concurrent retry can win the identical immutable path. Reconciliation
    // records it; other failures keep their reservation until it safely expires.
    if(result.error&&!/already exists|duplicate/i.test(result.error.message||''))throw result.error;
  }
  return {data:{path},error:null,usage:await storageUsage(db,owner)};
}
export async function budgetedSignedUpload(db:any,owner:string,bucket:string,path:string,maximumBytes:number) {
  // Reserve the entire bucket maximum, not a client-declared length: signed
  // Storage tokens do not enforce a per-token byte size. No overwrite allowed.
  const reservation=await reserveStorage(db,owner,bucket,path,maximumBytes,'signed-immutable');
  if(reservation.existing)return {data:{alreadyUploaded:true,token:null},error:null};
  return db.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
}
export function storageBudgetMessage(error:any) {
  const message=String(error?.message||error||'');
  if(message.includes('storage_monthly_limit'))return 'This account has reached its monthly upload allowance. Existing files remain available. The allowance resets on the first of next month (UTC).';
  if(message.includes('storage_retained_limit'))return 'This account has reached its shared storage allowance. Existing files remain available. Review storage before adding more; nothing has been deleted.';
  if(message.includes('storage_upload_expired'))return 'This upload attempt expired. Select the file again to start a new upload.';
  if(message.includes('storage_path_conflict'))return 'A different file already uses this upload path. Refresh and select the file again; the original was not replaced.';
  return null;
}
