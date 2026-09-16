-- 0066_badges_auto_refresh.sql
-- refresh_user_badges() existed since 0060 but nothing ever invoked it, so no
-- automatic badge was ever awarded — Server Founder, Verified Server Owner,
-- Bot Developer, Recruiter and friends all sat unearned. Register triggers on
-- the events that can change an answer (matching the function's own doc
-- comment: "Called from the events that could change an answer") and backfill
-- everyone who already qualified.

-- ------------------------------- server membership: founder / recruiter
create or replace function public.on_server_members_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_server      uuid;
  v_invited_by  uuid;
  v_owner       uuid;
begin
  if tg_op = 'DELETE' then
    v_server     := old.server_id;
    v_invited_by := old.invited_by;
  else
    v_server     := new.server_id;
    v_invited_by := new.invited_by;
  end if;

  -- Server Founder: the owner of a server whose member count reached 100+.
  if v_server is not null then
    select owner_id into v_owner from public.servers where id = v_server;
    if v_owner is not null then
      perform public.refresh_user_badges(v_owner);
    end if;
  end if;

  -- Recruiter: someone joined through this person's invite.
  if v_invited_by is not null then
    perform public.refresh_user_badges(v_invited_by);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_server_members_badge_event on public.server_members;
create trigger trg_server_members_badge_event
  after insert or update of server_id, invited_by or delete on public.server_members
  for each row execute function public.on_server_members_badge_event();

-- ---------------------------------------- verified server: server_v owner
create or replace function public.on_server_verified_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verified and (not coalesce(old.verified, false)) and new.owner_id is not null then
    perform public.refresh_user_badges(new.owner_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_server_verified_badge_event on public.servers;
create trigger trg_server_verified_badge_event
  after update of verified on public.servers
  for each row execute function public.on_server_verified_badge_event();

-- --------------------------------- bots: bot_dev / bot_ver (grant count)
create or replace function public.on_bot_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  v_owner := coalesce(new.owner_id, old.owner_id);
  if v_owner is not null then
    perform public.refresh_user_badges(v_owner);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bot_badge_event on public.bots;
create trigger trg_bot_badge_event
  after insert or update of owner_id, revoked_at or delete on public.bots
  for each row execute function public.on_bot_badge_event();

create or replace function public.on_bot_grant_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.bots where id = coalesce(new.bot_id, old.bot_id);
  if v_owner is not null then
    perform public.refresh_user_badges(v_owner);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bot_grant_badge_event on public.bot_grants;
create trigger trg_bot_grant_badge_event
  after insert or update of bot_id, server_id or delete on public.bot_grants
  for each row execute function public.on_bot_grant_badge_event();

-- ------------------------------------ emoji artist: custom_emoji upload
create or replace function public.on_custom_emoji_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.uploader_id is not null then
    perform public.refresh_user_badges(new.uploader_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_custom_emoji_badge_event on public.custom_emoji;
create trigger trg_custom_emoji_badge_event
  after insert on public.custom_emoji
  for each row execute function public.on_custom_emoji_badge_event();

-- -------------------------------- bug hunter tiers: report status flips
create or replace function public.on_bug_report_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('confirmed', 'resolved', 'fixed', 'accepted')
     and new.reporter_user_id is not null then
    perform public.refresh_user_badges(new.reporter_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bug_report_badge_event on public.bug_reports;
create trigger trg_bug_report_badge_event
  after insert or update of status on public.bug_reports
  for each row execute function public.on_bug_report_badge_event();

-- ------------------------------- booster: present-tense, add *and* remove
create or replace function public.on_server_boost_badge_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);
  if v_user is not null then
    perform public.refresh_user_badges(v_user);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_server_boost_badge_event on public.server_boosts;
create trigger trg_server_boost_badge_event
  after insert or update or delete on public.server_boosts
  for each row execute function public.on_server_boost_badge_event();

-- -------------------------------------------- one-time backfill
-- Award anything already earned before the triggers existed. Bounded to users
-- with any badge-relevant footprint so it stays cheap on a large database.
do $$
declare r record;
begin
  for r in
    select id from (
      select owner_id as id from public.servers
      union select uploader_id as id from public.custom_emoji where uploader_id is not null
      union select invited_by as id from public.server_members where invited_by is not null
      union select owner_id as id from public.bots
      union select reporter_user_id as id from public.bug_reports where reporter_user_id is not null
      union select user_id as id from public.server_boosts
    ) x
  loop
    perform public.refresh_user_badges(r.id);
  end loop;
end $$;