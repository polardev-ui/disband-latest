-- ---------------------------------------------------------------------------
-- 0051 — Per-channel / per-role permissions
--
-- Channels used to be visible & postable for every server member (modulo the
-- global `read_only` flag). This adds per-role overrides per channel:
--
--   channel_permissions(channel_id, role_id, can_view, can_post)
--
-- Resolution model (matches Discord's spirit):
--   * owner/admin legacy roles can always view + post.
--   * anyone with the server-level `manage_channels` permission can too.
--   * if the channel has NO override rows at all, every member keeps today's
--     behavior: view = true, post = not read_only.
--   * if overrides exist, the effective value is the OR across the rows for
--     the user's assigned roles plus the @everyone (is_default) role.
--     If none of those roles have a row, the member is denied (so admins can
--     lock a channel to a specific role).
--
-- The table is RLS-locked; everything goes through security-definer RPCs, and
-- the `messages` RLS policies are tightened to enforce view/post per channel.
-- ---------------------------------------------------------------------------

create table if not exists public.channel_permissions (
  channel_id uuid not null references public.channels (id) on delete cascade,
  role_id    uuid not null references public.server_roles (id) on delete cascade,
  can_view   boolean not null,
  can_post   boolean not null,
  created_at timestamptz not null default now(),
  primary key (channel_id, role_id)
);

alter table public.channel_permissions enable row level security;

-- No policies (locked). All access via the RPCs below.

-- ---------------------------------------------------------------------------
-- Heart: compute an effective boolean for one permission over one channel.
-- p_permission: 'view' | 'post'
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
  v_role record;
  v_cv boolean;
  v_cp boolean;
  v_had_role_row boolean := false;
  v_view_grant boolean := false;
  v_post_grant boolean := false;
  v_has_overrides boolean;
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

  -- manage_channels holders can view + post anywhere (mirrors read_only bypass).
  if public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    return true;
  end if;

  select exists (select 1 from public.channel_permissions cp
                  where cp.channel_id = p_channel_id) into v_has_overrides;

  if not v_has_overrides then
    -- No overrides anywhere on this channel: keep legacy behavior.
    if p_permission = 'post' then
      return not v_read_only;
    end if;
    return true; -- view
  end if;

  -- Combine override rows across the user's assigned roles + @everyone.
  for v_role in (
    select mr.role_id
    from public.member_roles mr
    where mr.server_id = v_server_id and mr.user_id = v_uid
    union
    select sr.id
    from public.server_roles sr
    where sr.server_id = v_server_id and sr.is_default
  ) loop
    v_cv := null; v_cp := null;
    select cp.can_view, cp.can_post into v_cv, v_cp
      from public.channel_permissions cp
      where cp.channel_id = p_channel_id and cp.role_id = v_role.role_id;
    if found then
      v_had_role_row := true;
      if v_cv then v_view_grant := true; end if;
      if v_cp then v_post_grant := true; end if;
    end if;
  end loop;

  -- Overrides exist but none apply to this member: denied.
  if not v_had_role_row then
    return false;
  end if;

  if p_permission = 'view' then
    return v_view_grant;
  end if;
  -- 'post': grant only when an override grants it, and never on read-only
  -- channels (the manager bypass above is the only read_only exception).
  return v_post_grant and not v_read_only;
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

-- Visible channels for the calling user within a server.
create or replace function public.get_visible_channel_ids(p_server_id uuid)
returns table (channel_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select c.id
  from public.channels c
  where c.server_id = p_server_id
    and public.channel_user_can_view(c.id)
  order by c.position;
$$;

grant execute on function public.get_visible_channel_ids(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Management RPCs (manage_channels-gated).
-- ---------------------------------------------------------------------------

create or replace function public.get_channel_permissions(p_channel_id uuid)
returns table (
  role_id    uuid,
  role_name  text,
  role_color text,
  is_default boolean,
  can_view   boolean,
  can_post   boolean
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
    select r.id, r.name, r.color, r.is_default, cp.can_view, cp.can_post
    from public.server_roles r
    left join public.channel_permissions cp
      on cp.role_id = r.id and cp.channel_id = p_channel_id
    where r.server_id = v_server_id
    order by r.is_default, r.position;
end;
$$;

grant execute on function public.get_channel_permissions(uuid) to authenticated;

create or replace function public.set_channel_role_permission(
  p_channel_id uuid,
  p_role_id    uuid,
  p_can_view   boolean,
  p_can_post   boolean
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

  insert into public.channel_permissions (channel_id, role_id, can_view, can_post)
  values (p_channel_id, p_role_id, p_can_view, p_can_post)
  on conflict (channel_id, role_id)
  do update set can_view = excluded.can_view, can_post = excluded.can_post;
end;
$$;

grant execute on function public.set_channel_role_permission(uuid, uuid, boolean, boolean) to authenticated;

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
  v_used boolean;
  v_read_only boolean;
begin
  select c.server_id, coalesce(c.read_only, false) into v_server_id, v_read_only
    from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    raise exception 'Channel not found';
  end if;

  if not public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    raise exception 'You do not have permission to manage channels';
  end if;

  delete from public.channel_permissions
  where channel_id = p_channel_id and role_id = p_role_id;

  -- If this role is now the only override holder and we cleared the last row,
  -- nothing to do: the channel simply falls back to defaults.
end;
$$;

grant execute on function public.remove_channel_role_permission(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tighten `messages` RLS to enforce per-channel view/post.
-- ---------------------------------------------------------------------------

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated
  using (
    public.channel_user_can_view(messages.channel_id)
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and public.channel_user_can_post(messages.channel_id)
    and (
      lower(messages.content) !~ '@(everyone|here)'
      or public.member_has_server_permission(
        (select c.server_id from public.channels c where c.id = messages.channel_id),
        auth.uid(),
        'mention_everyone'
      )
    )
  );