-- ---------------------------------------------------------------------------
-- 0163: role-hierarchy enforcement and instant membership changes
--
-- Moderation already checked a permission bit, but not where the actor sat in
-- the role stack. A moderator with Kick could therefore kick the owner's right
-- hand, and a role manager could hand out roles above their own. This migration
-- adds one rank function and applies it to kick, ban, timeout and role
-- assignment. Owners remain absolute and cannot be actioned.
--
-- It also mirrors membership deletes/inserts and new DMs onto a private
-- per-user Broadcast topic, so a removed member's rail updates immediately
-- instead of waiting for the next full refresh, and a moderation notice from
-- @disband reaches the inbox without the CDC poll delay.
-- ---------------------------------------------------------------------------

-- The highest role position a member holds. The owner outranks every role.
-- Members with only @everyone sit at 0.
create or replace function public.server_member_top_role_position(
  p_server_id uuid,
  p_user_id uuid
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_server_id is null or p_user_id is null then 0
    when exists (
      select 1 from public.servers
      where id = p_server_id and owner_id = p_user_id
    ) then 2147483647
    else coalesce((
      select max(r.position)::int
      from public.member_roles mr
      join public.server_roles r on r.id = mr.role_id
      where mr.server_id = p_server_id
        and mr.user_id = p_user_id
        and r.server_id = p_server_id
    ), 0)
  end;
$$;

revoke all on function public.server_member_top_role_position(uuid, uuid) from public;
grant execute on function public.server_member_top_role_position(uuid, uuid) to authenticated;

-- True only when the actor is strictly above the target. Equal roles cannot
-- action each other, matching Discord's hierarchy.
create or replace function public.member_outranks(
  p_server_id uuid,
  p_actor_id uuid,
  p_target_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.server_member_top_role_position(p_server_id, p_actor_id)
       > public.server_member_top_role_position(p_server_id, p_target_id);
$$;

revoke all on function public.member_outranks(uuid, uuid, uuid) from public;
grant execute on function public.member_outranks(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Kick / ban / timeout
-- ---------------------------------------------------------------------------

create or replace function public.kick_server_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.member_has_server_permission(p_server_id, v_uid, 'kick') then
    raise exception 'Insufficient permissions';
  end if;
  if p_user_id = v_uid then raise exception 'You cannot kick yourself'; end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot kick the server owner';
  end if;
  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id
  ) then
    raise exception 'Target is not a member of this server';
  end if;
  if not public.member_outranks(p_server_id, v_uid, p_user_id) then
    raise exception 'You can only act on members with a lower role than yours.' using errcode = '42501';
  end if;

  select coalesce(display_name, username, p_user_id::text) into v_name
  from public.profiles where id = p_user_id;

  perform public.write_audit_log(
    p_server_id,
    'member.kick',
    'user',
    p_user_id::text,
    jsonb_build_object('name', v_name)
  );

  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

create or replace function public.ban_server_member(p_server_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.member_has_server_permission(p_server_id, v_uid, 'ban') then
    raise exception 'Insufficient permissions';
  end if;
  if p_user_id = v_uid then raise exception 'You cannot ban yourself'; end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot ban the server owner';
  end if;
  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id
  ) then
    raise exception 'Target is not a member of this server';
  end if;
  if not public.member_outranks(p_server_id, v_uid, p_user_id) then
    raise exception 'You can only act on members with a lower role than yours.' using errcode = '42501';
  end if;

  select coalesce(display_name, username, p_user_id::text) into v_name
  from public.profiles where id = p_user_id;

  perform public.write_audit_log(
    p_server_id,
    'member.ban',
    'user',
    p_user_id::text,
    jsonb_build_object('name', v_name, 'reason', p_reason)
  );

  delete from public.messages m
  using public.channels c
  where m.channel_id = c.id
    and c.server_id = p_server_id
    and m.author_id = p_user_id;

  insert into public.server_bans (server_id, user_id, banned_by, reason)
  values (p_server_id, p_user_id, v_uid, p_reason)
  on conflict (server_id, user_id) do update
    set banned_by = excluded.banned_by,
        reason = excluded.reason,
        created_at = now();

  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

create or replace function public.timeout_server_member(
  p_server_id uuid, p_user_id uuid, p_seconds integer, p_reason text default ''
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.member_has_server_permission(p_server_id, v_uid, 'timeout_members') then
    raise exception 'Missing timeout_members permission';
  end if;
  if p_user_id = v_uid then raise exception 'You cannot time yourself out'; end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'The server owner cannot be timed out';
  end if;
  if not exists (select 1 from public.server_members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Target is not a member of this server';
  end if;
  if not public.member_outranks(p_server_id, v_uid, p_user_id) then
    raise exception 'You can only act on members with a lower role than yours.' using errcode = '42501';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 2419200 then
    raise exception 'Timeout must be between 1 second and 28 days';
  end if;
  delete from public.server_timeouts where server_id = p_server_id and expires_at <= now();
  v_expires := now() + make_interval(secs => p_seconds);
  insert into public.server_timeouts (server_id, user_id, expires_at, reason, created_by)
  values (p_server_id, p_user_id, v_expires, coalesce(left(p_reason, 500), ''), v_uid)
  on conflict (server_id, user_id)
  do update set expires_at = excluded.expires_at, reason = excluded.reason,
    created_by = excluded.created_by, created_at = now();
  perform public.write_audit_log(p_server_id, 'member.timeout', 'user', p_user_id::text,
    jsonb_build_object('seconds', p_seconds, 'reason', coalesce(left(p_reason, 500), '')));
  return v_expires;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role assignment
-- ---------------------------------------------------------------------------

create or replace function public.set_member_roles(
  p_server_id uuid,
  p_user_id uuid,
  p_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role uuid;
  v_actor_top integer;
  v_role_position integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_server_owner(p_server_id)
    or public.is_server_admin(p_server_id)
    or (
      public.member_has_server_permission(p_server_id, v_uid, 'manage_roles')
      and public.member_has_server_permission(p_server_id, v_uid, 'manage_server')
    )
  ) then
    raise exception 'You do not have permission to manage roles.';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id
  ) then
    raise exception 'That user is not a member of this server.';
  end if;

  if exists (
    select 1 from public.servers where id = p_server_id and owner_id = p_user_id
  ) then
    raise exception 'The server owner cannot be assigned roles.';
  end if;

  if not public.is_server_owner(p_server_id) then
    if not public.member_outranks(p_server_id, v_uid, p_user_id) then
      raise exception 'You can only manage roles for members below your highest role.' using errcode = '42501';
    end if;
    v_actor_top := public.server_member_top_role_position(p_server_id, v_uid);
  end if;

  if p_role_ids is not null then
    foreach v_role in array p_role_ids loop
      select r.position into v_role_position
      from public.server_roles r
      where r.id = v_role and r.server_id = p_server_id;

      if v_role_position is null then
        raise exception 'Invalid role for this server.';
      end if;

      if not public.is_server_owner(p_server_id)
        and not exists (
          select 1 from public.server_roles
          where id = v_role and server_id = p_server_id and is_default
        )
        and v_role_position >= v_actor_top
      then
        raise exception 'You cannot assign a role equal to or higher than your own.' using errcode = '42501';
      end if;
    end loop;
  end if;

  delete from public.member_roles
  where server_id = p_server_id and user_id = p_user_id;

  if p_role_ids is not null then
    foreach v_role in array p_role_ids loop
      if not exists (
        select 1 from public.server_roles
        where id = v_role and is_default
      ) then
        insert into public.member_roles (server_id, user_id, role_id)
        values (p_server_id, p_user_id, v_role)
        on conflict (server_id, user_id, role_id) do nothing;
      end if;
    end loop;
  end if;

  update public.server_members sm
  set role_id = (
    select mr.role_id
    from public.member_roles mr
    join public.server_roles r on r.id = mr.role_id
    where mr.server_id = p_server_id and mr.user_id = p_user_id
    order by r.position desc
    limit 1
  )
  where sm.server_id = p_server_id and sm.user_id = p_user_id;
end;
$$;

-- Defense in depth: direct member_roles writes are still permitted by the
-- insert policy for role managers, so the trigger applies the same rank rule
-- even when the RPC is bypassed. Self-assignable roles are the exception:
-- set_self_member_roles intentionally lets a member manage only those.
create or replace function public.enforce_member_role_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_server_id uuid;
  v_target_id uuid;
  v_role_id uuid;
  v_actor_top integer;
  v_target_top integer;
  v_role_position integer;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_server_id := old.server_id;
    v_target_id := old.user_id;
    v_role_id := old.role_id;
  else
    v_server_id := new.server_id;
    v_target_id := new.user_id;
    v_role_id := new.role_id;
  end if;

  if exists (
    select 1 from public.servers where id = v_server_id and owner_id = v_uid
  ) then
    return coalesce(new, old);
  end if;

  -- A removal is not an escalation when it is your own role, or when it is a
  -- cascade from a membership or role that was already deleted (leaving or
  -- being removed from a space, deleting your account, deleting a role):
  -- those paths carry their own permission checks. Without this, anyone
  -- holding a role could not leave a space or delete their account, because
  -- nobody outranks themselves.
  if tg_op = 'DELETE' and (
    v_target_id = v_uid
    or not exists (
      select 1 from public.server_members
      where server_id = v_server_id and user_id = v_target_id
    )
    or not exists (select 1 from public.server_roles where id = v_role_id)
  ) then
    return old;
  end if;

  if v_target_id = v_uid and exists (
    select 1 from public.server_roles
    where id = v_role_id
      and server_id = v_server_id
      and self_assignable
      and not is_default
  ) then
    return coalesce(new, old);
  end if;

  v_actor_top := public.server_member_top_role_position(v_server_id, v_uid);
  v_target_top := public.server_member_top_role_position(v_server_id, v_target_id);
  if v_target_top >= v_actor_top then
    raise exception 'You can only manage roles for members below your highest role.' using errcode = '42501';
  end if;

  select r.position into v_role_position
  from public.server_roles r
  where r.id = v_role_id and r.server_id = v_server_id;

  if v_role_position is null or v_role_position >= v_actor_top then
    raise exception 'You cannot assign a role equal to or higher than your own.' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists member_roles_hierarchy_guard on public.member_roles;
create trigger member_roles_hierarchy_guard
before insert or update or delete on public.member_roles
for each row execute function public.enforce_member_role_hierarchy();

-- ---------------------------------------------------------------------------
-- Instant per-user events
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_membership_event()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform realtime.send(
        jsonb_build_object('server_id', old.server_id),
        'MEMBERSHIP_REMOVE',
        'user-events:' || old.user_id::text,
        true
      );
      return old;
    end if;

    perform realtime.send(
      jsonb_build_object('server_id', new.server_id),
      'MEMBERSHIP_ADD',
      'user-events:' || new.user_id::text,
      true
    );
  exception when others then
    -- Realtime must never roll back a membership change. The next refresh
    -- still reconciles the rail.
    null;
  end;
  return coalesce(new, old);
end;
$$;

drop trigger if exists broadcast_membership_event on public.server_members;
create trigger broadcast_membership_event
after insert or delete on public.server_members
for each row execute function public.broadcast_membership_event();

create or replace function public.broadcast_dm_inbox()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_author jsonb;
begin
  begin
    select d.user_a, d.user_b into v_user_a, v_user_b
    from public.dm_threads d
    where d.id = new.thread_id;

    if v_user_a is null then
      return new;
    end if;

    if new.author_id is not null then
      select to_jsonb(p) into v_author
      from public.profiles p
      where p.id = new.author_id;
    end if;

    perform realtime.send(
      jsonb_build_object('record', to_jsonb(new), 'author', v_author),
      'DM',
      'user-events:' || v_user_a::text,
      true
    );

    if v_user_b is not null and v_user_b <> v_user_a then
      perform realtime.send(
        jsonb_build_object('record', to_jsonb(new), 'author', v_author),
        'DM',
        'user-events:' || v_user_b::text,
        true
      );
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists broadcast_dm_inbox on public.dm_messages;
create trigger broadcast_dm_inbox
after insert on public.dm_messages
for each row execute function public.broadcast_dm_inbox();

revoke all on function public.enforce_member_role_hierarchy() from public;
revoke all on function public.broadcast_membership_event() from public;
revoke all on function public.broadcast_dm_inbox() from public;

drop policy if exists user_events_broadcast_read on realtime.messages;
create policy user_events_broadcast_read
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and public.auth_aal_allows_access()
  and realtime.topic() = 'user-events:' || (select auth.uid())::text
);
