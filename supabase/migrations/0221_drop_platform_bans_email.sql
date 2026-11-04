-- 0221_drop_platform_bans_email.sql
-- Stop storing emails in public.platform_bans; emails are sensitive and were
-- exposed via the moderation API. Look up emails via auth.users (service role)
-- only when a platform manager explicitly needs them.
alter table public.platform_bans drop column if exists email;
