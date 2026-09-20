-- 0093_security_hardening_2.sql
-- Forensics-driven follow-ups (Sept 15 raid, Sept 19 incident, audit gaps).
--
-- Patch 1: raid guard — join-velocity detection on server_members.
-- Patch 2: audit attribution — nil-UUID system actor, backfill Sept 19,
--          NOT NULL actor_id going forward.
-- Patch 3: server.join audit for the discovery path (join_server_by_id).
-- Patch 5: platform_rate_limits TTL hygiene.
-- Patch 6: auth-gate event log backing the failed-login digest.
-- (Patch 4, fail-soft username blocks, is app code in signup-check.)

-- ===========================================================================
-- Patch 1: raid guard.
-- >50 joins to one server in 10 minutes writes a raid_suspected audit row
-- and pushes the server owner. Alerts re-fire every 50 joins so sustained
-- raids stay visible without spamming per-join.
-- ===========================================================================

create or replace function public.check_join_velocity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_owner uuid;
begin
  select count(*) into v_count
  from public.server_members
  where server_id = new.server_id
    and joined_at > now() - interval '10 minutes';

  if v_count >= 51 and (v_count - 51) % 50 = 0 then
    insert into public.audit_log (server_id, actor_id, action, target_type, target_id, details)
    values (
      new.server_id,
      '00000000-0000-0000-0000-000000000000',
      'server.raid_suspected',
      'server',
      new.server_id::text,
      jsonb_build_object('joins_10min', v_count)
    );

    select owner_id into v_owner from public.servers where id = new.server_id;
    if v_owner is not null then
      perform public.notify_push(
        v_owner,
        'Unusual join activity',
        'Your server is seeing a surge of new members. Review recent joins.',
        'raid-guard'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists join_velocity_guard on public.server_members;
create trigger join_velocity_guard
  after insert on public.server_members
  for each row execute function public.check_join_velocity();

-- ===========================================================================
-- Patch 2: audit attribution.
-- Service-role bulk actions recorded auth.uid() = NULL. From here the system
-- actor is the nil UUID, and actor_id is NOT NULL so attribution can never
-- silently vanish again.
-- ===========================================================================

-- Backfill 1: Sept 19 (and any other) channel deletes whose channel still
-- resolves — recover the server_id.
--
-- Schema fix first: actor_id FK (ON DELETE SET NULL) silently wiped
-- attribution whenever a user was deleted, and server_id FK (ON DELETE
-- CASCADE) destroyed a server's whole audit history with it. Audit history
-- must survive both, so the actor FK goes away and server deletes null out.
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log drop constraint if exists audit_log_server_id_fkey;
alter table public.audit_log
  add constraint audit_log_server_id_fkey
  foreign key (server_id) references public.servers (id) on delete set null;

update public.audit_log a
set server_id = c.server_id
from public.channels c
where a.action = 'channel.message.delete'
  and a.server_id is null
  and (a.details->>'channel_id')::uuid = c.id;

-- Backfill 2: every remaining NULL actor (automated/service-role writes,
-- including the Sept 19 incident cleanup) becomes the system actor.
update public.audit_log
set actor_id = '00000000-0000-0000-0000-000000000000'
where actor_id is null;

-- Harden the writers: nil-UUID fallback inside both functions, then lock it.
create or replace function public.write_audit_log(
  p_server_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (server_id, actor_id, action, target_type, target_id, details)
  values (
    p_server_id,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    p_action, p_target_type, p_target_id, p_details
  );
end;
$$;

create or replace function public.audit_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_action text;
  v_details jsonb;
  v_system boolean := auth.uid() is null;
begin
  if tg_table_name = 'messages' then
    v_action := 'channel.message.delete';
    select server_id into v_server_id from public.channels where id = old.channel_id;
    v_details := jsonb_build_object(
      'channel_id', old.channel_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  elsif tg_table_name = 'dm_messages' then
    v_action := 'dm.message.delete';
    v_details := jsonb_build_object(
      'thread_id', old.thread_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  elsif tg_table_name = 'group_messages' then
    v_action := 'group.message.delete';
    v_details := jsonb_build_object(
      'group_id', old.group_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  end if;

  if v_system then
    v_details := v_details || '{"automated":true}'::jsonb;
  end if;

  insert into public.audit_log (server_id, actor_id, action, target_type, target_id, details)
  values (
    v_server_id,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    v_action, tg_table_name, old.id::text, v_details
  );

  return old;
end;
$$;

alter table public.audit_log alter column actor_id set not null;

-- ===========================================================================
-- Patch 3: audit the discovery join path (was invisible since it shipped).
-- ===========================================================================

create or replace function public.join_server_by_id(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.servers where id = p_server_id and discoverable = true
  ) then
    raise exception 'Server is not discoverable';
  end if;
  if exists (
    select 1 from public.server_members where server_id = p_server_id and user_id = auth.uid()
  ) then
    raise exception 'Already a member';
  end if;
  insert into public.server_members (server_id, user_id, role)
    values (p_server_id, auth.uid(), 'member');

  perform public.write_audit_log(
    p_server_id,
    'server.join',
    'user',
    auth.uid()::text,
    jsonb_build_object('via', 'discovery')
  );
end;
$$;

-- ===========================================================================
-- Patch 5: platform_rate_limits hygiene — 7-day TTL, swept opportunistically
-- inside the limiter itself (no pg_cron dependency).
-- ===========================================================================

create index if not exists platform_rate_limits_window_idx
  on public.platform_rate_limits (window_start);

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
  -- Opportunistic sweep: stale windows are dead weight (83+ stale rows seen
  -- in prod). Runs inside the same write, indexed, negligible cost.
  delete from public.platform_rate_limits
  where window_start < now() - interval '7 days';

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

-- ===========================================================================
-- Patch 6 (DB half): auth-gate event log. login-check writes one row per
-- gate decision (service role); auth_gate_stats() gives ops the failed-login
-- digest auth.audit_log_entries can't provide to this role.
-- ===========================================================================

create table if not exists public.auth_gate_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login_allowed','login_rate_limited','login_vpn_blocked','login_banned','signup_rate_limited','signup_vpn_blocked')),
  ip_hash text,
  email_hash text,
  created_at timestamptz not null default now()
);

create index if not exists auth_gate_events_created_idx
  on public.auth_gate_events (created_at desc);
create index if not exists auth_gate_events_kind_created_idx
  on public.auth_gate_events (kind, created_at desc);

alter table public.auth_gate_events enable row level security;

drop policy if exists "service_role all auth_gate_events" on public.auth_gate_events;
create policy "service_role all auth_gate_events"
  on public.auth_gate_events for all to service_role using (true) with check (true);

-- Retires rows older than 30 days on each stats call (cheap, indexed).
create or replace function public.auth_gate_stats(p_hours integer default 24)
returns table (kind text, n bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.auth_gate_events
  where created_at < now() - interval '30 days';

  return query
  select e.kind, count(*)::bigint
  from public.auth_gate_events e
  where e.created_at > now() - make_interval(hours => greatest(p_hours, 1))
  group by e.kind
  order by count(*) desc;
end;
$$;

revoke all on function public.auth_gate_stats(integer) from anon, authenticated, public;
grant execute on function public.auth_gate_stats(integer) to service_role;
