import { designInput, MAX_DESIGN_BYTES } from './portal-design-policy.mjs';

const el = (tag,text,className) => { const node=document.createElement(tag); if(text != null)node.textContent=text; if(className)node.className=className; return node; };
const button = (text,fn,style='btn btn-outline-primary btn-sm') => { const b=el('button',text,style);b.type='button';b.onclick=fn;return b; };
const binary64 = bytes => {let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};

export function isolatedDesignHtml(html) {
  // Do NOT parse uploaded HTML in the parent document: even an inert DOMParser
  // document may start resource requests. The first policy is active before the
  // uploaded bytes are parsed, only inside the opaque sandbox. Later policies
  // can tighten this policy but cannot relax it.
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";
  return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="'+policy+'"><meta name="referrer" content="no-referrer"></head><body>'+html+'</body></html>';
}
function validateSelfContained(html) {
  // Convenience check, NOT a security boundary. The sandbox/CSP enforce isolation.
  if (/<(?:iframe|frame|object|embed)\b|<script\b[^>]*\bsrc\s*=|<link\b[^>]*stylesheet/i.test(html) || /\bimport\s*(?:\(|[^;\n]*?\bfrom\s*|["'])/.test(html)) throw new Error('This HTML needs external files. Export a self-contained HTML viewer with its libraries and model included, then preview it here.');
}
function dialog(title,full=false) {
  const d=el('dialog',null,'qd-design-dialog'+(full?' qd-design-full':''));
  const head=el('header');head.append(el('h2',title),button('Close',()=>d.close(),'btn btn-outline-secondary btn-sm'));d.append(head);
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  document.body.append(d); d.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;d.remove();},{once:true});d.showModal();return d;
}
async function renderDrawingPdf(bytes,body,d){
  const box=el('div');body.prepend(box);
  try{
    const pdfjs=await import('./vendor/pdfjs-6.3.289/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs-6.3.289/pdf.worker.mjs',import.meta.url).href;
    // Render page graphics only; do not execute PDF actions, embedded JS, or forms.
    const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,useWasm:false,useSystemFonts:true,disableFontFace:true});
    d.addEventListener('close',()=>task.destroy(),{once:true});
    const pdf=await task.promise;if(!d.isConnected)return;
    let number=1,rendering=false;
    const controls=el('div',null,'qd-design-actions');const label=el('span');
    const canvas=el('canvas');canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.setAttribute('role','img');
    const prev=button('Previous page',()=>{if(number>1){number--;draw();}}),next=button('Next page',()=>{if(number<pdf.numPages){number++;draw();}});controls.append(prev,label,next);box.append(controls,canvas);
    async function draw(){if(rendering)return;rendering=true;prev.disabled=next.disabled=true;try{const page=await pdf.getPage(number);const natural=page.getViewport({scale:1});const scale=Math.min(2,Math.max(.3,(d.clientWidth-64)/natural.width));const viewport=page.getViewport({scale});canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label','Drawing page '+number+' of '+pdf.numPages);await page.render({canvas,viewport}).promise;label.textContent='Page '+number+' of '+pdf.numPages;}finally{rendering=false;prev.disabled=number===1;next.disabled=number===pdf.numPages;}}
    await draw();
  }catch(error){box.textContent='Inline PDF preview is unavailable. Use Download drawing to view the file.';}
}
export async function showDesign(read, title) {
  const d=dialog(title,true);const body=el('div','Loading design…');d.append(body);
  try {
    const result=await read(); if(!d.isConnected)return;
    body.replaceChildren();
    if(result.url){
      const a=el('a','Open external design','btn btn-primary');a.href=designInput({kind:'link',title,url:result.url}).external_url;a.target='_blank';a.rel='noopener noreferrer';
      body.append(el('p','This design is hosted by another provider. Its own privacy and sign-in settings apply.'),a);return;
    }
    const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
    if(result.kind==='interactive'){
      const frame=el('iframe');frame.title=title;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
      frame.srcdoc=isolatedDesignHtml(new TextDecoder().decode(bytes));body.append(frame);
      body.append(el('p','Interactive preview only. Adjustments are not saved or approved. Send your preferred changes to your contractor.','qd-design-meta'));
    }else{
      if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(result.mime))throw new Error('Unsupported preview type');
      const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));d.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
      if(result.kind==='image'){const img=el('img');img.src=url;img.alt=title;body.append(img);}
      else {await renderDrawingPdf(bytes,body,d);}
      const download=el('a','Download drawing','btn btn-outline-primary');download.href=url;download.download=title+(result.mime==='application/pdf'?'.pdf':result.mime==='image/jpeg'?'.jpg':result.mime==='image/webp'?'.webp':'.png');body.append(download);
    }
  }catch(error){body.textContent=error.message;body.className='qd-design-error';}
}

export function mountDesignLibrary(root,{request,isOwner,reunlock,shareBase}) {
  let rows=[];
  root.className='qd-designs';
  const head=el('header');head.append(el('h2','Designs & Renderings'));
  const actions=el('div',null,'qd-design-actions');head.append(actions);
  const status=el('p','Loading designs…');status.setAttribute('role','status');
  const filter=el('select',null,'form-select');filter.setAttribute('aria-label','Design project');filter.onchange=render;
  const grid=el('div',null,'qd-design-grid');root.replaceChildren(head,el('p','Explore drawings and interactive previews. A design can be shared before a quote is created.'),status,filter,grid);
  const guarded=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message;}};
  actions.append(button('Refresh',guarded(refresh)));
  if(isOwner){actions.append(button('Add design',()=>edit(), 'btn btn-primary btn-sm'),button('Copy client design link',guarded(async()=>{
    const result=await request({action:'share'});const url=new URL(shareBase);url.search='';url.hash='';url.searchParams.set('design',result.shareToken);
    // Clipboard only ever receives the client URL, never the admin preview.
    await navigator.clipboard.writeText(url.href);status.textContent='Client design link copied. Share the existing portal PIN separately.';
  })));}
  async function refresh(){
    try{const result=await request({action:'list'});rows=result.designs||[];status.textContent=rows.length?'Design previews do not change or approve your quote.':'No designs shared yet.';
      const value=filter.value;filter.replaceChildren();const all=el('option','All projects');all.value='';filter.append(all);
      [...new Set(rows.map(r=>r.project))].sort().forEach(p=>{const o=el('option',p);o.value=p;filter.append(o);});filter.value=value;render();
    }catch(e){grid.replaceChildren();status.replaceChildren(el('span',e.message+' '));if(!isOwner)status.append(button('Unlock designs',reunlock));}
  }
  function render(){
    grid.replaceChildren();filter.hidden=rows.length===0;
    for(const row of rows.filter(r=>!filter.value||r.project===filter.value)){
      const card=el('article',null,'qd-design-card'+(!row.visible?' is-withdrawn':''));
      card.append(el('div',row.kind==='interactive'?'◈ Interactive preview':row.kind==='link'?'↗ Design link':row.kind==='pdf'?'▤ Drawing / PDF':'▧ Rendering','qd-design-icon'),el('div',row.project,'qd-design-meta'),el('h3',row.title),el('p',row.note,'qd-design-note'),el('p','Version '+row.version+' · '+new Date(row.updated_at).toLocaleDateString()+(!row.visible?' · Withdrawn':''),'qd-design-meta'));
      const a=el('div',null,'qd-design-actions');a.append(button('Open design',()=>showDesign(()=>request({action:'read',id:row.id}),row.title),'btn btn-primary btn-sm'));
      if(isOwner)a.append(button('Replace / edit',()=>edit(row)),button(row.visible?'Withdraw':'Publish again',guarded(async()=>{
        if(!window.confirm(row.visible?'Withdraw this design from the client portal? Already opened or downloaded copies cannot be recalled.':'Make this design visible to the client again?'))return;
        await request({action:'visibility',id:row.id,baseVersion:row.updated_at,visible:!row.visible});await refresh();
      })));
      card.append(a);grid.append(card);
    }
  }
  function edit(previous){
    const d=dialog(previous?'Replace design':'Add design');const f=el('form');d.append(f);
    const fields={};
    function input(name,label,type='text',value='') {const wrap=el('label',label);const n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value;wrap.append(n);f.append(wrap);fields[name]=n;return n;}
    input('title','Design title','text',previous?.title||'').required=true;
    input('project','Project / room','text',previous?.project||'Project designs');
    input('version','Version','text',previous?String(Number(previous.version)+1 || previous.version):'1');
    input('note','Note for the client','textarea',previous?.note||'');
    const label=el('label','Design type');const kind=el('select');label.append(kind);f.append(label);
    for(const [v,t]of [['link','External design link'],['image','Image rendering'],['pdf','PDF drawing'],['interactive','Self-contained interactive HTML']]){const o=el('option',t);o.value=v;kind.append(o);}kind.value=previous?.kind||'link';
    const url=input('url','HTTPS design link','url');
    if(previous?.kind==='link')request({action:'read',id:previous.id}).then(r=>{if(!url.value)url.value=r.url||'';}).catch(e=>{error.textContent=e.message;});
    const file=input('file','Choose file (maximum 8 MB)','file');
    const help=el('p','External links keep their provider’s access settings. Interactive HTML runs in an isolated preview without network access. Please preview before publishing.');f.append(help);
    const reviewed=input('reviewed','I previewed this interactive design and its controls work.','checkbox');
    const error=el('p','', 'qd-design-error');error.setAttribute('role','status');f.append(error);
    const preview=button('Preview selected file',async()=>{try{const data=await filePayload();await showDesign(async()=>data,fields.title.value||'Design preview');}catch(e){error.textContent=e.message;}});f.append(preview);
    const save=el('button',previous?'Publish replacement':'Add to portal','btn btn-primary');save.type='submit';f.append(save);
    function changed(){const link=kind.value==='link';url.parentElement.hidden=!link;file.parentElement.hidden=link;reviewed.parentElement.hidden=kind.value!=='interactive';preview.hidden=link;file.accept=kind.value==='interactive'?'.html':kind.value==='pdf'?'.pdf':'.png,.jpg,.jpeg,.webp';reviewed.checked=false;}
    kind.onchange=changed;file.onchange=()=>{reviewed.checked=false;};changed();
    async function filePayload(){const selected=file.files[0];if(!selected)throw new Error('Choose a file to preview.');if(selected.size>MAX_DESIGN_BYTES)throw new Error('Choose a file under 8 MB.');const bytes=new Uint8Array(await selected.arrayBuffer());const mime=kind.value==='interactive'?'text/html':selected.type;
      if(kind.value==='interactive')validateSelfContained(new TextDecoder().decode(bytes));return{kind:kind.value,mime,size:bytes.length,base64:binary64(bytes)};}
    f.onsubmit=async event=>{event.preventDefault();save.disabled=true;error.textContent='Saving…';try{
      const keepFile=previous&&previous.kind===kind.value&&kind.value!=='link'&&!file.files[0];
      if(kind.value==='interactive'&&!keepFile&&!reviewed.checked)throw new Error('Preview the interactive design and confirm its controls work first.');
      const data={action:'save',id:previous?.id,baseVersion:previous?.updated_at,title:fields.title.value,project:fields.project.value,version:fields.version.value,note:fields.note.value,kind:kind.value,url:url.value,...(kind.value==='link'?{}:keepFile?{keepFile:true,mime:previous.mime_type,size:previous.size_bytes}:await filePayload())};designInput(data);
      await request(data);d.close();await refresh();status.textContent='Design saved to the portal.';
    }catch(e){error.textContent=e.message;}finally{save.disabled=false;}};
  }
  return {refresh};
}
