begin;
-- Application-owned ledger; never write/delete Storage object metadata via SQL.
-- Existing objects remain accessible. Older clients must refresh before uploading.
create table public.qdr_storage_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  warning_only boolean not null default false,
  retained_limit bigint not null default 10000000000 check(retained_limit>0),
  monthly_limit bigint not null default 2000000000 check(monthly_limit>0)
);
create table public.qdr_storage_uploads (
  bucket text not null,
  path text not null,
  owner_id uuid not null references public.qdr_storage_accounts(owner_id) on delete cascade,
  reserved_bytes bigint not null check(reserved_bytes>=0),
  authorized_bytes bigint not null check(authorized_bytes>=0),
  charged_bytes bigint not null check(charged_bytes>=0),
  digest text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '3 hours',
  finished boolean not null default false,
  primary key(bucket,path)
);
create index qdr_storage_uploads_owner_month on public.qdr_storage_uploads(owner_id,created_at);
alter table public.qdr_storage_accounts enable row level security;
alter table public.qdr_storage_uploads enable row level security;
revoke all on public.qdr_storage_accounts,public.qdr_storage_uploads from public,anon,authenticated;
grant all on public.qdr_storage_accounts,public.qdr_storage_uploads to service_role;

-- Preserve both previously advertised 10 GiB allowances for existing owners,
-- or their actual current usage plus headroom if already above that amount.
insert into public.qdr_storage_accounts(owner_id,retained_limit)
select a.owner_user_id,greatest(21474836480,coalesce(sum((o.metadata->>'size')::bigint),0)+2000000000)
from public.accounts a left join storage.objects o on split_part(o.name,'/',1)=a.owner_user_id::text
group by a.owner_user_id;

-- Owner-requested exception, pinned to the verified Auth identity, not a
-- browser-supplied email or editable user metadata. Thresholds still warn.
update public.qdr_storage_accounts set warning_only=true
where owner_id='25bbd251-205a-425d-9f9c-5509cc3c6d1c';

create function public.qdr_storage_status(p_owner uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.qdr_storage_accounts; retained bigint; pending bigint; monthly bigint;
begin
  insert into public.qdr_storage_accounts(owner_id) values(p_owner) on conflict do nothing;
  select * into strict a from public.qdr_storage_accounts where owner_id=p_owner for update;
  -- Reconcile issued uploads against trusted Storage metadata. Failed requests
  -- reserve capacity for at most three hours (longer than signed token lifetime).
  update public.qdr_storage_uploads u set finished=true,reserved_bytes=0,created_at=now(),
    charged_bytes=coalesce((o.metadata->>'size')::bigint,0)
  from storage.objects o where u.owner_id=p_owner and not u.finished
    and o.bucket_id=u.bucket and o.name=u.path
    and coalesce((o.metadata->>'size')::bigint,0)<=u.reserved_bytes;
  update public.qdr_storage_uploads u set finished=true,reserved_bytes=0,charged_bytes=0
  where u.owner_id=p_owner and not u.finished and u.expires_at<now()
    and not exists(select 1 from storage.objects o where o.bucket_id=u.bucket and o.name=u.path);
  select coalesce(sum(coalesce((o.metadata->>'size')::bigint,0)),0) into retained
  from storage.objects o left join public.qdr_storage_uploads u on u.bucket=o.bucket_id and u.path=o.name
  where coalesce(u.owner_id::text,split_part(o.name,'/',1))=p_owner::text;
  -- Keep issued capability headroom until expiry, even if its object is deleted.
  -- An unexpired signed token could recreate that immutable path after deletion.
  select coalesce(sum(greatest(u.authorized_bytes-coalesce((o.metadata->>'size')::bigint,0),0)) filter(where u.expires_at>now()),0),
    coalesce(sum(u.charged_bytes) filter(where not u.finished or u.created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0)
  into pending,monthly from public.qdr_storage_uploads u left join storage.objects o on o.bucket_id=u.bucket and o.name=u.path where u.owner_id=p_owner;
  return jsonb_build_object('retainedBytes',retained,'reservedBytes',pending,'monthlyBytes',monthly,
    'retainedLimit',a.retained_limit,'monthlyLimit',a.monthly_limit,'warningOnly',a.warning_only,
    'resetsAt',(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC');
end $$;

create function public.qdr_storage_reserve(p_owner uuid,p_bucket text,p_path text,p_bytes bigint,p_digest text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare status jsonb; prior public.qdr_storage_uploads;
begin
  if p_bucket not in ('item-full-res-photos','room-photos','portal-job-assets','portal-designs','document-payment-evidence','ai-voice-audio-evidence','signatures','Signatures')
    or p_bytes<1 or p_bytes>50000000 or length(p_path)>1024 or length(p_digest)>128 or length(p_digest)<1
    then raise exception 'storage_invalid_upload'; end if;
  status:=public.qdr_storage_status(p_owner); -- locks the owner until commit
  select * into prior from public.qdr_storage_uploads where bucket=p_bucket and path=p_path;
  if found then
    if prior.owner_id<>p_owner or prior.digest<>p_digest then raise exception 'storage_path_conflict'; end if;
    if exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then
      return jsonb_build_object('existing',true,'usage',status);
    end if;
    if prior.finished or prior.expires_at<=now() then raise exception 'storage_upload_expired_choose_again'; end if;
    update public.qdr_storage_uploads set expires_at=now()+interval '3 hours' where bucket=p_bucket and path=p_path;
    return jsonb_build_object('existing',false,'usage',status);
  end if;
  if exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then raise exception 'storage_path_conflict'; end if;
  if not (status->>'warningOnly')::boolean and (status->>'retainedBytes')::bigint+(status->>'reservedBytes')::bigint+p_bytes>(status->>'retainedLimit')::bigint then
    raise exception 'storage_retained_limit';
  end if;
  if not (status->>'warningOnly')::boolean and (status->>'monthlyBytes')::bigint+p_bytes>(status->>'monthlyLimit')::bigint then raise exception 'storage_monthly_limit'; end if;
  insert into public.qdr_storage_uploads(bucket,path,owner_id,reserved_bytes,authorized_bytes,charged_bytes,digest)
    values(p_bucket,p_path,p_owner,p_bytes,p_bytes,p_bytes,p_digest);
  return jsonb_build_object('existing',false,'usage',public.qdr_storage_status(p_owner));
end $$;

-- Only release a failed server-buffered upload when no object exists. Never use
-- this for issued signed tokens: those retain reservations until expiry.
create function public.qdr_storage_cancel(p_owner uuid,p_bucket text,p_path text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.qdr_storage_accounts where owner_id=p_owner for update;
  update public.qdr_storage_uploads u set charged_bytes=0,reserved_bytes=0,finished=true
  where owner_id=p_owner and bucket=p_bucket and path=p_path and not finished
    and not exists(select 1 from storage.objects o where o.bucket_id=u.bucket and o.name=u.path);
end $$;
revoke all on function public.qdr_storage_status(uuid),public.qdr_storage_reserve(uuid,text,text,bigint,text),public.qdr_storage_cancel(uuid,text,text) from public,anon,authenticated;
grant execute on function public.qdr_storage_status(uuid),public.qdr_storage_reserve(uuid,text,text,bigint,text),public.qdr_storage_cancel(uuid,text,text) to service_role;

-- Restrictions activate in the separate cutover migration, only after the
-- compatible Edge Functions and public web bundle have been verified.

-- Supersedes the earlier local per-render count limit; byte reservations now
-- cover files, thumbnails and retained versions together.
drop trigger if exists portal_render_upload_allowance on public.portal_designs;
commit;
