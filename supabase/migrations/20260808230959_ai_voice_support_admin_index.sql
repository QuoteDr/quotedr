-- Cover the support-audit administrator foreign key used for account cleanup.
create index if not exists ai_voice_transcript_support_admin_user_idx
  on public.ai_voice_transcript_support_access(admin_user_id)
  where admin_user_id is not null;
