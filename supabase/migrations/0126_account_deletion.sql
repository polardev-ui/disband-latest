-- ---------------------------------------------------------------------------
-- 0126: Voluntary account deletion (14-day soft delete)
--
-- Regular accounts can request deletion. For 24 hours after the request, any
-- login cancels it and the account is kept as-is. Past that, the profile is
-- de-anonymised (random "deleted_user<13 digits>", no avatar/banner/bio) and
-- the account is held for 14 days total from request time, then purged.
--
-- Anonymous accounts are deleted instantly (see the same endpoint in code).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists deletion_requested_at   timestamptz,
  add column if not exists deletion_cancel_until   timestamptz,
  add column if not exists deletion_purge_at       timestamptz;

create index if not exists profiles_deletion_purge_idx
  on public.profiles (deletion_purge_at)
  where deletion_requested_at is not null and deletion_purge_at is not null;

-- Request deletion: de-anonymise immediately, record the timeline.
create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_rand text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Already pending?
  if exists (select 1 from public.profiles
              where id = uid and deletion_requested_at is not null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- 13 random digits
  v_rand := lpad((floor(random() * 10000000000000))::bigint::text, 13, '0');

  update public.profiles
     set username                 = 'deleted_user' || v_rand,
         display_name             = null,
         bio                      = null,
         avatar_url               = null,
         banner_url               = null,
         status_note              = null,
         deletion_requested_at    = now(),
         deletion_cancel_until    = now() + interval '24 hours',
         deletion_purge_at        = now() + interval '14 days'
   where id = uid;

  return jsonb_build_object(
    'ok', true,
    'cancel_until', (select deletion_cancel_until from public.profiles where id = uid),
    'purge_at', (select deletion_purge_at from public.profiles where id = uid)
  );
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;

-- Cancel a pending deletion, but only inside the 24-hour window.
create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = uid
       and deletion_requested_at is not null
       and deletion_cancel_until > now()
  ) then
    return jsonb_build_object('ok', false, 'error', 'Deletion cannot be cancelled at this point.');
  end if;

  update public.profiles
     set deletion_requested_at  = null,
         deletion_cancel_until  = null,
         deletion_purge_at      = null
   where id = uid;

  return jsonb_build_object('ok', true, 'cancelled', true);
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;

-- Cron schedule (reuse raffle vault secrets, hit /api/cron/account-purge).
do $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; account purge not scheduled.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed; account purge not scheduled.';
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'raffle_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'raffle_cron_key';

  if v_url is null or v_key is null then
    raise notice 'vault secrets missing; account purge not scheduled.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'account-purge';
  perform cron.schedule('account-purge', '37 * * * *',
    $cron$
      select net.http_post(
        url := regexp_replace(
          (select decrypted_secret from vault.decrypted_secrets where name = 'raffle_url'),
          '/api/cron/raffle', '/api/cron/account-purge'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'raffle_cron_key')
        ),
        body := '{}'::jsonb
      );
    $cron$);
end;
$$;
