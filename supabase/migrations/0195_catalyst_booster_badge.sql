-- ---------------------------------------------------------------------------
-- 0195: Catalysts earn the Server Booster badge.
--
-- The badge (0060/0066) only ever looked at server_boosts, the table boosts
-- used before Catalysts (0080) replaced them. Placing a Catalyst writes to
-- server_catalysts, which nothing watched, so almost nobody who boosted a
-- space with Catalysts got the badge.
--
-- "Currently boosting" now means an unexpired Catalyst in server_catalysts
-- (bought or from Aero's monthly credits), or a legacy server_boosts row.
-- Rows with source 'official' don't count: they are the house Catalysts that
-- keep the official Disband space at full level, filed under its owner.
--
-- A trigger keeps the badge in step as Catalysts are placed, withdrawn,
-- transferred or expire (expire_catalysts deletes the rows, which fires it),
-- and everyone affected is backfilled at the end.
-- ---------------------------------------------------------------------------

create or replace function public.sync_boost_badge(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  if exists (select 1 from public.server_boosts where user_id = p_user)
     or exists (
       select 1 from public.server_catalysts
       where user_id = p_user
         and source <> 'official'
         and (expires_at is null or expires_at > now())
     ) then
    perform public.award_badge(p_user, 'boost');
  else
    delete from public.user_badges where user_id = p_user and badge_key = 'boost';
  end if;
end;
$$;

revoke all on function public.sync_boost_badge(uuid) from public, anon, authenticated;

create or replace function public.on_server_catalyst_badge_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then perform public.sync_boost_badge(old.user_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    perform public.sync_boost_badge(new.user_id);
  end if;
  return null;
end;
$$;

revoke all on function public.on_server_catalyst_badge_event() from public, anon, authenticated;

drop trigger if exists trg_server_catalyst_badge_event on public.server_catalysts;
create trigger trg_server_catalyst_badge_event
  after insert or update of user_id, expires_at or delete on public.server_catalysts
  for each row execute function public.on_server_catalyst_badge_event();

-- The nightly refresh uses the same rule.
create or replace function public.refresh_user_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_n bigint;
begin
  if p_user is null then return; end if;
  select created_at into v_created from public.profiles where id = p_user;

  -- A year on the platform.
  if v_created is not null and v_created <= now() - interval '1 year' then
    perform public.award_badge(p_user, 'anniv', jsonb_build_object('since', v_created));
  end if;

  -- Registered a bot, and a bot that reached 50 servers.
  if exists (select 1 from public.bots where owner_id = p_user and revoked_at is null) then
    perform public.award_badge(p_user, 'bot_dev');
  end if;
  select coalesce(max(c), 0) into v_n from (
    select count(*) c from public.bot_grants g
    join public.bots b on b.id = g.bot_id
    where b.owner_id = p_user and b.revoked_at is null
    group by g.bot_id
  ) x;
  if v_n >= 50 then
    perform public.award_badge(p_user, 'bot_ver', jsonb_build_object('servers', v_n));
  end if;

  -- Owns a verified server.
  if exists (select 1 from public.servers where owner_id = p_user and verified) then
    perform public.award_badge(p_user, 'server_v');
  end if;

  -- Owns a server that passed 100 members.
  select coalesce(max(c), 0) into v_n from (
    select count(*) c from public.server_members m
    join public.servers s on s.id = m.server_id
    where s.owner_id = p_user group by m.server_id
  ) x;
  if v_n >= 100 then
    perform public.award_badge(p_user, 'founder', jsonb_build_object('members', v_n));
  end if;

  -- Boosting is a present-tense fact, so it comes back off again.
  perform public.sync_boost_badge(p_user);

  -- People who joined through your invites: server invite joins plus
  -- verified referral-code signups, deduplicated (see recruit_count).
  select public.recruit_count(p_user) into v_n;
  if v_n >= 25 then
    perform public.award_badge(p_user, 'recruit', jsonb_build_object('joined', v_n));
  end if;

  -- Custom emoji uploaded.
  select count(*) into v_n from public.custom_emoji where uploader_id = p_user;
  if v_n >= 25 then
    perform public.award_badge(p_user, 'emoji', jsonb_build_object('uploaded', v_n));
  end if;

  -- Confirmed bug reports.
  select count(*) into v_n from public.bug_reports
  where reporter_user_id = p_user and status in ('confirmed', 'resolved', 'fixed', 'accepted');
  if v_n >= 1 then
    perform public.award_badge(p_user, 'hunter', jsonb_build_object('reports', v_n));
  end if;
  if v_n >= 10 then
    perform public.award_badge(p_user, 'hunter2', jsonb_build_object('reports', v_n));
    perform public.award_badge(p_user, 'feedback', jsonb_build_object('reports', v_n));
  end if;

  -- Time spent in calls, in minutes.
  select coalesce(voice_minutes, 0) into v_n from public.profiles where id = p_user;
  if v_n >= 6000 then
    perform public.award_badge(p_user, 'voice', jsonb_build_object('minutes', v_n));
  end if;

  -- Used a native app while the apps were new.
  if exists (
    select 1 from public.device_tokens
    where user_id = p_user and platform in ('ios', 'android')
      and updated_at < timestamptz '2027-01-01'
  ) then
    perform public.award_badge(p_user, 'mobile');
  end if;

  -- Early Supporter: granted to Aero subscribers (paid or gifted).
  if exists (
    select 1 from public.subscriptions
    where user_id = p_user and plan = 'aero'
      and status in ('active','trialing','past_due')
  ) or exists (
    select 1 from public.gift_entitlements
    where user_id = p_user and plan = 'aero' and expires_at > now()
  ) then
    perform public.award_badge(p_user, 'early');
  end if;
end;
$$;

-- Backfill.
select public.sync_boost_badge(u.user_id)
from (
  select user_id from public.server_catalysts
  union select user_id from public.server_boosts
  union select user_id from public.user_badges where badge_key = 'boost'
) u;

update public.badges
   set description = 'Currently boosting a space with Catalysts'
 where key = 'boost';
