-- ---------------------------------------------------------------------------
-- 0164: guild tag privacy and the space card behind a tag
--
-- A guild tag is also a doorway. Clicking one opens a small space card:
-- discoverable spaces can be joined directly; invite-only spaces show their
-- public profile but no join button. A space may opt into a private tag,
-- which still appears on members' names but reveals nothing about which space
-- it belongs to.
-- ---------------------------------------------------------------------------

alter table public.server_guild_tags
  add column if not exists is_private boolean not null default false;

-- The old four-argument signature is replaced by the same function with an
-- optional privacy flag. Dropping it first avoids an ambiguous overload for
-- clients that still call with four arguments.
drop function if exists public.set_server_guild_tag(uuid, text, text, text);
drop function if exists public.set_server_guild_tag(uuid, text, text, text, boolean);

create or replace function public.set_server_guild_tag(
  p_server_id uuid,
  p_tag text,
  p_icon text,
  p_color text,
  p_private boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_icon text := lower(btrim(coalesce(p_icon, '')));
  v_color text := lower(btrim(coalesce(p_color, '')));
  v_private boolean := coalesce(p_private, false);
  v_row public.server_guild_tags;
begin
  if v_uid is null then
    raise exception 'Sign in to change the guild tag.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.servers where id = p_server_id) then
    raise exception 'That space no longer exists.' using errcode = 'P0001';
  end if;

  if not (
    exists (select 1 from public.servers where id = p_server_id and owner_id = v_uid)
    or public.member_has_server_permission(p_server_id, v_uid, 'manage_server')
  ) then
    raise exception 'You need Manage Space to change the guild tag.' using errcode = '42501';
  end if;

  if not public.guild_tag_is_level_three(p_server_id) then
    raise exception 'Guild tags unlock at Catalyst Level 3.' using errcode = 'P0001';
  end if;

  if v_tag !~ '^[A-Z0-9_.-]{1,4}$' then
    raise exception 'Guild tags are 1-4 letters, numbers, dots, underscores or hyphens.' using errcode = 'P0001';
  end if;

  if v_icon not in ('star', 'heart', 'bolt', 'crown', 'skull', 'moon', 'leaf', 'flame') then
    raise exception 'Pick one of the eight guild tag icons.' using errcode = 'P0001';
  end if;

  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Pick a valid guild tag colour.' using errcode = 'P0001';
  end if;

  insert into public.server_guild_tags (server_id, tag, icon, color, is_private)
  values (p_server_id, v_tag, v_icon, v_color, v_private)
  on conflict (server_id) do update
    set tag = excluded.tag,
        icon = excluded.icon,
        color = excluded.color,
        is_private = excluded.is_private,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'server_id', v_row.server_id,
    'tag', v_row.tag,
    'icon', v_row.icon,
    'color', v_row.color,
    'is_private', v_row.is_private
  );
end;
$$;

-- The picker shows privacy so a wearer knows whether the tag is a doorway.
drop function if exists public.get_my_guild_tags();

create or replace function public.get_my_guild_tags()
returns table (
  server_id uuid,
  server_name text,
  server_icon_url text,
  tag text,
  icon text,
  color text,
  equipped boolean,
  is_private boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    sg.server_id,
    s.name as server_name,
    s.icon_url as server_icon_url,
    sg.tag,
    sg.icon,
    sg.color,
    exists (
      select 1
      from public.profile_guild_tags pgt
      where pgt.user_id = auth.uid()
        and pgt.server_id = sg.server_id
    ) as equipped,
    sg.is_private
  from public.server_guild_tags sg
  join public.servers s on s.id = sg.server_id
  join public.server_members sm
    on sm.server_id = sg.server_id and sm.user_id = auth.uid()
  where public.guild_tag_is_level_three(sg.server_id)
  order by equipped desc, lower(s.name);
$$;

-- Public card behind a worn tag. A private tag returns only its privacy flag;
-- every other tag returns the same safe fields Discover exposes, including
-- for invite-only spaces. No invite code, channels or member identities are
-- returned here.
create or replace function public.get_guild_tag_space(p_server_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tag public.server_guild_tags;
  v_server public.servers;
  v_member_count bigint;
  v_online_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view this space.' using errcode = '42501';
  end if;

  select * into v_tag
  from public.server_guild_tags
  where server_id = p_server_id;

  if not found then
    raise exception 'That guild tag no longer exists.' using errcode = 'P0001';
  end if;

  if v_tag.is_private then
    return jsonb_build_object('private', true);
  end if;

  select * into v_server
  from public.servers
  where id = p_server_id;

  if not found then
    raise exception 'That space no longer exists.' using errcode = 'P0001';
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(p.status, 'offline') in ('online', 'idle', 'dnd')
    )
  into v_member_count, v_online_count
  from public.server_members sm
  left join public.profiles p on p.id = sm.user_id
  where sm.server_id = p_server_id;

  return jsonb_build_object(
    'private', false,
    'server_id', v_server.id,
    'name', v_server.name,
    'icon_url', v_server.icon_url,
    'banner_url', v_server.banner_url,
    'description', v_server.description,
    'verified', coalesce(v_server.verified, false),
    'partner', coalesce(v_server.partner, false),
    'discoverable', coalesce(v_server.discoverable, false),
    'joined', exists (
      select 1 from public.server_members
      where server_id = p_server_id and user_id = auth.uid()
    ),
    'member_count', v_member_count,
    'online_count', v_online_count
  );
end;
$$;

revoke all on function public.set_server_guild_tag(uuid, text, text, text, boolean) from public;
revoke all on function public.get_my_guild_tags() from public;
revoke all on function public.get_guild_tag_space(uuid) from public;

grant execute on function public.set_server_guild_tag(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.get_my_guild_tags() to authenticated;
grant execute on function public.get_guild_tag_space(uuid) to authenticated;
