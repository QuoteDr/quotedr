import {showDesign} from './portal-designs.js?v=2026090703';
function css(){if(!document.querySelector('[data-design-review-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./portal-designs.css',import.meta.url);link.dataset.designReviewCss='';document.head.append(link);}}
function button(text,click){const b=document.createElement('button');b.type='button';b.className='btn btn-outline-primary';b.textContent=text;b.onclick=click;return b;}
// Measure foreground time, not attention. Heartbeat deltas are bounded so suspend
// and lost page-close events cannot add hours or duplicate a session's total.
export function visibleDesignTimer(send,doc=document,clock=()=>performance.now(),schedule=setInterval,cancel=clearInterval){
  let last=clock(),seconds=0,stopped=false;
  function sample(){const now=clock();if(!doc.hidden)seconds+=Math.min(2,Math.max(0,(now-last)/1000));last=now;}
  function flush(){const value=Math.floor(seconds);seconds-=value;if(value)send(value);}
  function visibility(){last=clock();if(doc.hidden)flush();}
  let ticks=0;const timer=schedule(()=>{sample();if(++ticks%15===0)flush();},1000);
  doc.addEventListener('visibilitychange',visibility);
  return ()=>{if(stopped)return;stopped=true;sample();flush();cancel(timer);doc.removeEventListener('visibilitychange',visibility);};
}
export async function openAttachedDesign(design,request,onContinue){
  css();const sessionId=crypto.randomUUID();
  const base={revision:design.revision,sessionId};let stop=()=>{},closed=false;
  const ok=await showDesign(async()=>{const data=await request({...base,operation:'open'});
    // External pages cannot be timed reliably from the portal.
    if(!closed&&!data.url)stop=visibleDesignTimer(durationSeconds=>request({...base,operation:'duration',durationSeconds}).catch(()=>{}));
    return data;
  },design.title,{onClose:()=>{closed=true;stop();},onContinue:onContinue?()=>onContinue(sessionId):undefined});
  return {ok,sessionId};
}
export function reviewBeforeQuote(design,request){
  css();return new Promise((resolve,reject)=>{
    const d=document.createElement('dialog');d.className='qd-design-dialog';
    const heading=document.createElement('h2');heading.textContent='Explore your design';
    const text=document.createElement('p');text.textContent='Take a look at '+design.title+' before continuing to your quote. Viewing the design does not approve the work.';
    const error=document.createElement('p');error.setAttribute('role','status');
    let sessionId=crypto.randomUUID(),done=false,busy=false;
    const next=button('Continue to quote',()=>finish('continue'));next.disabled=true;
    const open=button('Open design',async()=>{open.disabled=true;try{const result=await openAttachedDesign(design,request,id=>{sessionId=id;finish('continue');});sessionId=result.sessionId;next.disabled=!result.ok;}catch(e){error.textContent=e.message;}finally{open.disabled=false;}});
    const problem=button('Design won’t open — continue to quote',()=>finish('problem'));
    async function finish(operation){if(busy)return;busy=true;next.disabled=problem.disabled=true;try{await request({operation,revision:design.revision,sessionId});done=true;d.close();resolve();}catch(e){error.textContent=e.message;}finally{busy=false;next.disabled=false;problem.disabled=false;}}
    d.append(heading,text,open,next,problem,error);document.body.append(d);
    d.addEventListener('close',()=>{d.remove();if(!done)reject(new Error('Design review closed. Reopen the quote to continue.'));},{once:true});d.showModal();
  });
}
export function addAttachedDesignButton(design,request){
  if(!design || document.getElementById('qdAttachedDesign'))return;
  const b=button('View attached design',()=>openAttachedDesign(design,request));b.id='qdAttachedDesign';b.style.cssText='position:fixed;bottom:16px;left:16px;z-index:1040;background:white';document.body.append(b);
}
