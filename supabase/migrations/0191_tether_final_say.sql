-- ---------------------------------------------------------------------------
-- 0191: Tether has the final say.
--
-- Sentinel no longer escalates anything to a person (see content-sentinel).
--   1. Flags it used to close as `escalated`, and reports it parked as
--      `ai_escalated`, go back in the queue for Tether to decide.
--   2. Open flags are reviewed hourly instead of once a night, so a flag
--      never sits for a day waiting.
-- ---------------------------------------------------------------------------

update public.content_flags
   set state = 'open', resolution = null, resolved_at = null
 where state = 'escalated';

update public.message_reports
   set status = 'pending', decision = null, review_attempts = 0
 where status in ('needs_review', 'failed');

select cron.unschedule('content-sentinel-flags')
 where exists (select 1 from cron.job where jobname = 'content-sentinel-flags');

select cron.schedule(
  'content-sentinel-flags',
  '59 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
      ),
      body := '{"trigger":"cron","mode":"flags","limit":250}'::jsonb,
      timeout_milliseconds := 300000
    );
  $$
);
