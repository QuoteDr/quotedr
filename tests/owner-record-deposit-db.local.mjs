// Optional isolated PostgreSQL verification: install @electric-sql/pglite in
// os.tmpdir()/qdr-deposit-db-test, not in the product package/bundle.
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {PGlite}=require(path.join(tmpdir(),'qdr-deposit-db-test/node_modules/@electric-sql/pglite'));
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table quotes(id uuid primary key,user_id uuid,status text,data jsonb,updated_at timestamptz);
create table payment_records(id uuid primary key,user_id uuid,quote_id uuid references quotes(id),invoice_id uuid,
payment_type text,status text,provider text,method text,amount_cents bigint check(amount_cents>0),currency text,
confirmed_at timestamptz,confirmed_by uuid,paid_at timestamptz,updated_at timestamptz,description text,
idempotency_key text unique,metadata jsonb);`);
await db.exec(fs.readFileSync('supabase/migrations/20261001180000_owner_record_deposit.sql','utf8'));
const owner='00000000-0000-4000-8000-000000000001',quote='00000000-0000-4000-8000-000000000002',actor='00000000-0000-4000-8000-000000000003';
await db.query('insert into quotes values($1,$2,\'accepted\',\'{}\',\'2026-10-01T12:00:00Z\')',[quote,owner]);
const record={id:'00000000-0000-4000-8000-000000000004',user_id:owner,quote_id:quote,payment_type:'deposit',status:'confirmed',provider:'manual',method:'etransfer',amount_cents:10000,currency:'cad',confirmed_by:actor,confirmed_at:'2026-10-01T13:00:00Z',paid_at:'2026-10-01T13:00:00Z',updated_at:'2026-10-01T13:00:00Z',description:'Contractor receipt',idempotency_key:'test-receipt-12345678',metadata:{source:'dashboard_owner_deposit'}};
const call=(r=record,expected='2026-10-01T12:00:00Z',records=[])=>db.query('select record_owner_deposit($1,$2,$3,$4,$5,$6,$7) result',[owner,quote,expected,JSON.stringify(records),JSON.stringify(r),JSON.stringify({balance_due_cents:50000,payments:[r]}),'accepted']);
const first=await call();assert.equal(first.rows[0].result.replayed,false);
assert.equal((await db.query('select count(*)::int n from payment_records')).rows[0].n,1);
assert.equal((await db.query('select data from quotes')).rows[0].data.balance_due_cents,50000);
const replay=await call();assert.equal(replay.rows[0].result.replayed,true);
await assert.rejects(call({...record,amount_cents:11000}),/conflicts/);
const second={...record,id:'00000000-0000-4000-8000-000000000005',idempotency_key:'test-receipt-23456789'};
await assert.rejects(call(second),/quote changed/i);
await assert.rejects(call(second,'2026-10-01T13:00:00Z'),/Payments changed/);
assert.equal((await db.query('select count(*)::int n from payment_records')).rows[0].n,1,'rejected saves leave no receipt');
const perms=await db.query("select has_function_privilege('anon','record_owner_deposit(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text)','EXECUTE') anon,has_function_privilege('authenticated','record_owner_deposit(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text)','EXECUTE') authenticated,has_function_privilege('service_role','record_owner_deposit(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text)','EXECUTE') service");
assert.deepEqual(perms.rows[0],{anon:false,authenticated:false,service:true});
await db.close();console.log('Local PostgreSQL: atomic receipt/projection, replay, conflicts and permissions passed');
