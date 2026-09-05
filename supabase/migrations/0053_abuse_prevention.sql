-- 0053: abuse prevention.
--
-- Closes the anonymous attack surface a spammer can hammer with just the
-- (public) anon key, and throttles the remaining authenticated paths so a
-- scripted account can't pound the API either. The `security definer` invite
-- lookups were executable by `anon`, meaning every unauthenticated request
-- reached a full privileged query against Postgres — exactly the kind of load
-- that saturates a small instance's connection pool and lags every user.

-- ---------------------------------------------------------------------------
-- Simple per-key sliding-window rate limiter (no extension required).
-- ---------------------------------------------------------------------------

create table if not exists public.platform_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 1
);

alter table public.platform_rate_limits enable row level security;

revoke all on table public.platform_rate_limits from anon, authenticated, public;
grant all on table public.platform_rate_limits to service_role;

create or replace function public.platform_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.platform_rate_limits (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
          when public.platform_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.platform_rate_limits.window_start
        end,
        hits = case
          when public.platform_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.platform_rate_limits.hits + 1
        end
  returning hits into v_hits;

  if v_hits > p_max then
    raise exception 'Rate limit exceeded. Try again later.';
  end if;
end;
$$;

revoke all on function public.platform_rate_limit(text, integer, integer) from anon, authenticated, public;
grant execute on function public.platform_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- get_server_by_invite: throttled, and no longer callable anonymously.
-- ---------------------------------------------------------------------------

create or replace function public.get_server_by_invite(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  icon_url text,
  banner_url text,
  invite_code text,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_rate_limit('invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.invite_code = p_code;
end;
$$;

revoke execute on function public.get_server_by_invite(text) from anon;

-- ---------------------------------------------------------------------------
-- bot_invite_info: throttled, and no longer callable anonymously. The API
-- route wrapper (which uses the service role) is unaffected.
-- ---------------------------------------------------------------------------

create or replace function public.bot_invite_info(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.platform_rate_limit('bot-invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  select jsonb_build_object(
    'code', i.code,
    'status', i.status,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'scopes', i.scopes,
    'bot', jsonb_build_object(
      'id', b.id,
      'user_id', b.user_id,
      'name', b.name,
      'avatar_url', b.avatar_url
    ),
    'server', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'icon_url', s.icon_url,
      'owner_id', s.owner_id
    )
  ) into v
  from public.bot_invites i
  join public.bots b on b.id = i.bot_id
  join public.servers s on s.id = i.server_id
  where i.code = p_code;

  return v;
end;
$$;

revoke execute on function public.bot_invite_info(text) from anon;

-- ---------------------------------------------------------------------------
-- check_username_available: no more anonymous RPC. The web route already
-- rate-limits by IP and now proxies through the service role.
-- ---------------------------------------------------------------------------

revoke execute on function public.check_username_available(text) from anon;
grant execute on function public.check_username_available(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- server_boosts: stop exposing the whole platform's booster table. Only
-- users who share a server with a booster can see that boost.
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can view boosts" on public.server_boosts;
create policy "Members can view boosts" on public.server_boosts
  for select to authenticated
  using (public.is_server_member(server_id));

-- ---------------------------------------------------------------------------
-- bug_reports: require a real reporter (the "anonymous" insert policy let a
-- scripted account file unlimited spam rows).
-- ---------------------------------------------------------------------------

drop policy if exists "bug_reports_insert" on public.bug_reports;
create policy "bug_reports_insert" on public.bug_reports
  for insert to authenticated
  with check (reporter_user_id = auth.uid());