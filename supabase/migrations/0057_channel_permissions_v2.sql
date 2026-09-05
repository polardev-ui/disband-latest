-- ---------------------------------------------------------------------------
-- 0057 — Channel permissions v2
--
-- Extends 0051's per-channel / per-role matrix:
--   * channel_permissions becomes tri-state (NULL = inherit role default) and
--     grows can_react / can_attach alongside can_view / can_post.
--   * server_roles.permissions gains member-action keys: send_messages,
--     add_reactions, attach_files. These act as the per-channel *default* for a
--     role whenever the role has no override row on a channel.
--   * channel_effective_permission resolves 'view' | 'post' | 'react' |
--     'attach' by OR-ing across the user's roles + @everyone.
--   * New my_channel_effects(server_id) returns every channel's effective
--     booleans for the caller (drives UI gating + client-side hiding).
--   * New move_role() (manage_roles-gated) lets role management reorder roles
--     (also controls sidebar role ordering, which is position-based).
--
-- Behavioral guarantees preserved:
--   * Owner/admin and manage_channels holders can always do everything in any
--     channel (unchanged bypass).
--   * Channels with NO override rows at all keep legacy behavior: every member
--     can view/post/react/attach (post still gated by read_only).
--   * All existing roles are backfilled with send_messages/add_reactions/
--     attach_files = true so servers never regress to a "post locked" state.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. channel_permissions: tri-state + two new action columns
-- ---------------------------------------------------------------------------
alter table public.channel_permissions
  alter column can_view drop not null,
  alter column can_post drop not null,
  add column can_react   boolean,
  add column can_attach  boolean;

-- ---------------------------------------------------------------------------
-- 2. Member-action role permission keys
-- ---------------------------------------------------------------------------
alter table public.server_roles
  alter column permissions
  set default '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false,"manage_channels":false,"manage_messages":false,"manage_emojis":false,"mention_everyone":false,"send_messages":false,"add_reactions":false,"attach_files":false}'::jsonb;

-- Backfill: existing roles keep today's open behavior for member actions.
update public.server_roles
set permissions = permissions
  || '{"send_messages":true,"add_reactions":true,"attach_files":true}'::jsonb
where not (permissions ? 'send_messages');

-- Fresh servers must keep @everyone open by default too (the static column
-- default is false for member-action keys). Do it right after @everyone is
-- created rather than hardcoding the whole blob.
create or replace function public.create_server(
  p_name text,
  p_icon_url text default null,
  p_banner_url text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_invite text;
  c_text uuid;
  c_voice uuid;
  r_everyone uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.ensure_user_profile();

  v_invite := public.generate_invite_code();
  while exists (select 1 from public.servers where invite_code = v_invite) loop
    v_invite := public.generate_invite_code();
  end loop;

  insert into public.servers (name, icon_url, banner_url, description, owner_id, invite_code)
  values (p_name, p_icon_url, p_banner_url, p_description, auth.uid(), v_invite)
  returning id into v_id;

  insert into public.server_roles (server_id, name, color, position, is_default)
  values (v_id, '@everyone', '#949ba4', 0, true)
  returning id into r_everyone;

  update public.server_roles
  set permissions = permissions
    || '{"send_messages":true,"add_reactions":true,"attach_files":true}'::jsonb
  where id = r_everyone;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_id, auth.uid(), 'owner', r_everyone);

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Text Channels', 0) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Voice Channels', 1) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_text, 'welcome', 'text', 1),
    (v_id, c_voice, 'voice-1', 'voice', 0);

  perform public.write_audit_log(
    v_id,
    'server.create',
    'server',
    v_id::text,
    jsonb_build_object('name', p_name)
  );

  return v_id;
end;
$$;

grant execute on function public.create_server(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. my_server_permissions exposes the new member-action keys
-- ---------------------------------------------------------------------------
create or replace function public.my_server_permissions(p_server_id uuid)
returns jsonb
language plpgsql
security definer
stable
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
    'attach_files', public.member_has_server_permission(p_server_id, v_uid, 'attach_files')
  );
end;
$$;

grant execute on function public.my_server_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Replaced heart: channel_effective_permission (unchanged signature)
--    p_permission: 'view' | 'post' | 'react' | 'attach'
-- ---------------------------------------------------------------------------
create or replace function public.channel_effective_permission(
  p_channel_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_server_id uuid;
  v_read_only boolean := false;
  v_has_overrides boolean;
  v_role record;
  v_row public.channel_permissions%rowtype;
  v_perms jsonb;
  v_role_allowed boolean;
  v_grant boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  select c.server_id, coalesce(c.read_only, false)
    into v_server_id, v_read_only
    from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    return false; -- channel doesn't exist
  end if;

  if not public.is_server_member(v_server_id) then
    return false;
  end if;

  -- Owner / admin legacy roles bypass everything.
  if exists (
    select 1 from public.server_members m
    where m.server_id = v_server_id and m.user_id = v_uid and m.role in ('owner', 'admin')
  ) then
    return true;
  end if;

  -- manage_channels holders can do everything in any channel.
  if public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    return true;
  end if;

  -- read_only only ever blocks posting (and the bypasses above still apply).
  if p_permission = 'post' and v_read_only then
    return false;
  end if;

  select exists (select 1 from public.channel_permissions cp
                  where cp.channel_id = p_channel_id) into v_has_overrides;

  -- No override rows on this channel: keep legacy open behavior.
  if not v_has_overrides then
    return true;
  end if;

  -- Combine rows + per-role key fallbacks across assigned roles + @everyone.
  for v_role in (
    select mr.role_id
    from public.member_roles mr
    where mr.server_id = v_server_id and mr.user_id = v_uid
    union
    select sr.id
    from public.server_roles sr
    where sr.server_id = v_server_id and sr.is_default
  ) loop
    v_row := null;
    select cp.* into v_row
      from public.channel_permissions cp
      where cp.channel_id = p_channel_id and cp.role_id = v_role.role_id;

    select r.permissions into v_perms
      from public.server_roles r where r.id = v_role.role_id;
    if not found then
      v_perms := null;
    end if;

    if p_permission = 'view' then
      -- Server members can see channels by default (NULL row / no row).
      v_role_allowed := coalesce(v_row.can_view, true);
    elsif p_permission = 'post' then
      v_role_allowed := coalesce(v_row.can_post, coalesce((v_perms->>'send_messages')::boolean, false));
    elsif p_permission = 'react' then
      v_role_allowed := coalesce(v_row.can_react, coalesce((v_perms->>'add_reactions')::boolean, false));
    else -- 'attach'
      v_role_allowed := coalesce(v_row.can_attach, coalesce((v_perms->>'attach_files')::boolean, false));
    end if;

    if v_role_allowed then
      v_grant := true;
    end if;
  end loop;

  return v_grant;
end;
$$;

grant execute on function public.channel_effective_permission(uuid, text) to authenticated;

-- Thin wrappers used by RLS + clients.
create or replace function public.channel_user_can_view(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.channel_effective_permission(p_channel_id, 'view');
$$;

grant execute on function public.channel_user_can_view(uuid) to authenticated;

create or replace function public.channel_user_can_post(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.channel_effective_permission(p_channel_id, 'post');
$$;

grant execute on function public.channel_user_can_post(uuid) to authenticated;

create or replace function public.channel_user_can_react(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.channel_effective_permission(p_channel_id, 'react');
$$;

grant execute on function public.channel_user_can_react(uuid) to authenticated;

create or replace function public.channel_user_can_attach(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.channel_effective_permission(p_channel_id, 'attach');
$$;

grant execute on function public.channel_user_can_attach(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. my_channel_effects: per-channel effective booleans for the current user
-- ---------------------------------------------------------------------------
create or replace function public.my_channel_effects(p_server_id uuid)
returns table (
  channel_id  uuid,
  can_view    boolean,
  can_post    boolean,
  can_react   boolean,
  can_attach  boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then
    return;
  end if;

  if not public.is_server_member(p_server_id) then
    return;
  end if;

  for r in
    select c.id
    from public.channels c
    where c.server_id = p_server_id
    order by c.position, c.created_at
  loop
    channel_id   := r.id;
    can_view     := public.channel_user_can_view(r.id);
    can_post     := public.channel_user_can_post(r.id);
    can_react    := public.channel_user_can_react(r.id);
    can_attach   := public.channel_user_can_attach(r.id);
    return next;
  end loop;
end;
$$;

grant execute on function public.my_channel_effects(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Management RPCs (manage_channels-gated)
-- ---------------------------------------------------------------------------

-- Return-type changed (adds can_react / can_attach), so drop the old one.
drop function if exists public.get_channel_permissions(uuid);
create or replace function public.get_channel_permissions(p_channel_id uuid)
returns table (
  role_id     uuid,
  role_name   text,
  role_color  text,
  is_default  boolean,
  can_view    boolean,
  can_post    boolean,
  can_react   boolean,
  can_attach  boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_server_id uuid;
  v_uid uuid := auth.uid();
begin
  select c.server_id into v_server_id from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    return;
  end if;

  if not public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    return; -- not a manager: no data
  end if;

  return query
    select r.id, r.name, r.color, r.is_default,
           cp.can_view, cp.can_post, cp.can_react, cp.can_attach
    from public.server_roles r
    left join public.channel_permissions cp
      on cp.role_id = r.id and cp.channel_id = p_channel_id
    where r.server_id = v_server_id
    order by r.is_default, r.position, r.created_at;
end;
$$;

grant execute on function public.get_channel_permissions(uuid) to authenticated;

-- Signature changed (3 new nullable booleans), so drop the old overload.
drop function if exists public.set_channel_role_permission(uuid, uuid, boolean, boolean);
create or replace function public.set_channel_role_permission(
  p_channel_id uuid,
  p_role_id    uuid,
  p_can_view   boolean default null,
  p_can_post   boolean default null,
  p_can_react  boolean default null,
  p_can_attach boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_uid uuid := auth.uid();
begin
  select c.server_id into v_server_id from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    raise exception 'Channel not found';
  end if;

  if not public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    raise exception 'You do not have permission to manage channels';
  end if;

  if not exists (
    select 1 from public.server_roles r
    where r.id = p_role_id and r.server_id = v_server_id
  ) then
    raise exception 'Role does not belong to this server';
  end if;

  -- All values NULL → back to defaults: remove the whole override row.
  if p_can_view is null and p_can_post is null
     and p_can_react is null and p_can_attach is null then
    delete from public.channel_permissions
    where channel_id = p_channel_id and role_id = p_role_id;
    return;
  end if;

  insert into public.channel_permissions (channel_id, role_id, can_view, can_post, can_react, can_attach)
  values (p_channel_id, p_role_id, p_can_view, p_can_post, p_can_react, p_can_attach)
  on conflict (channel_id, role_id)
  do update set
    can_view   = excluded.can_view,
    can_post   = excluded.can_post,
    can_react  = excluded.can_react,
    can_attach = excluded.can_attach;
end;
$$;

grant execute on function public.set_channel_role_permission(uuid, uuid, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.remove_channel_role_permission(
  p_channel_id uuid,
  p_role_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_uid uuid := auth.uid();
begin
  select c.server_id into v_server_id from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    raise exception 'Channel not found';
  end if;

  if not public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    raise exception 'You do not have permission to manage channels';
  end if;

  delete from public.channel_permissions
  where channel_id = p_channel_id and role_id = p_role_id;
end;
$$;

grant execute on function public.remove_channel_role_permission(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. move_role: reorder roles (manage_roles-gated); @everyone stays at 0.
--    Position order drives the member-list / sidebar role ordering.
-- ---------------------------------------------------------------------------
create or replace function public.move_role(p_role_id uuid, p_new_position int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_ids uuid[];
  v_idx int;
  v_len int;
  i int;
begin
  select r.server_id into v_server_id
    from public.server_roles r where r.id = p_role_id;
  if v_server_id is null then
    raise exception 'Role not found';
  end if;

  if exists (
    select 1 from public.server_roles r
    where r.id = p_role_id and r.is_default
  ) then
    raise exception 'The default role cannot be reordered';
  end if;

  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_roles') then
    raise exception 'You do not have permission to manage roles';
  end if;

  select array_agg(id order by position, created_at) into v_ids
    from public.server_roles
    where server_id = v_server_id;

  if v_ids is null then
    return;
  end if;

  v_ids := array_remove(v_ids, p_role_id);
  v_len := coalesce(array_length(v_ids, 1), 0);

  if v_len = 0 then
    return;
  end if;

  -- @everyone occupies position 0; place the role at 1..v_len.
  v_idx := greatest(1, least(v_len, coalesce(p_new_position, v_len)));
  v_ids := v_ids[1:v_idx] || p_role_id || v_ids[v_idx+1:v_len];

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    update public.server_roles set position = i - 1 where id = v_ids[i];
  end loop;
end;
$$;

grant execute on function public.move_role(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Enforce react + attach in RLS
-- ---------------------------------------------------------------------------

-- Reactions: a member may only react in a channel they can view AND react in.
create or replace function public.can_view_message_reaction(p_context text, p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_context = 'channel' then
    return exists (
      select 1 from public.messages m
      join public.channels c on c.id = m.channel_id
      join public.server_members sm on sm.server_id = c.server_id and sm.user_id = auth.uid()
      where m.id = p_message_id
        and public.channel_user_can_view(m.channel_id)
        and public.channel_user_can_react(m.channel_id)
    );
  elsif p_context = 'dm' then
    return exists (
      select 1 from public.dm_messages dm
      join public.dm_threads t on t.id = dm.thread_id
      where dm.id = p_message_id and (t.user_a = auth.uid() or t.user_b = auth.uid())
    );
  elsif p_context = 'group' then
    return exists (
      select 1 from public.group_messages gm
      where gm.id = p_message_id and public.is_group_member(gm.group_id)
    );
  end if;
  return false;
end;
$$;

grant execute on function public.can_view_message_reaction(text, uuid) to authenticated;

-- Messages: attachments now require can_attach (folded into can_post's check);
-- posting itself already gated by channel_user_can_post.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and public.channel_user_can_post(messages.channel_id)
    and (
      messages.attachment_url is null
      or exists (
        select 1 from public.channels c
        where c.id = messages.channel_id
          and public.channel_user_can_attach(messages.channel_id)
      )
    )
    and (
      lower(messages.content) !~ '@(everyone|here)'
      or public.member_has_server_permission(
        (select c.server_id from public.channels c where c.id = messages.channel_id),
        auth.uid(),
        'mention_everyone'
      )
    )
  );