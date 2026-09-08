// Called only after the enclosing endpoint has authenticated document access.
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function reviewViewer(value) { return uuid.test(String(value || '')) ? String(value) : ''; }
export async function quoteDesignState(db, row, viewer) {
  const linkResult = await db.from('quote_design_links').select('*').eq('document_id',row.id).maybeSingle();
  if(linkResult.error) throw linkResult.error;
  const link=linkResult.data;
  if(!link) return null;
  const found=await db.from('portal_designs').select('*').eq('id',link.design_id).maybeSingle();
  if(found.error)throw found.error;
  const design=found.data;
  // Withdrawal or deletion must never strand the client's quote.
  if(!design?.visible)return null;
  const lib=await db.from('portal_design_libraries').select('user_id,portal_id').eq('id',design.library_id).maybeSingle();
  if(lib.error)throw lib.error;
  if(lib.data?.user_id!==row.user_id || lib.data?.portal_id!==row.data?.portal_id)return null;
  const revision=link.updated_at+'|'+design.updated_at;
  let receipt=null;
  if(reviewViewer(viewer)){
    const r=await db.from('quote_design_reviews').select('*').eq('document_id',row.id).eq('viewer_id',viewer).eq('revision',revision).maybeSingle();
    if(r.error)throw r.error;receipt=r.data;
  }
  // Accepted documents and invoices remain accessible for reference/payment.
  const status=String(row.status||row.data?.status||'').toLowerCase();
  const kind=String(row.type||row.data?.documentType||row.data?.type||'quote').toLowerCase();
  const isQuote=!kind.includes('invoice')&&!kind.includes('change');
  const locked=link.require_review && isQuote && !['accepted','invoiced','paid','approved','rejected','declined'].includes(status) && !receipt?.unlocked_at;
  return {link,design,receipt,revision,locked};
}
export function publicDesignReview(state) {
  if(!state)return null;
  return {id:state.design.id,title:state.design.title,version:state.design.version,kind:state.design.kind,revision:state.revision,locked:state.locked};
}
export function lockedQuoteSummary(row,state) {
  return {id:row.id,user_id:row.user_id,quote_number:row.quote_number,client_name:row.client_name,status:row.status,type:row.type,created_at:row.created_at,
    designReview:publicDesignReview(state),data:{quoteTitle:row.data?.quoteTitle||row.data?.title||'',fileName:row.data?.fileName||row.data?.file_name||'',portal_id:row.data?.portal_id}};
}
