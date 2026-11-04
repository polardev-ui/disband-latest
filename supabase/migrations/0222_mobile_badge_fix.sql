-- 0222_mobile_badge_fix.sql
-- Mobile Pioneer badge was only awarded when platform was exactly 'ios' or
-- 'android', so users whose only registered token was 'ios-voip' never got it.
-- Also award the badge immediately when a device token is registered, instead
-- of waiting for the next sign-in/refresh.

-- 1. Update the badge condition to include ios-voip.
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
    where user_id = p_user and platform in ('ios', 'ios-voip', 'android')
      and updated_at < timestamptz '2027-01-01'
  ) then
    perform public.award_badge(p_user, 'mobile');
  end if;

  -- Early Supporter: Aero or Lite (paid or gifted), until the end of 2026.
  if now() < timestamptz '2027-01-01 00:00:00+00' and (
    exists (
      select 1 from public.subscriptions
      where user_id = p_user and plan in ('aero', 'lite')
        and status in ('active','trialing','past_due')
    ) or exists (
      select 1 from public.gift_entitlements
      where user_id = p_user and plan in ('aero', 'lite') and expires_at > now()
    )
  ) then
    perform public.award_badge(p_user, 'early');
  end if;
end;
$$;

-- 2. Make register_device_token award the badge immediately.
create or replace function public.register_device_token(
  p_token text,
  p_platform text default 'ios',
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.device_tokens (user_id, token, platform, app_version, updated_at)
    values (auth.uid(), p_token, p_platform, p_app_version, now())
  on conflict (user_id, token)
    do update set
      updated_at = now(),
      platform = excluded.platform,
      app_version = coalesce(excluded.app_version, public.device_tokens.app_version);
  perform public.refresh_user_badges(auth.uid());
end;
$$;