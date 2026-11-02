-- Daily failed-payment sweep for Aero and Lite (/api/cron/billing-retry):
-- one charge attempt a day, cancelled 14 days after the first failure.
--
-- Reuses the raffle cron's URL/key vault secrets and swaps the path, like
-- the anon-purge sweep (0125), so no new secrets are needed. If pg_cron,
-- pg_net or the vault secrets are missing this is a no-op.
do $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; the billing-retry sweep was not scheduled.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed; the billing-retry sweep was not scheduled.';
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'raffle_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'raffle_cron_key';

  if v_url is null or v_key is null then
    raise notice 'vault secrets raffle_url / raffle_cron_key not set; billing-retry sweep not scheduled.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'billing-retry';
  -- 15:07 UTC: mid-morning in the US, afternoon in Europe, when cards that
  -- failed overnight for "insufficient funds" have the best chance.
  perform cron.schedule('billing-retry', '7 15 * * *',
    $cron$
      select net.http_post(
        url := regexp_replace(
          (select decrypted_secret from vault.decrypted_secrets where name = 'raffle_url'),
          '/api/cron/raffle', '/api/cron/billing-retry'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'raffle_cron_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$);
end;
$$;
