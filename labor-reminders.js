(function (global) {
    'use strict';
    async function mount(root, setup = false) {
        if (!root || root.dataset.loaded) return;
        root.dataset.loaded = 'true';
        const client = global._supabaseClient;
        const {data: {user}} = await client.auth.getUser();
        if (!user) return;
        root.className = 'card p-3 mb-3';
        root.innerHTML = '<h2 class="h5">Daily work check-in</h2><p data-count>Checking your work logs…</p><p><a href="labor-tracker.html#laborWorklog">Open Daily Work Check-in</a></p>';
        const pending = await client.from('labor_daily_checkins').select('id', {count:'exact', head:true}).eq('user_id',user.id).eq('reviewed',false).contains('raw_payload',{version:2,status:'pending'});
        root.querySelector('[data-count]').textContent = pending.error ? 'Work-log count unavailable. You can still open your check-in.' : `${pending.count || 0} work logs awaiting review. Record tasks and hours, then approve them before using suggested production rates.`;
        if (!setup) return;
        const panel = document.createElement('div');
        panel.innerHTML = '<h3 class="h6">Optional phone reminders</h3><p>No SMS number needed. One browser/device per account; enabling here replaces your older mobile reminder schedule. Quiet hours: 8 pm–8 am.</p><label>Reminder time <input data-time type="time" min="08:00" max="19:59" value="17:30" class="form-control"></label> <label><input data-weekends type="checkbox"> Include weekends</label><p data-zone></p><div class="d-flex flex-wrap gap-2"><button type="button" data-enable class="btn btn-primary" disabled>Enable reminders on this device</button><button type="button" data-test class="btn btn-outline-primary" disabled>Send test notification</button><button type="button" data-disable class="btn btn-outline-secondary">Turn off reminders</button></div><p data-status role="status" class="mt-2"></p>';
        root.append(panel);
        const status = panel.querySelector('[data-status]'), enable = panel.querySelector('[data-enable]'), test = panel.querySelector('[data-test]');
        const time = panel.querySelector('[data-time]'), weekends = panel.querySelector('[data-weekends]');
        let zone = Intl.DateTimeFormat().resolvedOptions().timeZone, config;
        async function call(body) {
            const {data,error} = await client.functions.invoke('labor-web-push',{body});
            if(error || data?.error) throw Error(data?.error || 'Reminder request failed. Check your connection and try again.');
            return data;
        }
        const saved = await client.from('labor_web_push_settings').select('*').eq('user_id',user.id).maybeSingle();
        if(saved.data){time.value=saved.data.reminder_time.slice(0,5);weekends.checked=saved.data.weekends;zone=saved.data.timezone;}
        panel.querySelector('[data-zone]').textContent = `Time zone: ${zone}. Re-enable to save schedule changes.`;
        const supported = global.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
        try { config=await call({action:'config'}); } catch { /* Setup may not yet be deployed. */ }
        enable.disabled = !supported || !config?.ready;
        test.disabled = !saved.data?.enabled || !config?.ready;
        status.textContent = !supported ? 'Push is unavailable in this browser. On iPhone, add QDR to your Home Screen and open it there. Your work-log card remains available.' : !config?.ready ? 'Phone reminders are not configured on the server yet. Your work-log card remains available.' : saved.data?.enabled ? 'Reminders enabled for your saved device. Use Send test notification to check delivery.' : 'Reminders are off. Enable only if you want a daily nudge.';
        let busy = false;
        async function run(work) {
            if(busy)return;busy=true;
            panel.querySelectorAll('button').forEach(b=>b.disabled=true);
            try {await work();} catch(e){status.textContent=e.message;}
            finally {busy=false;enable.disabled=!supported||!config?.ready;panel.querySelector('[data-disable]').disabled=false;test.disabled=!saved.data?.enabled||!config?.ready;}
        }
        enable.onclick=()=>run(async()=>{
            // Ask directly from a user click, never on page load.
            if(await Notification.requestPermission()!=='granted')throw Error('Notifications were not allowed. Enable them in browser settings if desired; the work-log card still works.');
            if(!time.checkValidity())throw Error('Choose a time between 08:00 and 19:59.');
            const registration=await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
            const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
            await call({action:'subscribe',subscription:subscription.toJSON(),time:time.value,timezone:zone,weekends:weekends.checked});
            saved.data={enabled:true};status.textContent='Reminders enabled. Send a test and confirm it appears on your phone. Delivery can be delayed by phone settings or connectivity.';
        });
        test.onclick=()=>run(async()=>{await call({action:'test'});status.textContent='Push service accepted the test. Confirm it appeared on your phone. Tests are limited to one attempt per five-minute window.';});
        panel.querySelector('[data-disable]').onclick=()=>run(async()=>{
            await call({action:'disable'});saved.data={enabled:false};
            // Keep the browser subscription: it may be used by another signed-in account.
            status.textContent='QDR web reminders are off. This does not re-enable the old mobile reminder schedule.';
        });
    }
    global.QuoteDrLaborReminders={mount};
})(window);
