-- ---------------------------------------------------------------------------
-- 0148: end-of-day flag review.
--
-- pg_cron runs in UTC, so the job wakes every hour at :59 and only posts when
-- it is 23:00 in America/New_York. That keeps the review at the end of the
-- Eastern day through both EST and EDT, rather than drifting by an hour twice
-- a year.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; schedule the flag review manually.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'content-sentinel-flags';
  perform cron.schedule(
    'content-sentinel-flags',
    '59 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
        ),
        body := '{"trigger":"cron","mode":"flags","limit":250}'::jsonb,
        timeout_milliseconds := 300000
      )
      where extract(hour from timezone('America/New_York', now())) = 23;
    $job$
  );
end
$$;
