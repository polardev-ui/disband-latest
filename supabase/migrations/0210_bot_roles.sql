-- 0210: bots can manage roles, role channel permissions, and hear about members.
--
-- A new scope, roles.manage, lets a bot (with a role that has Manage Roles):
--   * list, create, edit, reorder and delete roles;
--   * add and remove members' roles;
-- and with Manage Channels (and channels.manage or roles.manage) set which
-- roles can view, post, react and attach in a channel. Every bot can ask
-- what it is allowed to do in a space.
--
-- The role hierarchy applies as it does to people: a bot only touches roles
-- below its own highest role, only manages members below it, never the
-- owner, and can only switch on permissions it has itself.
--
-- Bots with members.read also get memberJoin, memberLeave and memberUpdate
-- (roles changed) events through the gateway.

create or replace function public.is_valid_bot_scopes(p_scopes text[])
returns boolean
language plpgsql
immutable
as $function$
declare s text;
begin
  if p_scopes is null then return false; end if;
  foreach s in array p_scopes loop
    if s not in ('messages.read', 'messages.write', 'messages.delete', 'messages.react',
                 'members.read', 'members.kick', 'members.ban', 'members.timeout',
                 'channels.read', 'channels.manage', 'webhooks.manage', 'roles.manage') then
      return false;
    end if;
  end loop;
  return true;
end;
$function$;

-- The bot's user, once it is live, in the space and granted one of p_scopes.
-- p_permission, when given, is a role permission it must also hold.
create or replace function public.bot_actor(p_bot_id uuid, p_server_id uuid, p_scopes text[], p_permission text default null)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_bot public.bots%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted';
  end if;
  if not exists (
    select 1 from public.server_members where server_id = p_server_id and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;
  if p_scopes is not null and not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and scopes && p_scopes
  ) then
    raise exception 'This bot does not have % in that server', array_to_string(p_scopes, ' or ');
  end if;
  if p_permission is not null
     and not public.bot_has_server_permission(p_server_id, v_bot.user_id, p_permission) then
    raise exception 'This bot needs the % role permission', p_permission;
  end if;
  return v_bot.user_id;
end;
$function$;

-- Role permissions a bot may switch on, and only when it has them itself.
create or replace function public.bot_checked_role_permissions(p_server_id uuid, p_bot_user uuid, p_permissions jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_keys constant text[] := array[
    'add_reactions', 'attach_files', 'ban', 'create_invites', 'kick', 'manage_channels',
    'manage_emojis', 'manage_messages', 'manage_roles', 'manage_server', 'manage_webhooks',
    'mention_everyone', 'pin_messages', 'send_messages', 'timeout_members', 'view_audit_log'];
  v_out jsonb := '{}'::jsonb;
  k text;
  v jsonb;
begin
  if p_permissions is null then
    return null;
  end if;
  if jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Invalid permissions: send an object of permission names to true or false';
  end if;
  for k, v in select * from jsonb_each(p_permissions) loop
    if not (k = any (v_keys)) then
      raise exception 'Invalid permission: %', k;
    end if;
    if jsonb_typeof(v) <> 'boolean' then
      raise exception 'Invalid permission value for %', k;
    end if;
    if v = 'true'::jsonb and not public.bot_has_server_permission(p_server_id, p_bot_user, k) then
      raise exception 'This bot does not have % itself, so it cannot give it', k;
    end if;
    v_out := v_out || jsonb_build_object(k, v);
  end loop;
  return v_out;
end;
$function$;

create or replace function public.bot_role_to_json(r public.server_roles, p_bot_top integer)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'color', r.color,
    'position', r.position,
    'permissions', r.permissions,
    'is_default', r.is_default,
    'self_assignable', r.self_assignable,
    'manageable', not r.is_default and r.position < p_bot_top
  );
$function$;

-- What this bot may do in a space: its permissions, roles, scopes and rank.
create or replace function public.bot_get_permissions(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_keys constant text[] := array[
    'add_reactions', 'attach_files', 'ban', 'create_invites', 'kick', 'manage_channels',
    'manage_emojis', 'manage_messages', 'manage_roles', 'manage_server', 'manage_webhooks',
    'mention_everyone', 'pin_messages', 'send_messages', 'timeout_members', 'view_audit_log'];
begin
  v_user := public.bot_actor(p_bot_id, p_server_id, null);
  return jsonb_build_object(
    'server_id', p_server_id,
    'user_id', v_user,
    'scopes', coalesce((select to_jsonb(scopes) from public.bot_grants where bot_id = p_bot_id and server_id = p_server_id), '[]'::jsonb),
    'permissions', (select jsonb_object_agg(k, public.bot_has_server_permission(p_server_id, v_user, k)) from unnest(v_keys) k),
    'highest_role_position', public.server_member_top_role_position(p_server_id, v_user),
    'roles', coalesce((select jsonb_agg(mr.role_id) from public.member_roles mr where mr.server_id = p_server_id and mr.user_id = v_user), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.bot_list_roles(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_top integer;
begin
  v_user := public.bot_actor(p_bot_id, p_server_id, array['roles.manage', 'members.read']);
  v_top := public.server_member_top_role_position(p_server_id, v_user);
  return coalesce((
    select jsonb_agg(public.bot_role_to_json(r, v_top) order by r.position desc, r.created_at)
    from public.server_roles r where r.server_id = p_server_id
  ), '[]'::jsonb);
end;
$function$;

-- Moves a role to p_position (1 = just above @everyone), like move_role.
create or replace function public.bot_place_role(p_server_id uuid, p_role_id uuid, p_position integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
  v_len int;
  v_idx int;
  i int;
begin
  select array_agg(id order by position, created_at) into v_ids
  from public.server_roles where server_id = p_server_id and not is_default;
  v_ids := array_remove(coalesce(v_ids, '{}'), p_role_id);
  v_len := coalesce(array_length(v_ids, 1), 0);
  v_idx := greatest(1, least(v_len + 1, coalesce(p_position, 1)));
  v_ids := v_ids[1:v_idx - 1] || p_role_id || v_ids[v_idx:v_len];
  for i in 1 .. array_length(v_ids, 1) loop
    update public.server_roles set position = i where id = v_ids[i] and position is distinct from i;
  end loop;
end;
$function$;

create or replace function public.bot_create_role(
  p_bot_id uuid, p_server_id uuid, p_name text,
  p_color text default null, p_permissions jsonb default null,
  p_self_assignable boolean default false, p_position integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_top integer;
  v_perms jsonb;
  v_role public.server_roles%rowtype;
begin
  v_user := public.bot_actor(p_bot_id, p_server_id, array['roles.manage'], 'manage_roles');
  v_top := public.server_member_top_role_position(p_server_id, v_user);

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Role name is required';
  end if;
  if length(btrim(p_name)) > 100 then
    raise exception 'Role name is too long (max 100 characters)';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid colour: use a hex colour like #5865f2';
  end if;
  if (select count(*) from public.server_roles where server_id = p_server_id) >= 250 then
    raise exception 'This space has too many roles (max 250)';
  end if;
  if p_position is not null and p_position >= v_top then
    raise exception 'A role must sit below this bot''s highest role';
  end if;

  v_perms := (
    '{"ban": false, "kick": false, "attach_files": false, "manage_roles": false, "pin_messages": false, "add_reactions": false, "manage_emojis": false, "manage_server": false, "send_messages": false, "create_invites": false, "view_audit_log": false, "manage_channels": false, "manage_messages": false, "timeout_members": false, "mention_everyone": false}'::jsonb
  ) || coalesce(public.bot_checked_role_permissions(p_server_id, v_user, p_permissions), '{}'::jsonb);

  insert into public.server_roles (server_id, name, color, permissions, position, self_assignable)
  values (p_server_id, btrim(p_name), coalesce(p_color, '#949ba4'), v_perms, 0, coalesce(p_self_assignable, false))
  returning * into v_role;

  perform public.bot_place_role(p_server_id, v_role.id, coalesce(p_position, 1));
  select * into v_role from public.server_roles where id = v_role.id;

  perform public.write_audit_log(p_server_id, 'role.create', 'role', v_role.id::text,
    jsonb_build_object('bot', p_bot_id, 'name', v_role.name));
  return public.bot_role_to_json(v_role, public.server_member_top_role_position(p_server_id, v_user));
end;
$function$;

create or replace function public.bot_update_role(
  p_bot_id uuid, p_role_id uuid, p_name text default null,
  p_color text default null, p_permissions jsonb default null,
  p_self_assignable boolean default null, p_position integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.server_roles%rowtype;
  v_user uuid;
  v_top integer;
begin
  select * into v_role from public.server_roles where id = p_role_id;
  if not found then
    raise exception 'Role not found';
  end if;
  v_user := public.bot_actor(p_bot_id, v_role.server_id, array['roles.manage'], 'manage_roles');
  v_top := public.server_member_top_role_position(v_role.server_id, v_user);

  if v_role.is_default then
    raise exception 'This bot cannot edit the @everyone role; use channel permissions instead';
  end if;
  if v_role.position >= v_top then
    raise exception 'This role is not below this bot''s highest role';
  end if;
  if p_name is not null and (length(btrim(p_name)) = 0 or length(btrim(p_name)) > 100) then
    raise exception 'Invalid role name (1 to 100 characters)';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid colour: use a hex colour like #5865f2';
  end if;
  if p_position is not null and p_position >= v_top then
    raise exception 'A role must sit below this bot''s highest role';
  end if;

  update public.server_roles set
    name = coalesce(btrim(p_name), name),
    color = coalesce(p_color, color),
    permissions = permissions || coalesce(public.bot_checked_role_permissions(v_role.server_id, v_user, p_permissions), '{}'::jsonb),
    self_assignable = coalesce(p_self_assignable, self_assignable)
  where id = p_role_id;

  if p_position is not null then
    perform public.bot_place_role(v_role.server_id, p_role_id, p_position);
    if (select position from public.server_roles where id = p_role_id) >= public.server_member_top_role_position(v_role.server_id, v_user) then
      raise exception 'A role must sit below this bot''s highest role';
    end if;
  end if;

  select * into v_role from public.server_roles where id = p_role_id;
  perform public.write_audit_log(v_role.server_id, 'role.update', 'role', p_role_id::text,
    jsonb_build_object('bot', p_bot_id, 'name', v_role.name));
  return public.bot_role_to_json(v_role, public.server_member_top_role_position(v_role.server_id, v_user));
end;
$function$;

create or replace function public.bot_delete_role(p_bot_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.server_roles%rowtype;
  v_user uuid;
begin
  select * into v_role from public.server_roles where id = p_role_id;
  if not found then
    raise exception 'Role not found';
  end if;
  v_user := public.bot_actor(p_bot_id, v_role.server_id, array['roles.manage'], 'manage_roles');
  if v_role.is_default then
    raise exception 'This bot cannot delete the @everyone role';
  end if;
  if v_role.position >= public.server_member_top_role_position(v_role.server_id, v_user) then
    raise exception 'This role is not below this bot''s highest role';
  end if;
  delete from public.server_roles where id = p_role_id;
  perform public.write_audit_log(v_role.server_id, 'role.delete', 'role', p_role_id::text,
    jsonb_build_object('bot', p_bot_id, 'name', v_role.name));
end;
$function$;

-- Shared checks for giving or taking a member's role.
create or replace function public.bot_member_role_guard(p_bot_id uuid, p_server_id uuid, p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_top integer;
  v_role public.server_roles%rowtype;
begin
  v_user := public.bot_actor(p_bot_id, p_server_id, array['roles.manage'], 'manage_roles');
  v_top := public.server_member_top_role_position(p_server_id, v_user);

  select * into v_role from public.server_roles where id = p_role_id and server_id = p_server_id;
  if not found then
    raise exception 'Role not found in that server';
  end if;
  if v_role.is_default then
    raise exception 'Everyone has the @everyone role; it cannot be given or taken';
  end if;
  if v_role.position >= v_top then
    raise exception 'This role is not below this bot''s highest role';
  end if;
  if not exists (select 1 from public.server_members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Member not found in that server';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'This bot cannot change the space owner''s roles';
  end if;
  if public.server_member_top_role_position(p_server_id, p_user_id) >= v_top then
    raise exception 'This member is not below this bot''s highest role';
  end if;
end;
$function$;

create or replace function public.bot_sync_member_top_role(p_server_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
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
$function$;

create or replace function public.bot_add_member_role(p_bot_id uuid, p_server_id uuid, p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.bot_member_role_guard(p_bot_id, p_server_id, p_user_id, p_role_id);
  insert into public.member_roles (server_id, user_id, role_id)
  values (p_server_id, p_user_id, p_role_id)
  on conflict (server_id, user_id, role_id) do nothing;
  if found then
    perform public.bot_sync_member_top_role(p_server_id, p_user_id);
    perform public.write_audit_log(p_server_id, 'member.role_add', 'user', p_user_id::text,
      jsonb_build_object('bot', p_bot_id, 'role', p_role_id));
  end if;
end;
$function$;

create or replace function public.bot_remove_member_role(p_bot_id uuid, p_server_id uuid, p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.bot_member_role_guard(p_bot_id, p_server_id, p_user_id, p_role_id);
  delete from public.member_roles
  where server_id = p_server_id and user_id = p_user_id and role_id = p_role_id;
  if found then
    perform public.bot_sync_member_top_role(p_server_id, p_user_id);
    perform public.write_audit_log(p_server_id, 'member.role_remove', 'user', p_user_id::text,
      jsonb_build_object('bot', p_bot_id, 'role', p_role_id));
  end if;
end;
$function$;

-- Channel overrides: which roles can view, post, react and attach.
create or replace function public.bot_list_channel_permissions(p_bot_id uuid, p_channel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_server uuid;
begin
  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then
    raise exception 'Channel not found';
  end if;
  perform public.bot_actor(p_bot_id, v_server, array['channels.read', 'channels.manage', 'roles.manage']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'role_id', cp.role_id,
      'can_view', cp.can_view,
      'can_post', cp.can_post,
      'can_react', cp.can_react,
      'can_attach', cp.can_attach
    ) order by r.position desc)
    from public.channel_permissions cp
    join public.server_roles r on r.id = cp.role_id
    where cp.channel_id = p_channel_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.bot_set_channel_permission(
  p_bot_id uuid, p_channel_id uuid, p_role_id uuid,
  p_can_view boolean default null, p_can_post boolean default null,
  p_can_react boolean default null, p_can_attach boolean default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_server uuid;
  v_user uuid;
  v_role public.server_roles%rowtype;
begin
  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then
    raise exception 'Channel not found';
  end if;
  v_user := public.bot_actor(p_bot_id, v_server, array['channels.manage', 'roles.manage'], 'manage_channels');

  select * into v_role from public.server_roles where id = p_role_id and server_id = v_server;
  if not found then
    raise exception 'Role not found in that server';
  end if;
  -- @everyone is fair game (that is how a channel is hidden until someone
  -- is verified); any other role must sit below the bot.
  if not v_role.is_default and v_role.position >= public.server_member_top_role_position(v_server, v_user) then
    raise exception 'This role is not below this bot''s highest role';
  end if;

  if p_can_view is null and p_can_post is null and p_can_react is null and p_can_attach is null then
    delete from public.channel_permissions where channel_id = p_channel_id and role_id = p_role_id;
  else
    insert into public.channel_permissions (channel_id, role_id, can_view, can_post, can_react, can_attach)
    values (p_channel_id, p_role_id, p_can_view, p_can_post, p_can_react, p_can_attach)
    on conflict (channel_id, role_id) do update set
      can_view = excluded.can_view,
      can_post = excluded.can_post,
      can_react = excluded.can_react,
      can_attach = excluded.can_attach;
  end if;

  perform public.write_audit_log(v_server, 'channel.permissions', 'channel', p_channel_id::text,
    jsonb_build_object('bot', p_bot_id, 'role', p_role_id, 'can_view', p_can_view, 'can_post', p_can_post,
                       'can_react', p_can_react, 'can_attach', p_can_attach));
end;
$function$;

-- Members now carry their role IDs.
create or replace function public.bot_list_members(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bot public.bots%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'members.read' = any (scopes)
  ) then
    raise exception 'This bot does not have members.read in that server';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'is_bot', p.is_bot,
        'status', p.status,
        'role', sm.role,
        'roles', coalesce((
          select jsonb_agg(mr.role_id) from public.member_roles mr
          where mr.server_id = p_server_id and mr.user_id = sm.user_id
        ), '[]'::jsonb),
        'joined_at', sm.joined_at
      ) order by p.display_name, p.username
    )
    from public.server_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.server_id = p_server_id
  ), '[]'::jsonb);
end;
$function$;

-- ── Member events ────────────────────────────────────────────────────────

-- Queues an event for every live bot in the space granted members.read.
create or replace function public.bot_queue_member_event(p_server_id uuid, p_type text, p_payload jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.bot_events (bot_id, type, payload)
  select g.bot_id, p_type, p_payload
  from public.bot_grants g
  join public.bots b on b.id = g.bot_id and b.revoked_at is null
  join public.server_members sm on sm.server_id = g.server_id and sm.user_id = b.user_id
  where g.server_id = p_server_id and 'members.read' = any (g.scopes);
$function$;

create or replace function public.bot_events_member_dispatch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.bot_queue_member_event(new.server_id, 'memberJoin', jsonb_build_object(
        'server_id', new.server_id,
        'joined_at', new.joined_at,
        'user', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                           'avatar_url', p.avatar_url, 'is_bot', p.is_bot)
                 from public.profiles p where p.id = new.user_id)));
    else
      perform public.bot_queue_member_event(old.server_id, 'memberLeave', jsonb_build_object(
        'server_id', old.server_id,
        'user_id', old.user_id));
    end if;
  exception when others then
    null;  -- an event never blocks someone joining or leaving
  end;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists bot_events_member_join on public.server_members;
create trigger bot_events_member_join
  after insert on public.server_members
  for each row execute function public.bot_events_member_dispatch();
drop trigger if exists bot_events_member_leave on public.server_members;
create trigger bot_events_member_leave
  after delete on public.server_members
  for each row execute function public.bot_events_member_dispatch();

-- Role changes are sent at commit, once per member per transaction, with the
-- member's roles as they ended up: replacing someone's roles (delete all,
-- insert the new set) is one memberUpdate, not a burst of adds and removes.
create or replace function public.bot_events_member_roles_dispatch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_server uuid := coalesce(new.server_id, old.server_id);
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_sent text := 'disband.bot_member_update_' || md5(v_server::text || v_user::text);
begin
  begin
    if not exists (select 1 from public.server_members where server_id = v_server and user_id = v_user) then
      return null;  -- they left; memberLeave covers it
    end if;
    if coalesce(current_setting(v_sent, true), '') = 'on' then
      return null;  -- already sent for this member in this transaction
    end if;
    perform set_config(v_sent, 'on', true);
    perform public.bot_queue_member_event(v_server, 'memberUpdate', jsonb_build_object(
      'server_id', v_server,
      'user_id', v_user,
      'roles', coalesce((select jsonb_agg(mr.role_id) from public.member_roles mr
                         where mr.server_id = v_server and mr.user_id = v_user), '[]'::jsonb)));
  exception when others then
    null;
  end;
  return null;
end;
$function$;

drop trigger if exists bot_events_member_roles on public.member_roles;
create constraint trigger bot_events_member_roles
  after insert or delete on public.member_roles
  deferrable initially deferred
  for each row execute function public.bot_events_member_roles_dispatch();

-- The gateway hands member events to bots granted members.read; they carry a
-- server_id, not a channel_id.
create or replace function public.take_bot_events(p_bot_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.bots%rowtype;
  e record;
  result jsonb := '[]'::jsonb;
  channel uuid;
  server uuid;
begin
  select * into b from public.bots where id = p_bot_id;
  if not found or b.revoked_at is not null or public.is_bot_platform_banned(p_bot_id) then
    raise exception 'Bot revoked or restricted';
  end if;
  for e in select * from public.bot_events where bot_id = p_bot_id and delivered_at is null
    order by id limit least(greatest(coalesce(p_limit, 50), 1), 100) for update skip locked
  loop
    update public.bot_events set delivered_at = now() where id = e.id;
    if e.type in ('memberJoin', 'memberLeave', 'memberUpdate') then
      begin
        server := (e.payload ->> 'server_id')::uuid;
      exception when invalid_text_representation then
        continue;
      end;
      if exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = server and 'members.read' = any (scopes))
         and exists (select 1 from public.server_members where server_id = server and user_id = b.user_id) then
        result := result || jsonb_build_array(jsonb_build_object('id', e.id, 'type', e.type, 'payload', e.payload));
      end if;
      continue;
    end if;
    begin
      channel := (e.payload ->> 'channel_id')::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    select server_id into server from public.channels where id = channel;
    if e.type = 'interactionCreate' then
      if exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = server)
         and exists (select 1 from public.server_members where server_id = server and user_id = b.user_id) then
        result := result || jsonb_build_array(jsonb_build_object('id', e.id, 'type', e.type, 'payload', e.payload));
      end if;
    elsif 'messages.read' = any (b.scopes) and public.channel_permission_for(b.user_id, channel, 'view')
       and exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = server and 'messages.read' = any (scopes)) then
      result := result || jsonb_build_array(jsonb_build_object('id', e.id, 'type', e.type, 'payload', e.payload));
    end if;
  end loop;
  return result;
end;
$function$;

-- Only the service role (the bot API) calls these.
revoke all on function public.bot_actor(uuid, uuid, text[], text) from public, anon, authenticated;
revoke all on function public.bot_checked_role_permissions(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.bot_get_permissions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_list_roles(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_place_role(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.bot_create_role(uuid, uuid, text, text, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function public.bot_update_role(uuid, uuid, text, text, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function public.bot_delete_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_member_role_guard(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_sync_member_top_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_add_member_role(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_remove_member_role(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_list_channel_permissions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bot_set_channel_permission(uuid, uuid, uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.bot_queue_member_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.bot_get_permissions(uuid, uuid) to service_role;
grant execute on function public.bot_list_roles(uuid, uuid) to service_role;
grant execute on function public.bot_create_role(uuid, uuid, text, text, jsonb, boolean, integer) to service_role;
grant execute on function public.bot_update_role(uuid, uuid, text, text, jsonb, boolean, integer) to service_role;
grant execute on function public.bot_delete_role(uuid, uuid) to service_role;
grant execute on function public.bot_add_member_role(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.bot_remove_member_role(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.bot_list_channel_permissions(uuid, uuid) to service_role;
grant execute on function public.bot_set_channel_permission(uuid, uuid, uuid, boolean, boolean, boolean, boolean) to service_role;
