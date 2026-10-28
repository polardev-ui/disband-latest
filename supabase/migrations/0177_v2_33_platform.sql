-- ---------------------------------------------------------------------------
-- 0177: version 2.33 platform features
--
--   1. Management: a staff tier above Staff and Moderator that can appoint
--      staff/moderators and suspend spaces.
--   2. Account standing: strikes with severity, five tiers from Good to
--      Suspended, and an AI sweep path (service role) for spaces taken down.
--   3. The currency: a wallet, a ledger, rewards earned by triggers on the
--      things people do, redemptions, and verified rewarded-ad sessions.
--   4. Creator Program: follower counts from connected YouTube, TikTok and
--      Twitch accounts, and a Content Creator badge at 2,500+.
--   5. Promotions: paid placement at the top of Discover.
--   6. Bots: reusable install links and more permissions.
--
-- Additive throughout: new tables, columns and functions; existing rows are
-- untouched.
-- ---------------------------------------------------------------------------

-- ===================================================================== 1. management

-- Staff flags on profiles are guarded so a signed-in user can never change
-- them. Functions below that are allowed to (after their own checks) set this
-- transaction-local flag first.
create or replace function public.protect_platform_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('disband.badge_write', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.show_owner_badge := false;
      new.show_staff_badge := false;
      new.is_bot := false;
      new.bot_dm_enabled := false;
    end if;
  elsif tg_op = 'UPDATE' then
    if (
      old.show_owner_badge is distinct from new.show_owner_badge
      or old.show_staff_badge is distinct from new.show_staff_badge
      or old.is_bot is distinct from new.is_bot
      or old.bot_dm_enabled is distinct from new.bot_dm_enabled
    ) and auth.uid() is not null then
      new.show_owner_badge := old.show_owner_badge;
      new.show_staff_badge := old.show_staff_badge;
      new.is_bot := old.is_bot;
      new.bot_dm_enabled := old.bot_dm_enabled;
    end if;
  end if;
  return new;
end;
$$;

insert into public.badges (key, name, description, category, accent, sort, automatic) values
  ('manager', 'Disband Manager', 'Supervises the Disband staff and moderation teams', 'staff', '#f0883e', 15, false),
  ('creator', 'Content Creator', 'A verified creator with 2,500+ followers', 'community', '#ff4f6d', 165, true)
on conflict (key) do nothing;

create or replace function public.is_platform_owner(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and show_owner_badge);
$$;

create or replace function public.is_platform_manager(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_owner(p_user)
      or exists (select 1 from public.user_badges where user_id = p_user and badge_key = 'manager');
$$;

create or replace function public.is_platform_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_manager(p_user)
      or exists (select 1 from public.profiles where id = p_user and show_staff_badge)
      or exists (select 1 from public.user_badges where user_id = p_user and badge_key in ('staff', 'moderator'));
$$;

create table if not exists public.platform_role_log (
  id bigserial primary key,
  actor_id uuid not null,
  target_id uuid not null,
  role text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);
alter table public.platform_role_log enable row level security;
drop policy if exists "managers read role log" on public.platform_role_log;
create policy "managers read role log" on public.platform_role_log
  for select using (public.is_platform_manager(auth.uid()));

/**
 * Grant or remove staff, moderator or manager. Managers may grant staff and
 * moderator; only the owner may grant manager. No one may change the owner.
 */
create or replace function public.manager_set_role(p_user uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_platform_manager(v_actor) then
    raise exception 'Only Disband managers can change staff roles';
  end if;
  if p_role not in ('staff', 'moderator', 'manager') then
    raise exception 'Unknown role';
  end if;
  if p_role = 'manager' and not public.is_platform_owner(v_actor) then
    raise exception 'Only the owner can appoint managers';
  end if;
  if public.is_platform_owner(p_user) then
    raise exception 'The owner''s roles cannot be changed';
  end if;
  if p_user = v_actor then
    raise exception 'You cannot change your own roles';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'No such user';
  end if;

  if p_grant then
    insert into public.user_badges (user_id, badge_key, visible) values (p_user, p_role, true)
    on conflict do nothing;
  else
    delete from public.user_badges where user_id = p_user and badge_key = p_role;
  end if;

  if p_role = 'staff' then
    perform set_config('disband.badge_write', 'on', true);
    update public.profiles set show_staff_badge = p_grant where id = p_user;
    perform set_config('disband.badge_write', 'off', true);
  end if;

  insert into public.platform_role_log (actor_id, target_id, role, granted)
  values (v_actor, p_user, p_role, p_grant);
end;
$$;
revoke all on function public.manager_set_role(uuid, text, boolean) from public, anon;

/** Everyone on the platform team, for the Management panel. */
create or replace function public.list_platform_team()
returns table (user_id uuid, username text, display_name text, avatar_url text, roles text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_manager(auth.uid()) then
    raise exception 'Only Disband managers can view the team';
  end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_url,
    array_remove(array[
      case when p.show_owner_badge then 'owner' end,
      case when exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'manager') then 'manager' end,
      case when p.show_staff_badge or exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'staff') then 'staff' end,
      case when exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'moderator') then 'moderator' end
    ], null)
  from public.profiles p
  where p.show_owner_badge or p.show_staff_badge
     or exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key in ('manager', 'staff', 'moderator'))
  order by p.show_owner_badge desc, lower(coalesce(p.display_name, p.username));
end;
$$;

-- Space suspension.
alter table public.servers
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by uuid;

create or replace function public.manager_suspend_server(p_server uuid, p_suspend boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_manager(auth.uid()) then
    raise exception 'Only Disband managers can suspend spaces';
  end if;
  if p_suspend and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the suspension';
  end if;
  update public.servers
     set suspended_at = case when p_suspend then now() else null end,
         suspended_reason = case when p_suspend then left(p_reason, 500) else null end,
         suspended_by = case when p_suspend then auth.uid() else null end,
         discoverable = case when p_suspend then false else discoverable end
   where id = p_server;
  if not found then raise exception 'No such space'; end if;
end;
$$;
revoke all on function public.manager_suspend_server(uuid, boolean, text) from public, anon;

-- A suspended space is read-only and closed to new members.
create or replace function public.block_suspended_server_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.channels c join public.servers s on s.id = c.server_id
    where c.id = new.channel_id and s.suspended_at is not null
  ) then
    raise exception 'This space has been suspended by Disband' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_block_suspended_messages on public.messages;
create trigger trg_block_suspended_messages before insert on public.messages
  for each row execute function public.block_suspended_server_messages();

create or replace function public.block_suspended_server_joins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.servers s where s.id = new.server_id and s.suspended_at is not null and s.owner_id <> new.user_id) then
    raise exception 'This space has been suspended by Disband' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_block_suspended_joins on public.server_members;
create trigger trg_block_suspended_joins before insert on public.server_members
  for each row execute function public.block_suspended_server_joins();

-- ================================================================ 2. account standing

create table if not exists public.account_strikes (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  severity smallint not null check (severity between 1 and 3),
  reason text not null,
  category text,
  source text not null default 'staff' check (source in ('staff', 'sentinel')),
  server_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists account_strikes_user_idx on public.account_strikes (user_id, created_at desc);
alter table public.account_strikes enable row level security;
drop policy if exists "own strikes" on public.account_strikes;
create policy "own strikes" on public.account_strikes for select
  using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

/** good · strike · at_risk · high_risk · suspended */
create or replace function public.account_standing(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.platform_bans where user_id = p_user) then 'suspended'
    else (
      select case
        when pts = 0 then 'good'
        when pts = 1 then 'strike'
        when pts <= 3 then 'at_risk'
        else 'high_risk'
      end
      from (
        select coalesce(sum(severity), 0) as pts
        from public.account_strikes
        where user_id = p_user and (expires_at is null or expires_at > now())
      ) t
    )
  end;
$$;

create or replace function public.get_my_standing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return null; end if;
  return jsonb_build_object(
    'tier', public.account_standing(v_user),
    'points', (select coalesce(sum(severity), 0) from public.account_strikes
               where user_id = v_user and (expires_at is null or expires_at > now())),
    'strikes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'severity', s.severity, 'reason', s.reason, 'category', s.category,
        'source', s.source, 'created_at', s.created_at, 'expires_at', s.expires_at,
        'active', s.expires_at is null or s.expires_at > now()) order by s.created_at desc)
      from public.account_strikes s where s.user_id = v_user), '[]'::jsonb),
    'restrictions', coalesce((select jsonb_agg(jsonb_build_object(
        'restriction', r.restriction, 'reason', r.reason, 'expires_at', r.expires_at))
      from public.account_restrictions r
      where r.user_id = v_user and (r.expires_at is null or r.expires_at > now())), '[]'::jsonb)
  );
end;
$$;

/** Staff issue a strike, optionally with restrictions for a number of days. */
create or replace function public.staff_issue_strike(
  p_user uuid, p_severity int, p_reason text, p_category text default null,
  p_strike_days int default 90, p_restrictions text[] default '{}', p_restrict_days int default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  if not public.is_platform_staff(auth.uid()) then
    raise exception 'Only Disband staff can issue strikes';
  end if;
  if public.is_platform_owner(p_user) then raise exception 'The owner cannot be struck'; end if;
  if p_severity not between 1 and 3 then raise exception 'Severity is 1 to 3'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  insert into public.account_strikes (user_id, severity, reason, category, source, created_by, expires_at)
  values (p_user, p_severity, left(p_reason, 500), p_category, 'staff', auth.uid(),
          case when p_strike_days is null then null else now() + make_interval(days => p_strike_days) end);
  foreach r in array coalesce(p_restrictions, '{}') loop
    insert into public.account_restrictions (user_id, restriction, reason, applied_by, expires_at)
    values (p_user, r::public.account_restriction, left(p_reason, 500), auth.uid(),
            case when p_restrict_days is null then null else now() + make_interval(days => p_restrict_days) end)
    on conflict (user_id, restriction) do update
      set reason = excluded.reason, applied_by = excluded.applied_by, expires_at = excluded.expires_at;
  end loop;
end;
$$;
revoke all on function public.staff_issue_strike(uuid, int, text, text, int, text[], int) from public, anon;

-- ========================================================================= 3. currency

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime integer not null default 0,
  message_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create unique index if not exists wallet_ledger_once on public.wallet_ledger (user_id, reason, ref) where ref is not null;
create index if not exists wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets for select using (user_id = auth.uid());
drop policy if exists "own ledger" on public.wallet_ledger;
create policy "own ledger" on public.wallet_ledger for select using (user_id = auth.uid());

/**
 * Move currency. Positive amounts are earnings: a `ref` makes one-off
 * rewards happen once, and `p_daily_cap` stops farming. Negative amounts
 * are spends and fail on an insufficient balance. Internal only.
 */
create or replace function public.wallet_apply(
  p_user uuid, p_amount int, p_reason text, p_ref text default null, p_daily_cap int default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_today int;
  v_id bigint;
begin
  if p_user is null or p_amount = 0 then return false; end if;
  if exists (select 1 from public.profiles where id = p_user and (is_bot or public.is_anonymous(p_user))) then
    return false;
  end if;
  if p_amount > 0 and p_daily_cap is not null then
    select coalesce(sum(amount), 0) into v_today from public.wallet_ledger
     where user_id = p_user and reason = p_reason and created_at > date_trunc('day', now());
    if v_today + p_amount > p_daily_cap then return false; end if;
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  if p_amount < 0 then
    update public.wallets set balance = balance + p_amount, updated_at = now()
     where user_id = p_user and balance + p_amount >= 0;
    if not found then raise exception 'Not enough to spend'; end if;
  end if;
  insert into public.wallet_ledger (user_id, amount, reason, ref) values (p_user, p_amount, p_reason, p_ref)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    if p_amount < 0 then raise exception 'Already redeemed'; end if;
    return false;
  end if;
  if p_amount > 0 then
    update public.wallets set balance = balance + p_amount, lifetime = lifetime + p_amount, updated_at = now()
     where user_id = p_user;
  end if;
  return true;
end;
$$;
revoke all on function public.wallet_apply(uuid, int, text, text, int) from public, anon, authenticated;

-- Chat: +10 for every 18 messages, up to 400 a day, across spaces, DMs and groups.
create or replace function public.wallet_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.wallets (user_id) values (new.author_id) on conflict do nothing;
  update public.wallets set message_count = message_count + 1 where user_id = new.author_id
  returning message_count into v_count;
  if v_count is not null and v_count % 18 = 0 then
    perform public.wallet_apply(new.author_id, 10, 'chat', null, 400);
  end if;
  return null;
exception when others then
  return null;  -- a reward must never block a message
end;
$$;
drop trigger if exists trg_wallet_messages on public.messages;
create trigger trg_wallet_messages after insert on public.messages for each row execute function public.wallet_on_message();
drop trigger if exists trg_wallet_dm_messages on public.dm_messages;
create trigger trg_wallet_dm_messages after insert on public.dm_messages for each row execute function public.wallet_on_message();
drop trigger if exists trg_wallet_group_messages on public.group_messages;
create trigger trg_wallet_group_messages after insert on public.group_messages for each row execute function public.wallet_on_message();

create or replace function public.wallet_on_server_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.wallet_apply(new.owner_id, 85, 'create_server', new.id::text, 170);
  return null;
exception when others then return null;
end;
$$;
drop trigger if exists trg_wallet_server_created on public.servers;
create trigger trg_wallet_server_created after insert on public.servers for each row execute function public.wallet_on_server_created();

create or replace function public.wallet_on_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_server public.servers%rowtype;
begin
  select * into v_server from public.servers where id = new.server_id;
  if not found or v_server.owner_id = new.user_id then return null; end if;
  if lower(coalesce(v_server.vanity_code, '')) = 'disband' then
    perform public.wallet_apply(new.user_id, 30, 'join_official', 'official');
  else
    perform public.wallet_apply(new.user_id, 15, 'join_server', new.server_id::text, 75);
  end if;
  return null;
exception when others then return null;
end;
$$;
drop trigger if exists trg_wallet_member_joined on public.server_members;
create trigger trg_wallet_member_joined after insert on public.server_members for each row execute function public.wallet_on_member_joined();

create or replace function public.wallet_on_profile_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null then
    perform public.wallet_apply(new.id, 10, 'avatar', to_char(now(), 'YYYY-MM-DD'));
  end if;
  if new.banner_url is distinct from old.banner_url and new.banner_url is not null then
    perform public.wallet_apply(new.id, 10, 'banner', to_char(now(), 'YYYY-MM-DD'));
  end if;
  return null;
exception when others then return null;
end;
$$;
drop trigger if exists trg_wallet_profile_updated on public.profiles;
create trigger trg_wallet_profile_updated after update of avatar_url, banner_url on public.profiles
  for each row execute function public.wallet_on_profile_updated();

/** Spend on a reward. `p_item` names the decoration for 'decoration'. */
create or replace function public.wallet_redeem(p_reward text, p_item text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cost int;
  v_until timestamptz;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if public.is_anonymous(v_user) then raise exception 'Anonymous accounts cannot redeem rewards'; end if;
  v_cost := case p_reward when 'aero_week' then 650 when 'decoration' then 500 else null end;
  if v_cost is null then raise exception 'Unknown reward'; end if;

  if p_reward = 'decoration' then
    if not exists (select 1 from public.shop_items where id = p_item and category = 'ring' and active) then
      raise exception 'That decoration is not available';
    end if;
    if exists (select 1 from public.user_shop_items where user_id = v_user and item_id = p_item) then
      raise exception 'You already own that decoration';
    end if;
    perform public.wallet_apply(v_user, -v_cost, 'redeem_decoration', p_item);
    insert into public.user_shop_items (user_id, item_id) values (v_user, p_item);
    return jsonb_build_object('ok', true, 'reward', p_reward, 'item', p_item);
  end if;

  perform public.wallet_apply(v_user, -v_cost, 'redeem_aero_week', gen_random_uuid()::text);
  select greatest(coalesce(expires_at, now()), now()) + interval '7 days' into v_until
    from public.gift_entitlements where user_id = v_user;
  v_until := coalesce(v_until, now() + interval '7 days');
  insert into public.gift_entitlements (user_id, plan, expires_at, updated_at)
  values (v_user, 'aero', v_until, now())
  on conflict (user_id) do update set plan = 'aero', expires_at = excluded.expires_at, updated_at = now();
  perform public.refresh_user_badges(v_user);
  return jsonb_build_object('ok', true, 'reward', p_reward, 'until', v_until);
end;
$$;
revoke all on function public.wallet_redeem(text, text) from public, anon;

-- Rewarded ads. A session is opened by the API when an ad starts and is only
-- paid when the ad network's signed server-side callback confirms the view,
-- so a client cannot claim an ad it did not watch.
create table if not exists public.ad_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  verified_at timestamptz,
  seconds integer,
  reward integer
);
create index if not exists ad_views_user_idx on public.ad_views (user_id, started_at desc);
alter table public.ad_views enable row level security;
drop policy if exists "own ad views" on public.ad_views;
create policy "own ad views" on public.ad_views for select using (user_id = auth.uid());

/** 35s pays 240, 60s pays 480, and longer pays more per second. */
create or replace function public.ad_reward_for(p_seconds int)
returns int language sql immutable as $$
  select greatest(0, least(1600, round(9.6 * least(p_seconds, 180) - 96)::int));
$$;

-- ==================================================================== 4. creator program

create table if not exists public.creator_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'twitch')),
  account_id text not null,
  handle text,
  followers integer not null default 0,
  verified_at timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, platform),
  unique (platform, account_id)
);
alter table public.creator_connections enable row level security;
drop policy if exists "own creator connections" on public.creator_connections;
create policy "own creator connections" on public.creator_connections for select using (user_id = auth.uid());
drop policy if exists "remove own creator connection" on public.creator_connections;
create policy "remove own creator connection" on public.creator_connections for delete using (user_id = auth.uid());

/** Public creator stats for a profile (what the badge hover shows). */
create or replace function public.creator_stats(p_user uuid)
returns table (platform text, handle text, followers integer)
language sql stable security definer set search_path = public as $$
  select platform, handle, followers from public.creator_connections
  where user_id = p_user and followers >= 2500 order by followers desc;
$$;

-- ======================================================================= 5. promotions

create table if not exists public.server_promotions (
  id bigserial primary key,
  server_id uuid not null references public.servers(id) on delete cascade,
  purchased_by uuid,
  days integer not null,
  amount_cents integer not null,
  stripe_session_id text unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists server_promotions_active_idx on public.server_promotions (server_id, ends_at desc);
alter table public.server_promotions enable row level security;
drop policy if exists "buyers read promotions" on public.server_promotions;
create policy "buyers read promotions" on public.server_promotions for select
  using (purchased_by = auth.uid() or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid()));

create or replace function public.server_promoted_until(p_server uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(ends_at) from public.server_promotions where server_id = p_server and ends_at > now();
$$;

/** Called by the Stripe webhook (service role): stacks after any current run. */
create or replace function public.record_server_promotion(
  p_server uuid, p_buyer uuid, p_days int, p_amount int, p_session text
)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if exists (select 1 from public.server_promotions where stripe_session_id = p_session) then
    return (select ends_at from public.server_promotions where stripe_session_id = p_session);
  end if;
  v_start := greatest(now(), coalesce(public.server_promoted_until(p_server), now()));
  v_end := v_start + make_interval(days => p_days);
  insert into public.server_promotions (server_id, purchased_by, days, amount_cents, stripe_session_id, starts_at, ends_at)
  values (p_server, p_buyer, p_days, p_amount, p_session, v_start, v_end);
  return v_end;
end;
$$;
revoke all on function public.record_server_promotion(uuid, uuid, int, int, text) from public, anon, authenticated;

drop function if exists public.list_discoverable_servers();
create function public.list_discoverable_servers()
returns table (id uuid, name text, icon_url text, banner_url text, description text, owner_id uuid,
               owner_name text, member_count bigint, created_at timestamptz, verified boolean,
               partner boolean, promoted_until timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.icon_url, s.banner_url, s.description, s.owner_id,
    coalesce(p.display_name, p.username, 'Unknown'),
    (select count(*) from public.server_members sm where sm.server_id = s.id) as member_count,
    s.created_at, s.verified, s.partner,
    public.server_promoted_until(s.id) as promoted_until
  from public.servers s
  join public.profiles p on p.id = s.owner_id
  where s.discoverable = true and s.suspended_at is null
  order by (public.server_promoted_until(s.id) is not null) desc, member_count desc, s.created_at asc;
$$;
grant execute on function public.list_discoverable_servers() to anon, authenticated;

-- ============================================================================ 6. bots

create or replace function public.is_valid_bot_scopes(p_scopes text[])
returns boolean language plpgsql immutable as $$
declare s text;
begin
  if p_scopes is null then return false; end if;
  foreach s in array p_scopes loop
    if s not in ('messages.read', 'messages.write', 'messages.delete', 'messages.react',
                 'members.read', 'members.kick', 'members.ban', 'members.timeout',
                 'channels.read', 'channels.manage', 'webhooks.manage') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.bots add column if not exists description text;
alter table public.bot_invites add column if not exists reusable boolean not null default false;

/** One link anyone can use to add the bot to a space they manage. */
create or replace function public.bot_install_link(p_bot_id uuid, p_actor_id uuid, p_scopes text[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_valid_bot_scopes(p_scopes) then raise exception 'Invalid bot scopes'; end if;
  if not exists (select 1 from public.bots where id = p_bot_id and owner_id = p_actor_id and revoked_at is null) then
    raise exception 'Only the bot owner can make an install link';
  end if;
  select coalesce(array_agg(x), array[]::text[]) into p_scopes
  from unnest(p_scopes) x where x in (select unnest(scopes) from public.bots where id = p_bot_id);
  if array_length(p_scopes, 1) is null then raise exception 'No valid scopes requested'; end if;
  -- Reuse the bot's link if it has one with the same permissions.
  select code into v_code from public.bot_invites
   where bot_id = p_bot_id and reusable and status = 'pending' and scopes @> p_scopes and scopes <@ p_scopes
   limit 1;
  if v_code is not null then return v_code; end if;
  update public.bot_invites set status = 'expired' where bot_id = p_bot_id and reusable and status = 'pending';
  v_code := encode(gen_random_bytes(12), 'hex');
  insert into public.bot_invites (bot_id, server_id, code, scopes, created_by, reusable, expires_at)
  values (p_bot_id, null, v_code, p_scopes, p_actor_id, true, now() + interval '100 years');
  return v_code;
end;
$$;
revoke all on function public.bot_install_link(uuid, uuid, text[]) from public, anon, authenticated;

-- Approving a reusable link installs the bot without using the link up.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.bot_approve_invite(text,uuid,uuid)'::regprocedure);
  if position('if v_invite.status <> ''pending'' then' in def) = 0
     or position('update public.bot_invites set status = ''approved'', server_id = v_server_id where id = v_invite.id;' in def) = 0 then
    raise exception 'bot_approve_invite changed shape';
  end if;
  def := replace(def,
    'update public.bot_invites set status = ''approved'', server_id = v_server_id where id = v_invite.id;',
    'if not v_invite.reusable then update public.bot_invites set status = ''approved'', server_id = v_server_id where id = v_invite.id; end if;');
  def := replace(def,
    'if v_invite.server_id is not null then',
    'if v_invite.server_id is not null and not v_invite.reusable then');
  execute def;
end;
$$;

-- The service role runs the webhook, ad-callback and creator routes.
grant execute on function public.wallet_apply(uuid, int, text, text, int) to service_role;
grant execute on function public.record_server_promotion(uuid, uuid, int, int, text) to service_role;
grant execute on function public.bot_install_link(uuid, uuid, text[]) to service_role;

-- Moderation for bots. Each checks the bot's grant for the space, and none
-- will touch the owner, anyone who can moderate, or another bot.
create or replace function public.bot_can_moderate(p_bot_id uuid, p_server_id uuid, p_scope text, p_target uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_bot public.bots%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id and revoked_at is null;
  if not found then raise exception 'Bot not found'; end if;
  if not exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = p_server_id and p_scope = any(scopes)) then
    raise exception 'Missing permission: %', p_scope;
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_target) then raise exception 'Cannot act on the space owner'; end if;
  if p_target = v_bot.user_id or exists (select 1 from public.profiles where id = p_target and is_bot) then raise exception 'Cannot act on a bot'; end if;
  if public.member_has_server_permission(p_server_id, p_target, 'kick')
     or public.member_has_server_permission(p_server_id, p_target, 'ban')
     or public.member_has_server_permission(p_server_id, p_target, 'manage_server') then
    raise exception 'Cannot act on a moderator';
  end if;
  return v_bot.user_id;
end; $$;

create or replace function public.bot_kick_member(p_bot_id uuid, p_server_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  v_actor := public.bot_can_moderate(p_bot_id, p_server_id, 'members.kick', p_user_id);
  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
  perform public.write_audit_log(p_server_id, 'member.kick', 'user', p_user_id::text, jsonb_build_object('bot', p_bot_id));
end; $$;

create or replace function public.bot_ban_member(p_bot_id uuid, p_server_id uuid, p_user_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  v_actor := public.bot_can_moderate(p_bot_id, p_server_id, 'members.ban', p_user_id);
  insert into public.server_bans (server_id, user_id, banned_by, reason) values (p_server_id, p_user_id, v_actor, left(p_reason, 500))
  on conflict do nothing;
  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
  perform public.write_audit_log(p_server_id, 'member.ban', 'user', p_user_id::text, jsonb_build_object('bot', p_bot_id, 'reason', p_reason));
end; $$;

create or replace function public.bot_timeout_member(p_bot_id uuid, p_server_id uuid, p_user_id uuid, p_minutes int, p_reason text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_until timestamptz;
begin
  v_actor := public.bot_can_moderate(p_bot_id, p_server_id, 'members.timeout', p_user_id);
  if p_minutes is null or p_minutes < 1 or p_minutes > 40320 then raise exception 'Timeouts are 1 minute to 28 days'; end if;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.server_timeouts (server_id, user_id, expires_at, reason, created_by)
  values (p_server_id, p_user_id, v_until, left(p_reason, 500), v_actor)
  on conflict (server_id, user_id) do update set expires_at = excluded.expires_at, reason = excluded.reason, created_by = excluded.created_by;
  perform public.write_audit_log(p_server_id, 'member.timeout', 'user', p_user_id::text, jsonb_build_object('bot', p_bot_id, 'minutes', p_minutes));
  return v_until;
end; $$;
revoke all on function public.bot_kick_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_ban_member(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bot_timeout_member(uuid, uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.bot_kick_member(uuid, uuid, uuid) to service_role;
grant execute on function public.bot_ban_member(uuid, uuid, uuid, text) to service_role;
grant execute on function public.bot_timeout_member(uuid, uuid, uuid, int, text) to service_role;
