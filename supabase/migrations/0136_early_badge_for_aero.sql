-- 0136: Award the Early Supporter badge to Aero subscribers.
create or replace function public.refresh_user_badges(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
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
  if exists (select 1 from public.server_boosts where user_id = p_user) then
    perform public.award_badge(p_user, 'boost');
  else
    delete from public.user_badges where user_id = p_user and badge_key = 'boost';
  end if;

  -- People who joined through your invites.
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