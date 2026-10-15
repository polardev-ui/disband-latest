-- ---------------------------------------------------------------------------
-- 0125: Anonymous (throwaway) accounts
--
-- Anonymous accounts are real Supabase users so they can join servers, chat,
-- DM and call like anyone else — but they are tagged `account_type =
-- 'anonymous'` on their profile and carry a short lifetime. The login
-- credential is a 16-digit account number: the server hashes it (SHA-256 with
-- a pepper, see src/lib/anon-accounts.ts) and looks the account up, then mints
-- a session for the mapped user. The plain number is never stored.
--
-- Lifecycle:
--   created  → expires_at = now() + tier, purge_after = expires_at + 30 days
--   expired  → the live account is wiped immediately (auth user deleted; by
--              cascade every profile row, message, reaction, membership, note,
--              favourite and presence record goes too). A private JSON copy is
--              kept in `snapshot` and is downloadable with the number until
--              purge_after.
--   purged   → the `snapshot` copy is deleted. The anonymous_accounts row
--              survives so the number is still recognised and can report the
--              account as expired/purged.
--
-- Restrictions (enforced server side, not just hidden in the UI):
--   * cannot create servers        → create_server() guard below
--   * cannot claim gifts           → claim_gift() guard below
--   * cannot buy Aero / Lite       → /api/stripe/create-checkout guard
--   * cannot create bots           → /api/bot/register guard
-- ---------------------------------------------------------------------------

-- 1) Tag profiles -----------------------------------------------------------
alter table public.profiles
  add column if not exists account_type text not null default 'standard';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('standard', 'anonymous'));

comment on column public.profiles.account_type is
  'standard | anonymous. Anonymous accounts are throwaway and restricted; see migration 0125.';

-- 2) The registry -----------------------------------------------------------
create table if not exists public.anonymous_accounts (
  id             uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: set to NULL when the account expires (its auth user is
  -- deleted) and again on purge, so the row (and the number hash) outlives the
  -- auth user it pointed at.
  user_id        uuid unique references auth.users (id) on delete set null,
  -- sha256(pepper + digits). Never exposed to clients.
  number_hash    text not null unique,
  tier           text not null check (tier in ('1d', '3d', '1w', '2w', '1m')),
  expires_at     timestamptz not null,
  purge_after    timestamptz not null default (now() + interval '30 days'),
  created_at     timestamptz not null default now(),
  -- When expiry was processed: the data was snapshotted below and the live
  -- account (profile, messages, presence, memberships, ...) was deleted.
  expires_processed_at timestamptz,
  -- Private, service-role-only JSON copy kept only for the download window.
  -- Cleared when the account is purged.
  snapshot       jsonb,
  data_purged_at timestamptz,
  purged_reason  text
);

-- The expiry sweep looks for accounts whose lifetime ended but whose data has
-- not yet been snapshotted-and-removed.
create index if not exists anonymous_accounts_expire_pending_idx
  on public.anonymous_accounts (expires_at)
  where expires_processed_at is null;

create index if not exists anonymous_accounts_purge_idx
  on public.anonymous_accounts (purge_after)
  where data_purged_at is null;

-- Clients never read this table directly: RLS on with no policies. The service
-- role (which bypasses RLS) is the only reader/writer, and the safe subset of
-- fields is surfaced to the signed-in owner through get_my_anonymous_account().
alter table public.anonymous_accounts enable row level security;

-- 3) Helpers ----------------------------------------------------------------
create or replace function public.is_anonymous(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = p_user and account_type = 'anonymous'
  );
$$;

grant execute on function public.is_anonymous(uuid) to authenticated;

-- Safe, owner-scoped view of the caller's own anonymous record. Returns NULL
-- for standard accounts, so callers can use it as "am I anonymous?".
create or replace function public.get_my_anonymous_account()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tier',           a.tier,
    'expires_at',     a.expires_at,
    'purge_after',    a.purge_after,
    'data_purged_at', a.data_purged_at
  )
  from public.anonymous_accounts a
  where a.user_id = auth.uid();
$$;

grant execute on function public.get_my_anonymous_account() to authenticated;

-- 4) create_server guard ----------------------------------------------------
-- Full body reproduced from 0057 with an anonymous-account block at the top.
create or replace function public.create_server(
  p_name text,
  p_icon_url text default null,
  p_banner_url text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_invite text;
  c_text uuid;
  c_voice uuid;
  r_everyone uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.is_anonymous(auth.uid()) then
    raise exception 'Anonymous accounts cannot create servers.';
  end if;
  perform public.ensure_user_profile();

  v_invite := public.generate_invite_code();
  while exists (select 1 from public.servers where invite_code = v_invite) loop
    v_invite := public.generate_invite_code();
  end loop;

  insert into public.servers (name, icon_url, banner_url, description, owner_id, invite_code)
  values (p_name, p_icon_url, p_banner_url, p_description, auth.uid(), v_invite)
  returning id into v_id;

  insert into public.server_roles (server_id, name, color, position, is_default)
  values (v_id, '@everyone', '#949ba4', 0, true)
  returning id into r_everyone;

  update public.server_roles
  set permissions = permissions
    || '{"send_messages":true,"add_reactions":true,"attach_files":true}'::jsonb
  where id = r_everyone;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_id, auth.uid(), 'owner', r_everyone);

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Text Channels', 0) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Voice Channels', 1) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_text, 'welcome', 'text', 1),
    (v_id, c_voice, 'voice-1', 'voice', 0);

  perform public.write_audit_log(
    v_id,
    'server.create',
    'server',
    v_id::text,
    jsonb_build_object('name', p_name)
  );

  return v_id;
end;
$$;

-- 5) claim_gift guard -------------------------------------------------------
-- Full body reproduced from 0118 with an anonymous-account block at the top.
create or replace function public.claim_gift(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path TO 'public'
as $function$
declare
  g public.gifts%rowtype;
  v_user uuid := auth.uid();
  v_from timestamptz;
  v_held text;
  v_plan text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  if public.is_anonymous(v_user) then
    return jsonb_build_object('ok', false, 'error', 'Anonymous accounts cannot claim gifts.');
  end if;

  select * into g from public.gifts where code = p_code for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That gift link is not valid.');
  end if;
  if g.status = 'claimed' then
    return jsonb_build_object('ok', false, 'error', 'Someone already claimed this gift.');
  end if;
  if g.status <> 'unclaimed' then
    return jsonb_build_object('ok', false, 'error', 'This gift is not available.');
  end if;
  if g.expires_at < now() then
    update public.gifts set status = 'expired' where id = g.id;
    return jsonb_build_object('ok', false, 'error', 'This gift has expired.');
  end if;
  if g.buyer_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'You cannot claim your own gift.');
  end if;

  update public.gifts
  set status = 'claimed', claimed_by = v_user, claimed_at = now()
  where id = g.id;

  select expires_at, plan
    into v_from, v_held
    from public.gift_entitlements
   where user_id = v_user;

  v_plan := case
    when g.plan in ('aero', 'basic', 'super') or v_held in ('aero', 'basic', 'super')
      then 'aero'
    when g.plan = 'lite' or v_held = 'lite'
      then 'lite'
    else g.plan
  end;

  insert into public.gift_entitlements (user_id, plan, expires_at, updated_at)
  values (v_user, v_plan,
          greatest(coalesce(v_from, now()), now()) + (g.months || ' months')::interval, now())
  on conflict (user_id) do update set
    plan = excluded.plan,
    expires_at = excluded.expires_at,
    updated_at = now();

  perform public.refresh_user_badges(g.buyer_id);
  perform public.refresh_user_badges(v_user);

  return jsonb_build_object('ok', true, 'plan', v_plan, 'months', g.months,
                            'from', g.buyer_id);
end;
$function$;

-- 6) Purge sweep schedule ---------------------------------------------------
-- Hourly sweep of accounts whose download window has closed. Reuses the raffle
-- cron's URL/key vault secrets (the endpoint authenticates with the same
-- RAFFLE_CRON_SECRET) and swaps the path, so no new secrets are required. If
-- pg_cron/pg_net or the vault secrets are absent this is simply a no-op and the
-- sweep can be run manually against /api/cron/anon-purge.
do $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; the anon-purge sweep was not scheduled.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed; the anon-purge sweep was not scheduled.';
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'raffle_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'raffle_cron_key';

  if v_url is null or v_key is null then
    raise notice 'vault secrets raffle_url / raffle_cron_key not set; anon-purge sweep not scheduled.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'anon-purge';
  perform cron.schedule('anon-purge', '41 * * * *',
    $cron$
      select net.http_post(
        url := regexp_replace(
          (select decrypted_secret from vault.decrypted_secrets where name = 'raffle_url'),
          '/api/cron/raffle', '/api/cron/anon-purge'
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
