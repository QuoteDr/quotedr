import {createClient} from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {isDue,localClock,validateSchedule,validateSubscription} from '../_shared/labor-push-policy.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const fixedUrl='https://quotedr.io/labor-tracker.html#laborWorklog';
async function send(row:any,test=false){
    const subscription=validateSubscription(row.subscription);
    await webpush.sendNotification(subscription,JSON.stringify({type:'qdr-labor',title:test?'QDR test reminder':'What did you work on today?',body:'Tap to record your work and review your hours.',url:fixedUrl}),{
        vapidDetails:{subject:Deno.env.get('LABOR_VAPID_SUBJECT')!,publicKey:Deno.env.get('LABOR_VAPID_PUBLIC_KEY')!,privateKey:Deno.env.get('LABOR_VAPID_PRIVATE_KEY')!},TTL:900,timeout:10000,
    });
}
Deno.serve(async req=>{
    if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    try{
        if(Number(req.headers.get('content-length')||0)>10000)return json({error:'Request too large'},413);
        const raw=await req.text();if(raw.length>10000)return json({error:'Request too large'},413);
        const body=JSON.parse(raw||'{}');
        const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const db=createClient(url,service);
        const ready=!!(Deno.env.get('LABOR_VAPID_PUBLIC_KEY')&&Deno.env.get('LABOR_VAPID_PRIVATE_KEY')&&Deno.env.get('LABOR_VAPID_SUBJECT'));
        const active=Deno.env.get('LABOR_WEB_PUSH_ENABLED')==='true';
        if(body.action==='dispatch'){
            const secret=Deno.env.get('LABOR_REMINDER_CRON_SECRET');
            if(!secret||req.headers.get('Authorization')!==`Bearer ${secret}`)return json({error:'Unauthorized'},401);
            if(!active||!ready)return json({skipped:'Delivery disabled or not configured'});
            const {data:rows,error}=await db.from('labor_web_push_settings').select('*').eq('enabled',true);if(error)throw error;
            let accepted=0;
            for(const row of rows||[]){
                const now=new Date();let date:string;
                try{if(!isDue(row,now))continue;date=localClock(now,row.timezone).date;}catch{continue;}
                const answered=await db.from('labor_daily_checkins').select('id').eq('user_id',row.user_id).eq('checkin_date',date).limit(1);
                if(answered.error||answered.data?.length)continue; // Fail closed on uncertainty.
                // Shared daily claim also prevents a native evening reminder for this date.
                const claim=await db.from('labor_notification_logs').insert({user_id:row.user_id,notification_type:'evening',local_date:date,scheduled_for:now.toISOString(),status:'pending'}).select('id').single();
                if(claim.error||!claim.data)continue;
                try{await send(row);accepted++;await db.from('labor_notification_logs').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',claim.data.id);}
                catch(e){await db.from('labor_notification_logs').update({status:'failed',error:'Push delivery failed; use the in-app check-in.'}).eq('id',claim.data.id);if([404,410].includes((e as any).statusCode))await db.from('labor_web_push_settings').update({enabled:false,subscription:null}).eq('user_id',row.user_id);}
            }
            return json({accepted});
        }
        const client=createClient(url,anon,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
        const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return json({error:'Sign in required'},401);
        const uid=auth.data.user.id;
        if(body.action==='config')return json({ready:ready&&active,publicKey:ready?Deno.env.get('LABOR_VAPID_PUBLIC_KEY'):null});
        if(body.action==='disable'){
            const result=await db.from('labor_web_push_settings').update({enabled:false,subscription:null,updated_at:new Date().toISOString()}).eq('user_id',uid);if(result.error)throw result.error;
            return json({disabled:true});
        }
        if(!active||!ready)return json({error:'Push delivery is not configured yet. Your in-app check-in remains available.'},503);
        if(body.action==='subscribe'){
            validateSchedule(body.time,body.timezone);
            const subscription=validateSubscription(body.subscription);
            const result=await db.from('labor_web_push_settings').upsert({user_id:uid,enabled:true,subscription,reminder_time:body.time,timezone:body.timezone,weekends:body.weekends===true,updated_at:new Date().toISOString()});if(result.error)throw result.error;
            // This explicit web opt-in replaces the older morning/evening mobile schedule.
            const legacy=await db.from('labor_notification_settings').update({enabled:false}).eq('user_id',uid);
            if(legacy.error){await db.from('labor_web_push_settings').update({enabled:false}).eq('user_id',uid);throw Error('Could not turn off the previous reminder schedule. Web reminders remain off.');}
            return json({enabled:true});
        }
        if(body.action==='test'){
            const saved=await db.from('labor_web_push_settings').select('*').eq('user_id',uid).eq('enabled',true).single();if(saved.error||!saved.data)return json({error:'Enable reminders on this device first.'},400);
            const bucket=String(Math.floor(Date.now()/300000));
            const claim=await db.from('labor_web_push_tests').insert({user_id:uid,bucket});if(claim.error)return json({error:claim.error.code==='23505'?'A test was already attempted in this five-minute window. Please wait.':'Could not reserve this test. Try later.'},claim.error.code==='23505'?429:503);
            try { await send(saved.data,true); } catch { return json({error:'Push test failed. Check device permissions and re-enable reminders before retrying.'},502); }
            return json({accepted:true}); // Provider acceptance, not device receipt.
        }
        return json({error:'Unknown action'},400);
    }catch(error){return json({error:(error as Error).message||'Push request failed'},400);}
});
