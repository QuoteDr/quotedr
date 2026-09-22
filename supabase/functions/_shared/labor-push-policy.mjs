export function localClock(now, timezone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now).map(p=>[p.type,p.value]));
    return {date:`${p.year}-${p.month}-${p.day}`, minute:Number(p.hour)*60+Number(p.minute), weekend:['Sat','Sun'].includes(p.weekday)};
}
export function validateSchedule(time, timezone) {
    if(typeof timezone !== 'string' || timezone.length > 100) throw Error('Choose a valid time zone.');
    if(!/^(0[8-9]|1\d):[0-5]\d$/.test(time)) throw Error('Choose a reminder time from 08:00 through 19:59. Quiet hours are 20:00–08:00.');
    localClock(new Date(),timezone);
}
export function isDue(row,now) {
    if(!row.enabled)return false;
    validateSchedule(row.reminder_time.slice(0,5),row.timezone);
    const clock=localClock(now,row.timezone);
    if(clock.weekend&&!row.weekends)return false;
    const [h,m]=row.reminder_time.split(':').map(Number),delta=clock.minute-h*60-m;
    return clock.minute>=480&&clock.minute<1200&&delta>=0&&delta<15;
}
export function validateSubscription(value) {
    if(!value || typeof value.endpoint!=='string' || value.endpoint.length>2048)throw Error('Invalid subscription');
    const url=new URL(value.endpoint);
    const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
    if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed.includes(url.hostname))throw Error('Unsupported push provider');
    if(!/^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth||''))throw Error('Invalid push keys');
    return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
