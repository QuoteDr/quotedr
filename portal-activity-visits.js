// Presentation only: retain raw events and aggregate design heartbeat chunks per visit.
(function(root) {
    'use strict';
    function designVisits(events) {
        const sorted = (Array.isArray(events) ? events : []).map((event,index)=>({event,index})).sort((a,b)=>{
            const delta = (Date.parse(a.event.created_at)||0)-(Date.parse(b.event.created_at)||0);
            if(delta) return delta;
            if(a.event.event_type==='design_opened' && b.event.event_type!=='design_opened') return -1;
            if(b.event.event_type==='design_opened' && a.event.event_type!=='design_opened') return 1;
            return a.index-b.index;
        });
        const active = new Map(), result = [];
        sorted.forEach(({event,index})=>{
            const meta = event.metadata || {};
            const key = JSON.stringify([event.document_id,event.session_id,meta.design_id,meta.design_version]);
            const identifiable = !!event.session_id && !!meta.design_id;
            const type = event.event_type;
            if(type==='design_opened') {
                const visit = {...event,metadata:{...meta},duration_seconds:0};
                if(identifiable) active.set(key,visit);
                result.push(visit);
            } else if(type==='design_view_duration') {
                let visit = identifiable && active.get(key);
                if(!visit) {
                    visit = {...event,metadata:{...meta},duration_seconds:0};
                    if(identifiable) active.set(key,visit);
                    result.push(visit);
                }
                visit.duration_seconds += Math.max(0,parseInt(event.duration_seconds,10)||0);
                visit.event_type = 'design_view_duration';
            } else {
                result.push({...event});
                if(type==='design_continued' || type==='design_viewing_problem') active.delete(key);
            }
        });
        return result;
    }
    function locationDetails(event) {
        const meta = event && event.metadata || {};
        const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        let country = meta.location_country || '';
        if (/^[A-Z]{2}$/.test(country)) {
            try { country = new Intl.DisplayNames(['en'], {type:'region'}).of(country); } catch (_) {}
        }
        const parts = meta.location_source === 'cloudflare_approximate'
            ? [meta.location_city, meta.location_region, country].filter(v=>typeof v==='string' && v.trim()).map(v=>v.slice(0,100)) : [];
        return '<details class="small mt-1"><summary>More info</summary><div>Approximate location: ' +
            (parts.length ? parts.map(escape).join(', ') : 'Location unavailable') +
            '</div><div class="text-muted">Network estimate, not GPS or proof of identity. VPNs and mobile networks can show another location. Older or unrecorded visits may have no location.</div></details>';
    }
    root.QuoteDrActivityVisits = {designVisits, locationDetails};
})(typeof window !== 'undefined' ? window : globalThis);
