(function(global) {
    'use strict';
    const num = value => Number(value);
    const key = (category, name, unit) => JSON.stringify([category,name,unit].map(v => String(v || '').trim().toLowerCase()));
    function items(row) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {};
        return (data.rooms || []).flatMap((room, roomIndex) => (room.items || []).map((item,index) => ({
            roomIndex, index, roomId:room.id, roomName:room.name || 'Room',
            name:item.description || item.serviceName || item.name || 'Unnamed item',
            category:item.category || '', unit:item.unitType || item.unit || '', quantity:num(item.quantity),
            labor:JSON.parse(JSON.stringify(item.laborTime || {})), removed:!!item._removed
        }))).filter(item => !item.removed);
    }
    function makeRow(input, item, userId, id) {
        const elapsed = num(input.elapsed), crew = num(input.crew), quantity = num(input.quantity);
        if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 24 || !Number.isInteger(crew) || crew < 1 || crew > 100) throw Error('Enter hours greater than zero (up to 24) and a whole crew count (1–100).');
        if (!['normal','extra_scope','rework','waiting'].includes(input.kind)) throw Error('Choose the type of work.');
        if (input.kind === 'normal' && (!Number.isFinite(quantity) || quantity <= 0)) throw Error('Enter the quantity actually completed, not the entire quote quantity.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(input.date+'T12:00:00Z').toISOString().slice(0,10) !== input.date) throw Error('Choose a valid work date.');
        const laborHours = Math.round(elapsed * crew * 100) / 100;
        if(laborHours < 0.01) throw Error('Record at least 0.01 labour-hours.');
        const completed = input.kind === 'normal' ? quantity : null;
        if(completed && (completed > 9999999999 || completed < 0.01)) throw Error('Completed quantity must be at least 0.01 and within the supported range.');
        const unitsPerHour = Math.round((completed || 1)/laborHours*10000)/10000;
        if(unitsPerHour <= 0 || unitsPerHour >= 100000000) throw Error('Quantity and hours produce an unsupported rate. Check the units.');
        return {id, user_id:userId, checkin_date:input.date, quote_id:input.quoteId,
            item_name:item.name, item_category:item.category, item_unit:item.unit,
            quantity:completed || 1, hours:laborHours, units_per_hour:unitsPerHour,
            notes:String(input.notes || '').slice(0,4000), source:'manual', reviewed:false, applied_to_saved_item:false,
            raw_payload:{version:2, kind:input.kind, elapsedHours:elapsed, crewSize:crew, completedQuantity:completed,
                worker:String(input.worker || '').slice(0,120), itemSnapshot:item, status:'pending', quoteVersion:input.quoteVersion || null}};
    }
    function suggestions(rows) {
        const groups = new Map();
        for (const row of rows) {
            const p = row.raw_payload;
            if (!row.reviewed || p?.version !== 2 || p.status !== 'approved' || p.kind !== 'normal' || !(num(p.completedQuantity)>0) || !(num(row.hours)>0)) continue;
            const k = key(row.item_category,row.item_name,row.item_unit);
            const g = groups.get(k) || {name:row.item_name,category:row.item_category,unit:row.item_unit,quantity:0,hours:0,count:0};
            g.quantity += num(p.completedQuantity); g.hours += num(row.hours); g.count++; groups.set(k,g);
        }
        return [...groups.values()].map(g => ({...g,unitsPerHour:g.quantity/g.hours}));
    }
    function estimatedHours(snapshot, quantity) {
        const l = snapshot.labor || {};
        if(l.mode === 'units_per_hour' && num(l.unitsPerHour)>0) return quantity/num(l.unitsPerHour);
        if(l.mode === 'fixed_hours' && num(l.fixedHours)>0) return quantity*num(l.fixedHours);
        return null;
    }
    async function mount(root, quotes, sessions) {
        if (!root || root.dataset.loaded) return;
        root.dataset.loaded = 'true';
        const user = await global.getCurrentUser();
        if (!user) {root.textContent='Sign in to record work.'; return;}
        const db = global._supabaseClient;
        const el = (tag,text) => {const node=document.createElement(tag); if(text)node.textContent=text; return node;};
        root.append(el('h2','Daily Work Check-in'),el('p','Assign actual work to a quote item. Hours × crew = labour-hours. GPS sessions remain separate and require their own review. No SMS is sent by this form.'));
        const form=el('form'); form.className='row g-2'; root.append(form);
        function field(label,type) {const wrap=el('label',label); wrap.className='col-12 col-md-6'; const control=el(type==='select'?'select':'input'); if(type!=='select')control.type=type; control.className='form-control'; wrap.append(control);form.append(wrap);return control;}
        const quote=field('Quote','select'), itemSelect=field('Room / line item','select'),date=field('Work date','date'),worker=field('Worker or crew name','text'),elapsed=field('Hours worked per person (exclude unpaid breaks)','number'),crew=field('People working those hours','number'),quantity=field('Quantity completed today','number'),kind=field('Type of work','select'),notes=field('What did you do?','text');
        date.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); date.required=true;
        elapsed.step='0.01';elapsed.min='0.01';elapsed.max='24';elapsed.required=true;crew.value='1';crew.min='1';crew.max='100';crew.required=true;quantity.step='0.01';quantity.min='0.01';quantity.required=true;
        [['normal','Original scope / normal work'],['extra_scope','Extra scope'],['rework','Rework'],['waiting','Waiting / delays']].forEach(([v,t])=>kind.add(new Option(t,v)));
        const rowMap=new Map(quotes.filter(q => (q.document_type || 'quote') === 'quote').map(q=>[q.id,q]));
        quote.add(new Option('Choose quote…','')); rowMap.forEach(row=>{const d=typeof row.data==='string'?JSON.parse(row.data):row.data||{};quote.add(new Option([row.quote_number,d.quoteTitle,row.client_name].filter(Boolean).join(' · '),row.id));});
        let choices=[], operation=null, busy=false;
        global.addEventListener('beforeunload',event=>{if(operation){event.preventDefault();event.returnValue='';}});
        quote.onchange=()=>{choices=quote.value?items(rowMap.get(quote.value)):[];itemSelect.replaceChildren(new Option('Choose item…',''));choices.forEach((item,i)=>itemSelect.add(new Option(item.roomName+' · '+item.name+' ('+item.unit+')',String(i))));};
        quote.onchange(); quote.required=true;itemSelect.required=true;
        kind.onchange=()=>{quantity.disabled=kind.value!=='normal';quantity.required=!quantity.disabled;};
        const submit=el('button','Save draft work log');submit.type='submit';submit.className='btn btn-primary col-12';form.append(submit);
        const status=el('p');status.setAttribute('role','status');root.append(status);
        const history=el('div');root.append(history);
        async function reload() {
            const response=await db.from('labor_daily_checkins').select('*').eq('user_id',user.id).order('checkin_date',{ascending:false}).limit(500);
            if(response.error) throw response.error;
            history.replaceChildren(el('h3','Review work logs and rate suggestions'));
            const rows=(response.data||[]).filter(row=>row.raw_payload?.version===2);
            rows.forEach(row=>{
                const p=row.raw_payload, card=el('div');card.className='border rounded p-3 mb-2';
                const estimate=p.kind==='normal'?estimatedHours(p.itemSnapshot,num(p.completedQuantity)):null;
                card.append(el('strong',row.checkin_date+' · '+p.itemSnapshot.roomName+' · '+row.item_name),el('p',p.kind+' · '+row.hours+' labour-hours ('+p.elapsedHours+' hours × '+p.crewSize+' people) · '+p.status),el('p',row.notes));
                if(estimate!==null)card.append(el('p','Original estimated labour for this completed quantity: '+estimate.toFixed(2)+' hours. Actual: '+num(row.hours).toFixed(2)+' hours.'));
                if(p.status==='pending') ['approved','rejected'].forEach(action=>{const b=el('button',action==='approved'?'Approve log':'Reject log');b.className='btn btn-outline-primary me-2';b.onclick=async()=>{b.disabled=true;try{const result=await db.from('labor_daily_checkins').update({reviewed:action==='approved',raw_payload:{...p,status:action},updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('id',row.id).eq('updated_at',row.updated_at).select('id');if(result.error)throw result.error;if(result.data?.length!==1)throw Error('This log changed. Reload before reviewing.');await reload();}catch(e){status.textContent=e.message;b.disabled=false;}};card.append(b);});
                history.append(card);
            });
            suggestions(rows).forEach(rate=>history.append(el('p','Suggested '+rate.category+' / '+rate.name+' ['+rate.unit+']: '+rate.unitsPerHour.toFixed(2)+' units per labour-hour from '+rate.count+' approved logs. To adopt: Manage Line Items → Labor Time → Units/hr. Review the existing value and save explicitly. Existing quotes are unchanged.')));
            const days=new Map();
            rows.filter(row=>row.reviewed && row.raw_payload.status==='approved').forEach(row=>{const k=row.quote_id+'|'+row.checkin_date;const d=days.get(k)||{quote:row.quote_id,date:row.checkin_date,hours:0};d.hours+=num(row.hours);days.set(k,d);});
            days.forEach(day=>{
                const recorded=(sessions||[]).filter(s=>s.quote_id===day.quote && s.status==='approved' && new Date(s.started_at).toLocaleDateString('en-CA')===day.date).reduce((n,s)=>n+num(s.duration_minutes||0)/60,0);
                history.append(el('p',day.date+' · quote '+day.quote+': '+day.hours.toFixed(2)+' allocated labour-hours; '+recorded.toFixed(2)+' approved tracker session-hours loaded (last 90 days). Differences need review: crew coverage, breaks and session dates may differ. Neither number changes the other.'));
            });
            history.append(el('p','Suggestions use only approved normal-work logs in the latest 500 records. Small samples are provisional. Different tasks with the same category, name and unit are pooled—review scope before adopting. Extra scope, rework and waiting are excluded. This is not a payroll record or a schedule with dependencies.'));
        }
        form.onsubmit=async event=>{
            event.preventDefault();if(busy)return;busy=true;submit.disabled=true;
            try {
                if(!operation){const item=choices[Number(itemSelect.value)];if(!item||!rowMap.has(quote.value)||itemSelect.value==='')throw Error('Choose a quote and item.');operation=makeRow({quoteId:quote.value,quoteVersion:rowMap.get(quote.value).updated_at,date:date.value,worker:worker.value,elapsed:elapsed.value,crew:crew.value,quantity:quantity.value,kind:kind.value,notes:notes.value},item,user.id,crypto.randomUUID());}
                // Fixed UUID and immutable payload allow a safe retry after uncertain delivery.
                const exists=await db.from('labor_daily_checkins').select('id').eq('user_id',user.id).eq('id',operation.id).maybeSingle();if(exists.error)throw exists.error;
                if(!exists.data){const saved=await db.from('labor_daily_checkins').insert(operation).select('id').single();if(saved.error)throw saved.error;}
                operation=null; elapsed.value=''; quantity.value=''; notes.value='';status.textContent='Draft saved. Review below; no estimate or GPS session was changed.';
                try{await reload();}catch(e){status.textContent='Draft saved, but review list could not refresh: '+e.message+'. Reload the page to review it; do not re-enter this log.';}
            }catch(e){status.textContent='Not confirmed: '+e.message+'. Keep this page open and retry to check the same log; do not enter it again elsewhere.';}
            finally{busy=false;submit.disabled=false;submit.textContent=operation?'Retry same draft':'Save draft work log';[quote,itemSelect,date,worker,elapsed,crew,quantity,kind,notes].forEach(control=>control.disabled=!!operation);if(!operation)kind.onchange();}
        };
        try{await reload();}catch(e){status.textContent='Work logs unavailable: '+e.message+'. Existing tracker functions remain available.';}
    }
    global.QuoteDrLaborWorklog={items,makeRow,suggestions,estimatedHours,mount};
})(window);
