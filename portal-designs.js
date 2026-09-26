import { designInput, MAX_DESIGN_BYTES } from './portal-design-policy.mjs';
import {prepareDesignHtml} from './portal-design-prepare.mjs';
import {usageMessage} from './storage-budget-client.mjs';

const el = (tag,text,className) => { const node=document.createElement(tag); if(text != null)node.textContent=text; if(className)node.className=className; return node; };
const button = (text,fn,style='btn btn-outline-primary btn-sm') => { const b=el('button',text,style);b.type='button';b.onclick=fn;return b; };
const binary64 = bytes => {let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const imageMimes=new Set(['image/png','image/jpeg','image/webp']);
export function modelVisibleTimer(send,doc=document,win=window,now=()=>performance.now()){
  let total=0,last=now(),visible=!doc.hidden,stopped=false;
  const sample=()=>{const current=now();if(visible)total+=Math.max(0,Math.min(current-last,30000));last=current;visible=!doc.hidden;};
  const flush=()=>{sample();send(Math.min(86400,Math.floor(total/1000)));};
  const changed=()=>flush();
  const stop=()=>{if(stopped)return;stopped=true;flush();win.clearInterval(interval);doc.removeEventListener('visibilitychange',changed);win.removeEventListener('pagehide',stop);};
  const interval=win.setInterval(flush,15000);doc.addEventListener('visibilitychange',changed);win.addEventListener('pagehide',stop);return stop;
}
export function presentationRows(rows, presentation) {
  const available=rows.filter(row=>row.visible&&row.project===presentation.project);
  const ids=Array.isArray(presentation.ids)?presentation.ids:[];
  return [...ids.map(id=>available.find(row=>row.id===id)).filter(Boolean),...available.filter(row=>!ids.includes(row.id))];
}
async function thumbnailPayload(file){
  if(!file||!imageMimes.has(file.type))throw new Error('Choose a PNG, JPEG, or WebP thumbnail.');
  const source=URL.createObjectURL(file);
  try{
    const image=new Image();image.decoding='async';image.src=source;await image.decode();
    const scale=Math.min(1,960/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
    if(!blob||blob.size>1536*1024)throw new Error('The thumbnail could not be reduced below 1.5 MB. Choose a smaller screenshot.');
    const bytes=new Uint8Array(await blob.arrayBuffer());return{thumbnailBase64:binary64(bytes),thumbnailMime:blob.type,thumbnailSize:bytes.length};
  }finally{URL.revokeObjectURL(source);}
}

export function isolatedDesignHtml(html) {
  // Do NOT parse uploaded HTML in the parent document: even an inert DOMParser
  // document may start resource requests. The first policy is active before the
  // uploaded bytes are parsed, only inside the opaque sandbox. Later policies
  // can tighten this policy but cannot relax it.
  const policy="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";
  return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="'+policy+'"><meta name="referrer" content="no-referrer"></head><body>'+html+'</body></html>';
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
export async function showDesign(read, title, options={}) {
  const d=dialog(title,true);const body=el('div');
  const loading=el('div',null,'qd-design-loading');
  const loadingText=el('p','Loading design… Please keep this window open. Large models may take longer on slower devices.');loadingText.setAttribute('role','status');
  const progress=el('div',null,'qd-design-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Loading design');
  loading.append(loadingText,progress);d.append(loading,body);let busy=true;
  const ready=()=>{busy=false;loading.remove();};
  d.addEventListener('close',()=>options.onClose?.(),{once:true});
  const addContinue=(link)=>{if(options.onContinue){const next=button(options.continueLabel||'Continue to quote',()=>{d.close();options.onContinue();},'btn btn-primary');
    if(link&&options.requireExternalOpen){next.disabled=true;link.addEventListener('click',()=>{next.disabled=false;});body.append(el('p','Open the external link first, then return here to confirm you have watched or reviewed it. QDR cannot verify playback.'));}
    d.append(next);
  }};
  if(options.onProblem)d.append(button('I can’t view this — continue anyway',()=>{if(busy&&!window.confirm('This design is still loading. Skip it and continue without viewing it?'))return;d.close();options.onProblem();},'btn btn-outline-secondary'));
  try {
    const result=await read(); if(!d.isConnected)return;
    body.replaceChildren();
    if(result.url){
      const a=el('a','Open external design','btn btn-primary');a.href=designInput({kind:'link',title,url:result.url}).external_url;a.target='_blank';a.rel='noopener noreferrer';
      a.addEventListener('click',()=>options.onExternalOpen?.());
      body.append(el('p','This design is hosted by another provider. Its own privacy and sign-in settings apply.'),a);ready();addContinue(a);return true;
    }
    const bytes=result.file ? new Uint8Array(await result.file.arrayBuffer()) : Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
    if(result.kind==='interactive'){
      d.classList.add('qd-design-model');body.className='qd-design-model-body';
      const frame=el('iframe');frame.title=title;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
      frame.setAttribute('allow','fullscreen *');frame.setAttribute('allowfullscreen','');
      loadingText.textContent='Opening interactive model… The model may need a little longer to initialise after it appears.';
      frame.addEventListener('load',()=>{if(!d.isConnected)return;ready();if(options.onModelTime){const stop=modelVisibleTimer(options.onModelTime);d.addEventListener('close',stop,{once:true});}addContinue();},{once:true});
      frame.srcdoc=isolatedDesignHtml(new TextDecoder().decode(bytes));body.append(frame);
      body.append(el('p','Interactive preview only. Adjustments are not saved or approved. Send your preferred changes to your contractor.','qd-design-meta'));
    }else{
      if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(result.mime))throw new Error('Unsupported preview type');
      const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));d.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
      if(result.kind==='image'){const img=el('img');img.src=url;img.alt=title;body.append(img);await img.decode();}
      else {await renderDrawingPdf(bytes,body,d);}
      const download=el('a','Download drawing','btn btn-outline-primary');download.href=url;download.download=title+(result.mime==='application/pdf'?'.pdf':result.mime==='image/jpeg'?'.jpg':result.mime==='image/webp'?'.webp':'.png');body.append(download);
    }
    if(result.kind!=='interactive'&&d.isConnected){ready();addContinue();}return true;
  }catch(error){ready();body.textContent=error.message;body.className='qd-design-error';return false;}
}

export function mountDesignLibrary(root,{request,isOwner,reunlock,shareBase,getQuotes=()=>[],onQuotesChanged=()=>{},onOpenDesign,onAttachmentsChanged=()=>{}}) {
  let rows=[],attachments=[],presentations=[],presentationRevision=null;
  // Partial progress is local; full completion is a shared portal acknowledgement.
  const completed=new Set();
  let visitRecorded=false;
  const track=(event,id)=>{if(!isOwner)request({action:'track_activity',event,id}).catch(()=>{});};
  const timing=id=>{const visitId=crypto.randomUUID();return seconds=>{if(!isOwner)request({action:'track_activity',event:'model_visible',id,visitId,seconds}).catch(()=>{});};};
  root.className='qd-designs';
  const head=el('header');head.append(el('h2','Designs & Renderings'));
  const actions=el('div',null,'qd-design-actions');head.append(actions);
  const status=el('p','Loading designs…');status.setAttribute('role','status');
  const filter=el('select',null,'form-select');filter.setAttribute('aria-label','Design project');filter.onchange=render;
  const grid=el('div',null,'qd-design-grid');root.replaceChildren(head,el('p','Explore drawings and interactive previews. A design can be shared before a quote is created. Portal visits, design opens and external-link clicks may be logged for your contractor.'),status,filter,grid);
  const guarded=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message;}};
  actions.append(button('Refresh',guarded(refresh)));
  if(isOwner){actions.append(button('Add design',()=>edit(), 'btn btn-primary btn-sm'),button('Copy client design link',guarded(async()=>{
    const result=await request({action:'share'});const url=new URL(shareBase);url.search='';url.hash='';url.searchParams.set('design',result.shareToken);
    // Clipboard only ever receives the client URL, never the admin preview.
    await navigator.clipboard.writeText(url.href);status.textContent='Client design link copied. Share the existing portal PIN separately.';
  })));}
  if(isOwner)actions.append(button('Presentation order',()=>editPresentation()));
  if(isOwner)actions.append(button('Design activity',async()=>{
    const d=dialog('Design activity'),content=el('div','Loading activity…');d.append(content);
    const load=async()=>{content.textContent='Loading activity…';try{
      const result=await request({action:'activity'});if(!d.isConnected)return;
      const events=result.events||[],visits=events.filter(e=>e.event_type==='portal_visited').length,opens=events.filter(e=>e.event_type==='design_opened').length;
      const seconds=events.filter(e=>e.event_type==='model_visible').reduce((n,e)=>n+(e.duration_seconds||0),0);
      content.replaceChildren(el('p',visits+' portal visits · '+opens+' design opens in the entries below'),el('p','Model visible time: '+Math.floor(seconds/60)+'m '+seconds%60+'s in these entries'),el('p','Latest 500 entries within 90 days. Repeat opens in the same PIN session and minute are combined. Model visible time pauses in hidden tabs; it is approximate, not attention, video playback or approval. Admin previews are excluded. Tracking begins after deployment; failed/offline tracking and the last unsent seconds may be missing.'));
      const list=el('ol');for(const e of events)list.append(el('li',new Date(e.created_at).toLocaleString()+' — '+({portal_visited:'Portal visited',design_opened:'Design opened',external_clicked:'External link clicked',model_visible:'Model visible time: '+Math.floor((e.duration_seconds||0)/60)+'m '+(e.duration_seconds||0)%60+'s'}[e.event_type]||e.event_type)+(e.title?' · '+e.title:'')+(e.project?' ('+e.project+')':'')));
      content.append(events.length?list:el('p','No recorded client design activity yet.'));
    }catch(e){content.textContent='Could not load activity: '+e.message;}};
    d.append(button('Refresh activity',load));await load();
  }));
  async function refresh(){
    try{const result=await request({action:'list'});rows=result.designs||[];attachments=result.attachments||[];presentations=result.presentations||[];presentationRevision=result.presentationRevision||null;status.textContent=rows.length?'Design previews do not change or approve your quote.':'No designs shared yet.';
      if(!visitRecorded){visitRecorded=true;track('portal_visited');}
      const value=filter.value;filter.replaceChildren();const all=el('option','All projects');all.value='';filter.append(all);
      [...new Set(rows.map(r=>r.project))].sort().forEach(p=>{const o=el('option',p);o.value=p;filter.append(o);});filter.value=value;render();onAttachmentsChanged();
    }catch(e){grid.replaceChildren();status.replaceChildren(el('span',e.message+' '));if(!isOwner)status.append(button('Unlock designs',reunlock));}
  }
  function render(){
    grid.replaceChildren();filter.hidden=rows.length===0;
    for(const p of presentations.filter(p=>(!filter.value||p.project===filter.value)&&p.completedAt)) {
      const first=presentationRows(rows,p)[0];
      if(first&&!isOwner)grid.append(button('Replay presentation — '+p.project,()=>openDesign(first,false,true)));
    }
    const ordered=[];
    for(const project of [...new Set(rows.map(row=>row.project))]){
      const presentation=presentations.find(p=>p.project===project);
      ordered.push(...(presentation?presentationRows(rows,presentation):rows.filter(row=>row.project===project&&row.visible)),...rows.filter(row=>row.project===project&&!row.visible));
    }
    for(const row of ordered.filter(r=>!filter.value||r.project===filter.value)){
      const card=el('article',null,'qd-design-card'+(!row.visible?' is-withdrawn':''));
      if(row.has_thumbnail){const image=el('img');image.className='qd-design-thumbnail';image.alt='Preview of '+row.title;image.loading='lazy';card.append(image);request({action:'thumbnail',id:row.id}).then(result=>{if(!image.isConnected)return;image.src='data:'+result.mime+';base64,'+result.base64;}).catch(()=>image.remove());}
      card.append(el('div',row.kind==='interactive'?'◈ Interactive preview':row.kind==='link'?'↗ Design link':row.kind==='pdf'?'▤ Drawing / PDF':'▧ Rendering','qd-design-icon'),el('div',row.project,'qd-design-meta'),el('h3',row.title),el('p',row.note,'qd-design-note'),el('p','Version '+row.version+' · '+new Date(row.updated_at).toLocaleDateString()+(!row.visible?' · Withdrawn':''),'qd-design-meta'));
      const presentation=presentations.find(p=>p.project===row.project);
      if(presentation&&row.visible)card.append(el('p','Presentation step '+(presentationRows(rows,presentation).findIndex(r=>r.id===row.id)+1)+(presentation.completedAt?' · Presentation reviewed — open freely':presentation.requireReview?' · Review in order':''),'qd-design-meta'));
      const a=el('div',null,'qd-design-actions');a.append(button('Open design',()=>openDesign(row),'btn btn-primary btn-sm'));
      if(isOwner && row.visible)a.append(button('Attach to quote',()=>attach(row)));
      if(isOwner)for(const link of attachments.filter(a=>(a.design_ids||[a.design_id]).includes(row.id))){const quote=getQuotes().find(q=>q.id===link.document_id);card.append(el('p',(quote?.data?.fileName||quote?.quote_number||'Quote')+' · Position '+((link.design_ids||[link.design_id]).indexOf(row.id)+1)+(link.require_review?' · Design before pricing':' · Attached design'),'qd-design-meta'));}
      if(isOwner)a.append(button('Replace / edit',()=>edit(row)),button(row.visible?'Withdraw':'Publish again',guarded(async()=>{
        if(!window.confirm(row.visible?'Withdraw this design from the client portal? Already opened or downloaded copies cannot be recalled.':'Make this design visible to the client again?'))return;
        await request({action:'visibility',id:row.id,baseVersion:row.updated_at,visible:!row.visible});await refresh();
      })));
      card.append(a);grid.append(card);
    }
  }
  function openDesign(row,preview=false,replay=false){
    const presentation=presentations.find(p=>p.project===row.project);
    if(presentation&&(preview||!isOwner)&&(!presentation.completedAt||preview||replay)){
      const sequence=presentationRows(rows,presentation),target=sequence.findIndex(r=>r.id===row.id);
      const prefix=JSON.stringify([presentation,sequence.map(r=>[r.id,r.updated_at])]);
      const done=preview||replay?new Set():completed;
      const key=item=>prefix+item.id;
      const start=presentation.requireReview?sequence.findIndex((r,i)=>i<=target&&!done.has(key(r))):target;
      const index=start<0?target:start;
      if(index<0)return;
      function showAt(i){
        const current=sequence[i];if(!current)return;
        if(!preview)track('design_opened',current.id);
        const next=sequence[i+1];
        const finish=async()=>{
          done.add(key(current));render();if(next){showAt(i+1);return;}
          if(preview||presentation.completedAt||!sequence.every(item=>done.has(key(item))))return;
          const saveCompletion=async()=>{
            const result=await request({action:'complete_presentation',project:presentation.project,reviewId:presentation.reviewId||'legacy',baseVersion:presentationRevision,designIds:sequence.map(item=>item.id)});
            presentation.completedAt=result.completedAt;presentationRevision=result.presentationRevision;
            render();status.textContent='Presentation reviewed. All designs in this project can now be opened in any order on future visits. This is not design or quote approval.';
          };
          const attemptSave=async()=>{try{await saveCompletion();}catch(e){
            status.replaceChildren(el('span','Completion was not saved: '+e.message+' '),button('Retry saving completion',attemptSave));
          }};
          await attemptSave();
        };
        showDesign(()=>request({action:'read',id:current.id}),current.title,{
          requireExternalOpen:true,
          onExternalOpen:()=>{if(!preview)track('external_clicked',current.id);},
          onModelTime:preview?null:timing(current.id),
          continueLabel:current.kind==='link'?'I’ve watched / reviewed this — '+(next?'continue':'finish'):(next?'Continue to '+next.title:'Finish presentation'),
          onContinue:finish,onProblem:finish
        });
      }
      showAt(index);return;
    }
    const fallback=()=>{track('design_opened',row.id);return showDesign(()=>request({action:'read',id:row.id}),row.title,{onExternalOpen:()=>track('external_clicked',row.id),onModelTime:timing(row.id)});};
    return onOpenDesign?onOpenDesign(row,fallback):fallback();
  }
  function editPresentation(){
    const projects=[...new Set(rows.filter(r=>r.visible).map(r=>r.project))].sort();
    if(!projects.length){status.textContent='Add or publish a design first.';return;}
    const d=dialog('Presentation order'),label=el('label','Project / room'),select=el('select');label.append(select);
    projects.forEach(project=>{const option=el('option',project);option.value=project;select.append(option);});
    select.value=projects.includes(filter.value)?filter.value:projects[0];
    const reviewLabel=el('label','Require viewing in this order '),review=el('input');review.type='checkbox';reviewLabel.append(review);
    const againLabel=el('label','Require another guided review '),again=el('input');again.type='checkbox';againLabel.append(again);
    const list=el('ol'),error=el('p');error.setAttribute('role','alert');let ordered=[],saved='';
    const state=()=>JSON.stringify([ordered,review.checked,again.checked]);
    function paint(){list.replaceChildren();ordered.forEach((id,i)=>{const item=el('li',rows.find(r=>r.id===id)?.title||'Unavailable design');const up=button('Move up',()=>{[ordered[i-1],ordered[i]]=[ordered[i],ordered[i-1]];paint();});up.disabled=i===0;const down=button('Move down',()=>{[ordered[i+1],ordered[i]]=[ordered[i],ordered[i+1]];paint();});down.disabled=i===ordered.length-1;item.append(up,down);list.append(item);});}
    let selectedProject=select.value;
    function load(){selectedProject=select.value;const p=presentations.find(p=>p.project===select.value)||{project:select.value,ids:[]};ordered=presentationRows(rows,p).map(r=>r.id);review.checked=p.requireReview===true;again.checked=false;saved=state();paint();}
    select.onchange=()=>{if(state()!==saved&&!window.confirm('Discard unsaved presentation changes?')){select.value=selectedProject;return;}load();};
    const save=button('Save presentation',async()=>{save.disabled=true;error.textContent='Saving…';try{await request({action:'save_presentation',project:select.value,designIds:ordered,requireReview:again.checked||review.checked,requireAgain:again.checked,baseVersion:presentationRevision});await refresh();d.close();status.textContent='Presentation order saved. Use Preview presentation to check the client flow.';}catch(e){error.textContent=e.message;}finally{save.disabled=false;}},'btn btn-primary');
    const preview=button('Preview saved presentation',()=>{const p=presentations.find(p=>p.project===select.value);if(!p){error.textContent='Save the presentation first.';return;}if(state()!==saved){error.textContent='Save your changes before previewing.';return;}d.close();const first=presentationRows(rows,p)[0];if(first)openDesign(first,true);});
    const close=()=>{if(!save.disabled&&(state()===saved||window.confirm('Discard unsaved presentation changes?')))d.close();};
    d.querySelector('header button').onclick=close;d.addEventListener('cancel',event=>{event.preventDefault();close();});
    d.append(label,el('p','Move the tutorial first, followed by the model. This applies to standalone portal designs, not quote attachment order. New designs appear last; withdrawn designs are skipped.'),list,reviewLabel,againLabel,el('p','Finished presentations stay unlocked for everyone using this portal PIN, including other devices. Design or order changes keep completion unless you select Require another guided review and save; that also enables viewing in order. Partial progress resets on reload. External links and the viewing-problem fallback record acknowledgement, not proof of playback or quote approval. Admin previews do not record completion.'),save,preview,error);load();
  }
  function attach(row){
    const d=dialog('Attach design to quote'),label=el('label','Quote'),select=el('select');label.append(select);
    const quotes=getQuotes().filter(q=>!['invoice','change_order'].includes(String(q.type||q.data?.documentType||q.data?.type||'quote').toLowerCase())&&!['invoiced','paid'].includes(String(q.status).toLowerCase()));
    const empty=el('option','Choose a quote');empty.value='';select.append(empty);
    for(const q of quotes){const o=el('option',(q.data?.quoteTitle||q.data?.fileName||q.data?.file_name||q.client_name||'Quote')+' · '+(q.quote_number||''));o.value=q.id;select.append(o);}
    const reviewLabel=el('label','Show design before pricing '),review=el('input');review.type='checkbox';reviewLabel.append(review);
    const note=el('p','Clients review attached files in the order below before pricing when enabled. Each file has a viewing-problem fallback. Removing a file here does not delete it from the portal.');
    const selectionStatus=el('p',null,'qd-design-meta');selectionStatus.setAttribute('role','status');
    const error=el('p');error.setAttribute('role','alert');
    let ordered=[],savedState='';
    const attachmentState=()=>JSON.stringify({ids:ordered,review:review.checked});
    function closeAttachments(){
      if(save.disabled)return;
      if(select.value&&attachmentState()!==savedState){
        const prompt=dialog('Attachments haven’t been saved');
        prompt.append(el('p','You haven’t clicked Save attachments. Your changes will be lost if you leave now.'));
        const actions=el('div',null,'qd-design-actions');
        actions.append(button('Keep editing',()=>prompt.close(),'btn btn-primary'),button('Leave without saving',()=>{prompt.close();d.close();}));
        prompt.append(actions);return;
      }
      d.close();
    }
    d.querySelector('header button').onclick=closeAttachments;
    d.addEventListener('cancel',event=>{event.preventDefault();closeAttachments();});
    const list=el('ol'),available=el('select');available.setAttribute('aria-label','Design to add');
    for(const item of rows.filter(r=>r.visible)){const o=el('option',item.title);o.value=item.id;available.append(o);}available.value=row.id;
    function paint(){list.replaceChildren();ordered.forEach((id,i)=>{const li=el('li',rows.find(r=>r.id===id)?.title||'Unavailable design');
      const up=button('Move up',()=>{[ordered[i-1],ordered[i]]=[ordered[i],ordered[i-1]];paint();});up.disabled=i===0;
      const down=button('Move down',()=>{[ordered[i+1],ordered[i]]=[ordered[i],ordered[i+1]];paint();});down.disabled=i===ordered.length-1;
      li.append(up,down,button('Remove',()=>{ordered.splice(i,1);paint();}));list.append(li);});
      const selected=rows.find(r=>r.id===available.value);const alreadyAdded=Boolean(available.value&&ordered.includes(available.value));
      add.disabled=!available.value||alreadyAdded;add.textContent=alreadyAdded?'Already in attachment list':'Add selected file';
      selectionStatus.textContent=!select.value?'Choose a quote first.':alreadyAdded?(selected?.title||'This design')+' is already in the list. Choose the pricing option, then click Save attachments.':'Click Add selected file to include '+(selected?.title||'this design')+'.';
    }
    select.onchange=()=>{const link=attachments.find(a=>a.document_id===select.value);review.checked=link?.require_review===true;ordered=link?(link.design_ids||[link.design_id]).slice():[];savedState=attachmentState();if(!ordered.includes(row.id))ordered.push(row.id);error.textContent='';paint();};
    const add=button('Add selected file',()=>{if(available.value&&!ordered.includes(available.value)){ordered.push(available.value);error.textContent='';paint();}});
    available.onchange=paint;
    const replace=button('Replace all with selected file',()=>{if(available.value&&window.confirm('Replace this quote’s entire attachment list with the selected file? The other files will remain in the portal.')){ordered=[available.value];paint();}});
    const save=button('Save attachments',async()=>{if(!select.value){error.textContent='Choose a quote.';return;}save.disabled=true;try{await request({action:'attach_quote',documentId:select.value,designIds:ordered,requireReview:review.checked,baseVersion:attachments.find(a=>a.document_id===select.value)?.updated_at||null});await refresh();await onQuotesChanged();d.close();}catch(e){error.textContent=e.message;}finally{save.disabled=false;}});
    d.append(label,reviewLabel,note,list,available,selectionStatus,add,replace,save,error);paint();
  }
  function edit(previous){
    const d=dialog(previous?'Replace design':'Add design');const f=el('form');d.append(f);
    const fields={};
    function input(name,label,type='text',value='') {const wrap=el('label',label);const n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value;wrap.append(n);f.append(wrap);fields[name]=n;return n;}
    input('title','Design title','text',previous?.title||'').required=true;
    const roomLabel=el('label','Project / room'),roomSelect=el('select');roomSelect.setAttribute('aria-label','Project / room');roomLabel.append(roomSelect);f.append(roomLabel);
    const roomNames=[...new Set(['Project designs',...rows.map(row=>row.project),previous?.project].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    for(const name of roomNames){const option=el('option',name);option.value=name;roomSelect.append(option);}
    const newRoomOption=el('option','Create new room…');newRoomOption.value='';roomSelect.append(newRoomOption);
    roomSelect.value=previous?.project||filter.value||'Project designs';
    const newRoom=input('newRoom','New room name');newRoom.maxLength=160;
    const updateRoomField=()=>{newRoom.parentElement.hidden=roomSelect.value!=='';newRoom.required=roomSelect.value==='';};
    roomSelect.onchange=updateRoomField;updateRoomField();
    function selectedRoom(){const name=(roomSelect.value||newRoom.value).trim();if(!name)throw new Error('Enter a new room name.');return roomNames.find(room=>room.toLowerCase()===name.toLowerCase())||name;}
    input('version','Version','text',previous?String(Number(previous.version)+1 || previous.version):'1');
    input('note','Note for the client','textarea',previous?.note||'');
    const label=el('label','Design type');const kind=el('select');label.append(kind);f.append(label);
    for(const [v,t]of [['link','External design link'],['image','Image rendering'],['pdf','PDF drawing'],['interactive','Interactive HTML (automatic preparation)']]){const o=el('option',t);o.value=v;kind.append(o);}kind.value=previous?.kind||'link';
    const url=input('url','HTTPS design link','url');
    if(previous?.kind==='link')request({action:'read',id:previous.id}).then(r=>{if(!url.value)url.value=r.url||'';}).catch(e=>{error.textContent=e.message;});
    const file=input('file','Choose file (maximum 30 MB)','file');
    f.append(el('p','Files and thumbnails use your shared account storage and monthly upload-byte allowance. Replacements count; previews, links and metadata edits do not upload bytes. Check storage on the Dashboard for your allowance. Existing designs remain available at the limit. Keep originals locally.'));
    const thumbnail=input('thumbnail','Card thumbnail screenshot (optional)','file');thumbnail.accept='.png,.jpg,.jpeg,.webp';
    const thumbnailHelp=el('small',previous?.has_thumbnail?'Choose a new screenshot to replace the current thumbnail. Leave blank to keep it.':'Photo renderings use their image automatically. For interactive models or PDFs, choose a screenshot clients will see on the card.');thumbnail.parentElement.append(thumbnailHelp);
    const thumbnailPreview=el('img');thumbnailPreview.className='qd-design-thumbnail-preview';thumbnailPreview.hidden=true;thumbnailPreview.alt='Selected thumbnail preview';f.append(thumbnailPreview);
    let thumbnailPreviewUrl='';d.addEventListener('close',()=>{if(thumbnailPreviewUrl)URL.revokeObjectURL(thumbnailPreviewUrl);},{once:true});
    thumbnail.onchange=()=>{if(thumbnailPreviewUrl)URL.revokeObjectURL(thumbnailPreviewUrl);thumbnailPreviewUrl='';const chosen=thumbnail.files[0];thumbnailPreview.hidden=!chosen;if(chosen){thumbnailPreviewUrl=URL.createObjectURL(chosen);thumbnailPreview.src=thumbnailPreviewUrl;}};
    const help=el('p','QuoteDr prepares supported Three.js 0.160.1 HTML viewers on this device. Other viewers must be self-contained or shared as an External design link. Uploaded HTML runs in an isolated preview without network access. Preview and test the controls before publishing.');f.append(help);
    const reviewed=input('reviewed','I previewed this interactive design and its controls work.','checkbox');
    const error=el('p','', 'qd-design-error');error.setAttribute('role','status');f.append(error);
    let preparedFile=null,preparedPayload=null,previewedFile=null;
    const preview=button('Prepare & preview selected file',async()=>{preview.disabled=true;reviewed.checked=false;reviewed.disabled=true;error.textContent='Preparing viewer…';try{const selected=file.files[0],selectedKind=kind.value;const data=await filePayload();if(selected!==file.files[0]||selectedKind!==kind.value)return;const opened=await showDesign(async()=>data,fields.title.value||'Design preview');if(!opened||selected!==file.files[0]||selectedKind!==kind.value)return;previewedFile=selected;reviewed.disabled=false;error.textContent='Preview opened. Test the model and controls, then confirm below before publishing.';}catch(e){error.textContent=e.message;}finally{preview.disabled=false;}});f.append(preview);
    const save=el('button',previous?'Publish replacement':'Add to portal','btn btn-primary');save.type='submit';f.append(save);
    function changed(){const link=kind.value==='link';url.parentElement.hidden=!link;file.parentElement.hidden=link;reviewed.parentElement.hidden=kind.value!=='interactive';preview.hidden=link;file.accept=kind.value==='interactive'?'.html':kind.value==='pdf'?'.pdf':'.png,.jpg,.jpeg,.webp';reviewed.checked=false;}
    function resetPreparation(){preparedFile=preparedPayload=previewedFile=null;reviewed.checked=false;reviewed.disabled=true;error.textContent='';}
    kind.onchange=()=>{changed();resetPreparation();};file.onchange=resetPreparation;changed();resetPreparation();
    async function filePayload(){const selected=file.files[0],selectedKind=kind.value;if(!selected)throw new Error('Choose a file to preview.');if(selected.size>MAX_DESIGN_BYTES)throw new Error('Choose a file no larger than 30 MB.');if(preparedFile===selected&&preparedPayload?.kind===selectedKind)return preparedPayload;let bytes=new Uint8Array(await selected.arrayBuffer());const mime=selectedKind==='interactive'?'text/html':selected.type;
      if(selectedKind==='interactive'){const result=await prepareDesignHtml(new TextDecoder().decode(bytes));bytes=new TextEncoder().encode(result.html);}if(selected!==file.files[0]||selectedKind!==kind.value)throw new Error('The selected file changed. Please preview it again.');const payload={kind:selectedKind,mime,size:bytes.length,file:new Blob([bytes],{type:mime})};preparedFile=selected;preparedPayload=payload;return payload;}
    f.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;error.textContent='Saving…';error.classList.add('is-saving');try{
      const project=selectedRoom();
      const keepFile=previous&&previous.kind===kind.value&&kind.value!=='link'&&!file.files[0];
      if(kind.value==='interactive'&&!keepFile&&(!reviewed.checked||previewedFile!==file.files[0]))throw new Error('Preview the interactive design and confirm its controls work first.');
      const chosenThumbnail=thumbnail.files[0]||(kind.value==='image'&&file.files[0]?file.files[0]:null);
      const data={action:'save',id:previous?.id,baseVersion:previous?.updated_at,title:fields.title.value,project,version:fields.version.value,note:fields.note.value,kind:kind.value,url:url.value,...(kind.value==='link'?{}:keepFile?{keepFile:true,mime:previous.mime_type,size:previous.size_bytes}:await filePayload()),...(chosenThumbnail?await thumbnailPayload(chosenThumbnail):{})};designInput(data);
      const saved=await request(data);d.close();await refresh();status.textContent='Design saved to the portal.'+(saved.usage?' '+usageMessage(saved.usage):'');
    }catch(e){error.textContent=e.message;}finally{error.classList.remove('is-saving');save.disabled=false;}};
  }
  function reviewDesigns(documentId){
    if(!isOwner)return [];
    const link=attachments.find(a=>a.document_id===documentId);
    if(!link?.require_review)return [];
    return (link.design_ids||[link.design_id]).map(id=>rows.find(r=>r.id===id&&r.visible)).filter(Boolean);
  }
  return {refresh,reviewDesigns};
}
