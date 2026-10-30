-- ---------------------------------------------------------------------------
-- 0187: a daily Disband Safety email.
--
-- content-sentinel's "digest" mode emails the last 24 hours: content removed,
-- spaces suspended, strikes, reports closed (with the AI's reasoning) and
-- everything still waiting on staff. It goes to SAFETY_REPORT_TO every
-- day at 16:00 UTC (12pm EDT), even on a quiet day, so a stopped schedule shows up.
-- ---------------------------------------------------------------------------

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'content-sentinel-digest';
  perform cron.schedule(
    'content-sentinel-digest',
    '0 16 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
        ),
        body := '{"trigger":"cron","mode":"digest"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$$;
