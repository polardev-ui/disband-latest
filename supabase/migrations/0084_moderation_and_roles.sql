-- 0084_moderation_and_roles.sql
-- New permissions (timeout_members, pin_messages, view_audit_log, create_invites),
-- multi-role permission OR, server timeouts, unban, mutuals, group member removal.

-- 1) Multi-role OR: a permission held by ANY of the member's roles grants it.
create or replace function public.member_has_server_permission(
  p_server_id uuid, p_user_id uuid, p_permission text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy_role text;
  v_role_id uuid;
  v_perms jsonb;
begin
  if p_user_id is distinct from auth.uid() then
    return false;
  end if;

  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    return true;
  end if;

  select sm.role, sm.role_id into v_legacy_role, v_role_id
  from public.server_members sm
  where sm.server_id = p_server_id and sm.user_id = p_user_id;

  if not found then
    return false;
  end if;

  if v_legacy_role in ('owner', 'admin') then
    return true;
  end if;

  if v_role_id is not null then
    select sr.permissions into v_perms
    from public.server_roles sr
    where sr.id = v_role_id and sr.server_id = p_server_id;

    if coalesce((v_perms ->> p_permission)::boolean, false) then
      return true;
    end if;
  end if;

  return exists (
    select 1
    from public.member_roles mr
    join public.server_roles sr on sr.id = mr.role_id and sr.server_id = p_server_id
    where mr.server_id = p_server_id
      and mr.user_id = p_user_id
      and coalesce((sr.permissions ->> p_permission)::boolean, false)
  );
end;
$$;

-- 2) Backfill the new permission keys (default deny) on existing roles.
update public.server_roles
set permissions = permissions
  || '{"timeout_members": false, "pin_messages": false, "view_audit_log": false, "create_invites": false}'::jsonb
where not (permissions ?& array['timeout_members', 'pin_messages', 'view_audit_log', 'create_invites']);

alter table public.server_roles alter column permissions set default
  '{"kick": false, "ban": false, "manage_roles": false, "manage_server": false, "manage_channels": false, "manage_messages": false, "manage_emojis": false, "mention_everyone": false, "send_messages": false, "add_reactions": false, "attach_files": false, "timeout_members": false, "pin_messages": false, "view_audit_log": false, "create_invites": false}'::jsonb;

-- 3) Aggregate gains the new keys.
create or replace function public.my_server_permissions(p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'kick', public.member_has_server_permission(p_server_id, v_uid, 'kick'),
    'ban', public.member_has_server_permission(p_server_id, v_uid, 'ban'),
    'manage_roles', public.member_has_server_permission(p_server_id, v_uid, 'manage_roles'),
    'manage_server', public.member_has_server_permission(p_server_id, v_uid, 'manage_server'),
    'manage_channels', public.member_has_server_permission(p_server_id, v_uid, 'manage_channels'),
    'manage_messages', public.member_has_server_permission(p_server_id, v_uid, 'manage_messages'),
    'manage_emojis', public.member_has_server_permission(p_server_id, v_uid, 'manage_emojis'),
    'mention_everyone', public.member_has_server_permission(p_server_id, v_uid, 'mention_everyone'),
    'send_messages', public.member_has_server_permission(p_server_id, v_uid, 'send_messages'),
    'add_reactions', public.member_has_server_permission(p_server_id, v_uid, 'add_reactions'),
    'attach_files', public.member_has_server_permission(p_server_id, v_uid, 'attach_files'),
    'timeout_members', public.member_has_server_permission(p_server_id, v_uid, 'timeout_members'),
    'pin_messages', public.member_has_server_permission(p_server_id, v_uid, 'pin_messages'),
    'view_audit_log', public.member_has_server_permission(p_server_id, v_uid, 'view_audit_log'),
    'create_invites', public.member_has_server_permission(p_server_id, v_uid, 'create_invites')
  );
end;
$$;

-- 4) Server timeouts.
create table if not exists public.server_timeouts (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index if not exists server_timeouts_expiry_idx
  on public.server_timeouts (server_id, expires_at);

alter table public.server_timeouts enable row level security;
drop policy if exists server_timeouts_select on public.server_timeouts;
create policy server_timeouts_select on public.server_timeouts
  for select using (public.is_server_member(server_id));

create or replace function public.is_server_timed_out(p_server_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_server_id is null or p_user_id is null then false else exists (
    select 1 from public.server_timeouts
    where server_id = p_server_id and user_id = p_user_id and expires_at > now()
  ) end;
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

create or replace function public.remove_timeout(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'timeout_members') then
    raise exception 'Missing timeout_members permission';
  end if;
  delete from public.server_timeouts where server_id = p_server_id and user_id = p_user_id;
  perform public.write_audit_log(p_server_id, 'member.untimeout', 'user', p_user_id::text, '{}'::jsonb);
end;
$$;

-- 5) Unban (ban path never had one).
create or replace function public.unban_server_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'ban') then
    raise exception 'Missing ban permission';
  end if;
  delete from public.server_bans where server_id = p_server_id and user_id = p_user_id;
  perform public.write_audit_log(p_server_id, 'member.unban', 'user', p_user_id::text, '{}'::jsonb);
end;
$$;

-- 6) Timed-out members cannot post in that server's channels.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    auth.uid() = author_id
    and channel_user_can_post(channel_id)
    and ((attachment_url is null) or (exists (
      select 1 from channels c
      where c.id = messages.channel_id and channel_user_can_attach(messages.channel_id)
    )))
    and ((lower(content) !~ '@(everyone|here)') or member_has_server_permission(
      (select c.server_id from channels c where c.id = messages.channel_id),
      auth.uid(), 'mention_everyone'))
    and not is_server_timed_out(
      (select c.server_id from channels c where c.id = messages.channel_id),
      auth.uid())
  );

-- 7) Mutual servers + mutual friends (capped, caller-scoped).
create or replace function public.mutual_server_ids(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m1.server_id), '{}')
  from (
    select server_id from public.server_members
    where user_id = auth.uid() limit 200
  ) m1
  join public.server_members m2
    on m2.server_id = m1.server_id and m2.user_id = p_user_id
  limit 50;
$$;

create or replace function public.mutual_friend_ids(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as fid
    from public.friendships
    where status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid())
    limit 500
  ),
  theirs as (
    select case when requester_id = p_user_id then addressee_id else requester_id end as fid
    from public.friendships
    where status = 'accepted' and (requester_id = p_user_id or addressee_id = p_user_id)
    limit 500
  )
  select coalesce(array_agg(mine.fid), '{}')
  from mine join theirs on theirs.fid = mine.fid
  where mine.fid <> auth.uid() and mine.fid <> p_user_id
  limit 50;
$$;

-- 8) Owner can remove a member from a group chat (previously only self-leave).
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select owner_id into v_owner from public.group_chats where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if v_owner is distinct from v_uid then raise exception 'Only the group owner can remove members'; end if;
  if p_user_id = v_owner then raise exception 'The group owner cannot be removed'; end if;
  delete from public.group_call_presence where group_id = p_group_id and user_id = p_user_id;
  delete from public.group_chat_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

grant execute on function public.is_server_timed_out(uuid, uuid) to authenticated;
grant execute on function public.timeout_server_member(uuid, uuid, integer, text) to authenticated;
grant execute on function public.remove_timeout(uuid, uuid) to authenticated;
grant execute on function public.unban_server_member(uuid, uuid) to authenticated;
grant execute on function public.mutual_server_ids(uuid) to authenticated;
grant execute on function public.mutual_friend_ids(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
