import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
import {calculateRecordedPaymentState} from '../supabase/functions/_shared/document-payment-accounting.mjs';
const edge = fs.readFileSync('supabase/functions/document-payment/index.ts','utf8');
const source = edge.slice(edge.indexOf('async function recordOwnerDeposit('),edge.indexOf('async function confirmManual('));
class PaymentError extends Error { constructor(message,status,code) { super(message);this.status=status;this.code=code; } }
function fixture() {
  const row={id:'quote-1',user_id:'owner',status:'accepted',updated_at:'2026-10-01',total:6356.25,data:{}};
  let records=[], writes=0, authorized=true, conflict=false;
  const state=()=>calculateRecordedPaymentState(row,records,317813);
  const handler=new Function('accountPaymentAccess','ACCOUNT_PERMISSION','normalizeId','fetchQuote','isInvoice','isChangeOrder','isInvalid','isAccepted','PaymentError','recordsForDocument','documentPaymentState','paymentSettings','idempotencyKey','crypto','currencyFor','updateQuotePaymentState','publicStatus',stripTypeScriptTypes(source)+';return recordOwnerDeposit;')(
    async(_req,_body,permission)=>{assert.equal(permission,'payments.manage');if(!authorized)throw new PaymentError('Denied',403,'denied');return {ownerUserId:'owner',actorUserId:'actor'};},
    {PAYMENTS_MANAGE:'payments.manage'},value=>value,async()=>row,
    r=>r.invoice===true,r=>r.changeOrder===true,r=>r.invalid===true,r=>r.status==='accepted',PaymentError,
    async()=>records,async()=>state(),async()=>({settings:{}}),value=>{if(!value)throw new PaymentError('Key missing',400,'key');return value;},webcrypto,()=> 'cad',
    async(_admin,r,receipt,_now,options)=>{
      assert.equal(options.previewOnly,true);assert.equal(options.clearDepositShortfallAcceptance,true);
      const next=calculateRecordedPaymentState(r,options.projectedRecords,317813);
      return {state:next,update:{data:{...r.data,payments:[...(r.data.payments||[]),{payment_record_id:receipt.id,amount_cents:receipt.amount_cents}],paymentsReceived:{amount:next.paidCents/100},balance_due_cents:next.balanceDueCents,deposit_paid:next.depositSecured}}};
    },(_row,s)=>s);
  const admin={rpc:async(name,args)=>{
    assert.equal(name,'record_owner_deposit');
    if(conflict)return {error:{message:'Quote changed'}};
    writes++;records.push(args.p_record);row.data=args.p_next_data;
    return {data:{id:args.p_record.id,replayed:false}};
  }};
  const body={documentId:'quote-1',amountCents:100000,method:'etransfer',idempotencyKey:'receipt-1234567890'};
  return {row,body,run:()=>handler({},admin,body),records:()=>records,writes:()=>writes,deny:()=>authorized=false,conflict:()=>conflict=true,setRecords:value=>records=value};
}
test('owner receipt works without a client report, preserves quote total and reduces outstanding balance',async()=>{
  const f=fixture();const result=await f.run();
  assert.equal(result.payment.paidCents,100000);assert.equal(result.payment.balanceDueCents,535625);
  assert.equal(result.payment.depositDueCents,217813);assert.equal(result.payment.depositSecured,false);
  assert.equal(f.row.total,6356.25);assert.equal(f.records()[0].confirmed_by,'actor');
  assert.equal(f.records()[0].reported_at,undefined);assert.equal(f.writes(),1);
  const replay=await f.run();assert.equal(replay.idempotentReplay,true);assert.equal(replay.payment.paidCents,100000);assert.equal(f.writes(),1);
});
test('covering deposit marks secured; existing receipts accumulate rather than get replaced',async()=>{
  const f=fixture();f.setRecords([{id:'old',status:'confirmed',amount_cents:100000}]);f.body.amountCents=217813;
  const r=await f.run();assert.equal(r.payment.depositSecured,true);assert.equal(r.payment.balanceDueCents,317812);
  assert.equal(f.records().length,2);
});
test('real quote projection keeps legacy payments, adds one linked receipt and changes no quote total',async()=>{
  const code=edge.slice(edge.indexOf('async function updateQuotePaymentState('),edge.indexOf('async function stripeSession('));
  const update=new Function('rowData','paymentSettings','documentPaymentState','isChangeOrder','isInvoice',stripTypeScriptTypes(code)+';return updateQuotePaymentState;')(
    r=>r.data,async()=>({settings:{}}),async(_a,r,_s,records)=>calculateRecordedPaymentState(r,records,317813),()=>false,()=>false);
  const row={id:'quote',user_id:'owner',total:6356.25,status:'accepted',data:{paymentsReceived:{amount:100},payments:[],customSetting:'preserved'}};
  const receipt={id:'new',payment_type:'deposit',provider:'manual',method:'cash',amount_cents:100000,currency:'cad',status:'confirmed'};
  const result=await update({},row,receipt,'2026-10-01',{previewOnly:true,projectedRecords:[receipt],clearDepositShortfallAcceptance:true});
  assert.equal(result.state.paidCents,110000);assert.equal(result.update.data.paymentsReceived.amount,1100);
  assert.equal(result.update.data.balance_due_cents,525625);assert.equal(result.update.data.customSetting,'preserved');
  assert.equal(result.update.data.payments[0].payment_record_id,'new');assert.equal(result.update.total,undefined);
  const reload={...row,data:result.update.data};const reloaded=calculateRecordedPaymentState(reload,[receipt],317813);
  assert.equal(reloaded.paidCents,110000,'reload must not double-count the linked receipt');
});
test('permission, ownership, lifecycle, pending report, invalid amounts and overpayment reject without writes',async()=>{
  for(const configure of [f=>f.deny(),f=>f.row.user_id='other',f=>f.row.status='draft',f=>f.row.invoice=true,f=>f.row.changeOrder=true,f=>f.row.invalid=true,f=>f.setRecords([{status:'client_reported'}]),f=>f.body.amountCents=0,f=>f.body.amountCents=1.5,f=>f.body.amountCents=635626,f=>f.body.method='card']){
    const f=fixture();configure(f);await assert.rejects(f.run());assert.equal(f.writes(),0);
  }
});
test('uncertain/concurrent save does not claim success; duplicate key with different amount rejects',async()=>{
  const f=fixture();f.conflict();await assert.rejects(f.run(),/not saved/);assert.equal(f.writes(),0);
  const g=fixture();await g.run();g.body.amountCents=500;await assert.rejects(g.run(),/conflicts/);assert.equal(g.writes(),1);
});
test('SQL commit is service-only, locked and snapshot guarded; dashboard compact menu preserves action',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261001180000_owner_record_deposit.sql','utf8');
  for(const required of ['for update','q.updated_at is distinct from p_expected_updated_at','actual_records <> expected_records','insert into public.payment_records','update public.quotes','from public, anon, authenticated','to service_role']) assert(sql.includes(required));
  const ui=fs.readFileSync('dashboard.html','utf8');
  assert(ui.includes('data-account-permission="payments.manage"'));assert(ui.includes('recordDashboardDeposit(${jsAttr(q.id)})'));
  const compact=fs.readFileSync('dashboard-compact.js','utf8');assert(compact.includes("node.matches('button, a')"));
});
