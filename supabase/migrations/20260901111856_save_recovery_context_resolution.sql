alter table public.save_recovery_records
  add column if not exists document_context jsonb not null default '{}'::jsonb,
  add column if not exists resolution_strategy text not null default '',
  add column if not exists resolution_source text not null default '',
  add column if not exists resolution_note text not null default '',
  add column if not exists admin_contacted_at timestamptz,
  add column if not exists user_confirmed_at timestamptz;

comment on column public.save_recovery_records.document_context is
  'Minimized document context captured when the failed save occurred, such as quote id, number, and file name.';

comment on column public.save_recovery_records.resolution_strategy is
  'Explicit outcome such as kept_cloud, kept_device, restored_as_new, cloud_saved_after_retry, or user_confirmed.';

comment on column public.save_recovery_records.resolution_source is
  'Actor that supplied the resolution outcome: user, admin, or system.';
