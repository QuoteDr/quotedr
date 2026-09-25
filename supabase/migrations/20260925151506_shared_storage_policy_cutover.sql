begin;
-- Apply ONLY after compatible Edge Functions and web bundle are verified.
-- Older open tabs must refresh. Reads and legacy signatures are unchanged.
create policy qdr_budget_managed_insert on storage.objects as restrictive for insert to anon,authenticated
with check(bucket_id not in ('item-full-res-photos','room-photos','portal-job-assets','portal-designs','document-payment-evidence','ai-voice-audio-evidence'));
create policy qdr_budget_managed_update on storage.objects as restrictive for update to anon,authenticated
using(bucket_id not in ('item-full-res-photos','room-photos','portal-job-assets','portal-designs','document-payment-evidence','ai-voice-audio-evidence'))
with check(bucket_id not in ('item-full-res-photos','room-photos','portal-job-assets','portal-designs','document-payment-evidence','ai-voice-audio-evidence'));
create policy qdr_budget_managed_delete on storage.objects as restrictive for delete to anon,authenticated
using(bucket_id not in ('item-full-res-photos','room-photos','portal-job-assets','portal-designs','document-payment-evidence','ai-voice-audio-evidence'));
commit;
