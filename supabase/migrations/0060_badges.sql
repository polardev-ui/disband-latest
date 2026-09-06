-- 0060_badges.sql
-- Profile badges as data rather than columns.
--
-- Badges lived as four boolean columns on `profiles` (show_owner_badge and
-- friends), hardcoded against an array in the client. Twenty-five badges that
-- way is a migration and a deploy per badge, and nothing can carry per-award
-- detail — when it was earned, which tier, which server. A catalogue table
-- plus a join table costs one insert per new badge and gives every award a
-- place to keep its own facts.

create table if not exists public.badges (
  key         text primary key,
  name        text not null,
  description text not null,
  category    text not null,
  accent      text not null,
  sort        int  not null default 0,
  automatic   boolean not null default false
);

create table if not exists public.user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_key  text not null references public.badges(key) on delete cascade,
  awarded_at timestamptz not null default now(),
  -- Someone may want a badge they hold kept off their profile.
  visible    boolean not null default true,
  -- Per-award facts: the server that earned it, the count reached, the tier.
  metadata   jsonb not null default '{}'::jsonb,
  primary key (user_id, badge_key)
);

create index if not exists user_badges_user_idx on public.user_badges(user_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select to authenticated using (true);

-- Badges are public profile decoration, so anyone signed in may read them.
drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read on public.user_badges for select to authenticated using (true);

-- Only the visibility flag is yours to change. Awarding runs through
-- security-definer functions so nobody can grant themselves Staff.
drop policy if exists user_badges_toggle on public.user_badges;
create policy user_badges_toggle on public.user_badges for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- catalogue
insert into public.badges (key, name, description, category, accent, sort, automatic) values
  ('owner',     'Disband Owner',          'Owner and Founder of Disband',      'staff',       '#faa61a',  10, false),
  ('staff',     'Disband Staff',          'Member of the Disband staff team',  'staff',       '#8ea1e1',  20, false),
  ('moderator', 'Disband Moderator',      'On the platform moderation team',   'staff',       '#5865f2',  30, false),
  ('partner',   'Disband Partner',        'Runs a partnered community',        'staff',       '#c77dff',  40, false),
  ('og',        'OG',                     'Joined Disband during its early days', 'tenure',   '#f04747',  50, false),
  ('early',     'Early Supporter',        'Subscribed during the first year',  'tenure',      '#ff73a6',  60, true),
  ('anniv',     'Anniversary',            'One year on Disband',               'tenure',      '#f2c94c',  70, true),
  ('bot_dev',   'Bot Developer',          'Registered a bot on Disband',       'development', '#57f287',  80, true),
  ('bot_ver',   'Verified Bot Developer', 'Runs a bot in 50 or more servers',  'development', '#3ba55c',  90, true),
  ('contrib',   'Contributor',            'Landed a code contribution',        'development', '#00b8d4', 100, false),
  ('translate', 'Translator',             'Contributed a translation',         'development', '#4ec9b0', 110, false),
  ('bounty',    'Bug Bounty Hunter',      'Helped find and report bugs in Disband', 'quality', '#43b581', 120, false),
  ('hunter',    'Bug Hunter',             'Reported a confirmed bug',          'quality',     '#7fd67f', 130, true),
  ('hunter2',   'Elite Bug Hunter',       'Ten confirmed bug reports',         'quality',     '#2f9e63', 140, true),
  ('security',  'Security Researcher',    'Responsibly disclosed a vulnerability', 'quality', '#e8506e', 150, false),
  ('feedback',  'Feedback Champion',      'Ten accepted reports',              'quality',     '#87d9c4', 160, true),
  ('founder',   'Server Founder',         'Grew a server past 100 members',    'community',   '#e79b3f', 170, true),
  ('server_v',  'Verified Server Owner',  'Owns a verified server',            'community',   '#5ec8d8', 180, true),
  ('boost',     'Server Booster',         'Currently boosting a server',       'community',   '#ff73fa', 190, true),
  ('recruit',   'Recruiter',              '25 people joined through your invites', 'community', '#9b8cff', 200, true),
  ('emoji',     'Emoji Artist',           'Uploaded 25 custom emoji',          'community',   '#fee75c', 210, true),
  ('gift',      'Gift Giver',             'Gifted a subscription to someone',  'community',   '#ff9f43', 220, true),
  ('beta',      'Beta Tester',            'Ran a pre-release build',           'platform',    '#00d4aa', 230, false),
  ('mobile',    'Mobile Pioneer',         'Used the native apps early',        'platform',    '#6fb3ff', 240, true),
  ('voice',     'Voice Veteran',          '100 hours in calls',                'platform',    '#f2994a', 250, true)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  accent = excluded.accent, sort = excluded.sort, automatic = excluded.automatic;

-- ------------------------------------------------- counters the badges need
-- Neither of these could be derived from what was already stored: calls left
-- no record of their length, and a join never recorded who invited you.
alter table public.profiles      add column if not exists voice_minutes bigint not null default 0;
alter table public.server_members add column if not exists invited_by uuid references auth.users(id) on delete set null;

create index if not exists server_members_invited_by_idx
  on public.server_members(invited_by) where invited_by is not null;

-- --------------------------------------------------------------- awarding
create or replace function public.award_badge(p_user uuid, p_key text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.user_badges (user_id, badge_key, metadata)
  values (p_user, p_key, coalesce(p_meta, '{}'::jsonb))
  on conflict (user_id, badge_key) do update set metadata = excluded.metadata;
$$;

revoke execute on function public.award_badge(uuid, text, jsonb) from public, anon, authenticated;

/*
 * Recompute every automatic badge for one person.
 *
 * Called from the events that could change an answer rather than swept
 * nightly, so a badge appears when it is earned. Awards only ever get added
 * here — except Server Booster, which is a statement about right now and is
 * withdrawn when the last boost ends.
 */
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
  select count(distinct user_id) into v_n from public.server_members where invited_by = p_user;
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
end;
$$;

grant execute on function public.refresh_user_badges(uuid) to authenticated;

-- Adding call time is what makes Voice Veteran reachable; the client reports
-- a completed call's length and the total accrues here.
create or replace function public.add_voice_minutes(p_minutes int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_minutes is null or p_minutes <= 0 or p_minutes > 720 then return; end if;
  update public.profiles set voice_minutes = coalesce(voice_minutes, 0) + p_minutes
  where id = auth.uid();
  perform public.refresh_user_badges(auth.uid());
end;
$$;

grant execute on function public.add_voice_minutes(int) to authenticated;

-- ------------------------------------------------------------------- read
create or replace function public.get_profile_badges(p_user_id uuid)
returns table (
  key text, name text, description text, category text,
  accent text, sort int, awarded_at timestamptz, metadata jsonb
)
language sql stable security definer set search_path = public as $$
  select b.key, b.name, b.description, b.category, b.accent, b.sort,
         ub.awarded_at, ub.metadata
  from public.user_badges ub
  join public.badges b on b.key = ub.badge_key
  where ub.user_id = p_user_id and ub.visible
  order by b.sort;
$$;

grant execute on function public.get_profile_badges(uuid) to authenticated;

-- Hide or show one of your own badges.
create or replace function public.set_badge_visible(p_key text, p_visible boolean)
returns void language sql security definer set search_path = public as $$
  update public.user_badges set visible = p_visible
  where user_id = auth.uid() and badge_key = p_key;
$$;

grant execute on function public.set_badge_visible(text, boolean) to authenticated;

-- --------------------------------------------------- carry the old columns
-- The four booleans keep working for one release so a client that has not
-- been deployed yet does not lose its badges mid-rollout.
insert into public.user_badges (user_id, badge_key)
select id, 'owner' from public.profiles where show_owner_badge
on conflict do nothing;
insert into public.user_badges (user_id, badge_key)
select id, 'staff' from public.profiles where show_staff_badge
on conflict do nothing;
insert into public.user_badges (user_id, badge_key)
select id, 'og' from public.profiles where show_og_badge
on conflict do nothing;
insert into public.user_badges (user_id, badge_key)
select id, 'bounty' from public.profiles where show_bounty_badge
on conflict do nothing;
