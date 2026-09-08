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
    root.QuoteDrActivityVisits = {designVisits};
})(typeof window !== 'undefined' ? window : globalThis);
