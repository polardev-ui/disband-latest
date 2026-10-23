-- 0162_guild_tags.sql
-- Space guild tags: a short label, one of eight pixel icons, and a colour that
-- members can wear next to their name anywhere in Disband.
--
-- Creating or changing a tag is a Catalyst Level 3 perk (6+ Catalysts) and
-- needs Manage Space. Wearing one only needs membership, never a Catalyst.
--
-- Clients can read both tables but cannot write either directly. All writes go
-- through the validated security-definer functions below, so a forged profile
-- row cannot invent a tag, change its icon/colour, or wear a space they are
-- not in.

create table if not exists public.server_guild_tags (
  server_id  uuid primary key references public.servers(id) on delete cascade,
  tag        text not null,
  icon       text not null,
  color      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_guild_tags_tag_check
    check (tag ~ '^[A-Za-z0-9_.-]{1,4}$'),
  constraint server_guild_tags_icon_check
    check (icon in ('star', 'heart', 'bolt', 'crown', 'skull', 'moon', 'leaf', 'flame')),
  constraint server_guild_tags_color_check
    check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.profile_guild_tags (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  server_id   uuid not null references public.server_guild_tags(server_id) on delete cascade,
  tag         text not null,
  icon        text not null,
  color       text not null,
  equipped_at timestamptz not null default now()
);

create index if not exists profile_guild_tags_server_idx
  on public.profile_guild_tags (server_id);

alter table public.server_guild_tags enable row level security;
alter table public.profile_guild_tags enable row level security;

drop policy if exists server_guild_tags_read on public.server_guild_tags;
create policy server_guild_tags_read
  on public.server_guild_tags for select
  to authenticated
  using (true);

drop policy if exists profile_guild_tags_read on public.profile_guild_tags;
create policy profile_guild_tags_read
  on public.profile_guild_tags for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Level check
-- ---------------------------------------------------------------------------

create or replace function public.guild_tag_is_level_three(p_server_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    select count(*)::int
    from public.server_catalysts
    where server_id = p_server_id
  ) >= 6;
$$;

-- ---------------------------------------------------------------------------
-- Keep snapshots honest
-- ---------------------------------------------------------------------------

-- A tag change invalidates every worn copy. Members then choose the new tag
-- again, which mirrors Discord and prevents a stale label/colour surviving an
-- edit. An unchanged save does not clear anyone.
create or replace function public.clear_guild_tag_wearers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_guild_tags where server_id = new.server_id;
  return new;
end;
$$;

drop trigger if exists server_guild_tags_clear_wearers on public.server_guild_tags;
create trigger server_guild_tags_clear_wearers
  after update of tag, icon, color on public.server_guild_tags
  for each row
  when (
    old.tag is distinct from new.tag
    or old.icon is distinct from new.icon
    or old.color is distinct from new.color
  )
  execute function public.clear_guild_tag_wearers();

create or replace function public.prune_guild_tag(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.server_guild_tags where server_id = p_server_id
  ) then
    return;
  end if;

  if (
    select count(*)::int
    from public.server_catalysts
    where server_id = p_server_id
  ) < 6 then
    delete from public.server_guild_tags where server_id = p_server_id;
  end if;
end;
$$;

create or replace function public.guild_tag_catalyst_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.server_id is distinct from new.server_id then
    perform public.prune_guild_tag(old.server_id);
    perform public.prune_guild_tag(new.server_id);
  else
    perform public.prune_guild_tag(coalesce(new.server_id, old.server_id));
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists server_catalysts_guild_tag_prune on public.server_catalysts;
create trigger server_catalysts_guild_tag_prune
  after insert or delete or update of server_id on public.server_catalysts
  for each row
  execute function public.guild_tag_catalyst_changed();

-- Leaving (or being removed from) a space removes the worn tag immediately.
create or replace function public.clear_guild_tag_on_member_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_guild_tags
  where user_id = old.user_id and server_id = old.server_id;
  return old;
end;
$$;

drop trigger if exists server_members_clear_guild_tag on public.server_members;
create trigger server_members_clear_guild_tag
  after delete on public.server_members
  for each row
  execute function public.clear_guild_tag_on_member_leave();

-- ---------------------------------------------------------------------------
-- Server tag management
-- ---------------------------------------------------------------------------

create or replace function public.set_server_guild_tag(
  p_server_id uuid,
  p_tag text,
  p_icon text,
  p_color text
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

  insert into public.server_guild_tags (server_id, tag, icon, color)
  values (p_server_id, v_tag, v_icon, v_color)
  on conflict (server_id) do update
    set tag = excluded.tag,
        icon = excluded.icon,
        color = excluded.color,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'server_id', v_row.server_id,
    'tag', v_row.tag,
    'icon', v_row.icon,
    'color', v_row.color
  );
end;
$$;

create or replace function public.remove_server_guild_tag(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to remove the guild tag.' using errcode = '42501';
  end if;

  if not (
    exists (select 1 from public.servers where id = p_server_id and owner_id = v_uid)
    or public.member_has_server_permission(p_server_id, v_uid, 'manage_server')
  ) then
    raise exception 'You need Manage Space to remove the guild tag.' using errcode = '42501';
  end if;

  delete from public.server_guild_tags where server_id = p_server_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wearing a tag
-- ---------------------------------------------------------------------------

create or replace function public.equip_guild_tag(p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_server_tag public.server_guild_tags;
  v_row public.profile_guild_tags;
begin
  if v_uid is null then
    raise exception 'Sign in to wear a guild tag.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_uid
  ) then
    raise exception 'Join the space before wearing its guild tag.' using errcode = '42501';
  end if;

  select * into v_server_tag
  from public.server_guild_tags
  where server_id = p_server_id;

  if not found then
    raise exception 'That space does not have a guild tag yet.' using errcode = 'P0001';
  end if;

  if not public.guild_tag_is_level_three(p_server_id) then
    raise exception 'Guild tags need Catalyst Level 3.' using errcode = 'P0001';
  end if;

  insert into public.profile_guild_tags (user_id, server_id, tag, icon, color)
  values (v_uid, v_server_tag.server_id, v_server_tag.tag, v_server_tag.icon, v_server_tag.color)
  on conflict (user_id) do update
    set server_id = excluded.server_id,
        tag = excluded.tag,
        icon = excluded.icon,
        color = excluded.color,
        equipped_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'server_id', v_row.server_id,
    'tag', v_row.tag,
    'icon', v_row.icon,
    'color', v_row.color
  );
end;
$$;

create or replace function public.clear_guild_tag()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to remove your guild tag.' using errcode = '42501';
  end if;

  delete from public.profile_guild_tags where user_id = auth.uid();
end;
$$;

-- The picker in Profile settings: only tags from spaces the caller belongs to.
create or replace function public.get_my_guild_tags()
returns table (
  server_id uuid,
  server_name text,
  server_icon_url text,
  tag text,
  icon text,
  color text,
  equipped boolean
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
    ) as equipped
  from public.server_guild_tags sg
  join public.servers s on s.id = sg.server_id
  join public.server_members sm
    on sm.server_id = sg.server_id and sm.user_id = auth.uid()
  where public.guild_tag_is_level_three(sg.server_id)
  order by equipped desc, lower(s.name);
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.guild_tag_is_level_three(uuid) from public;
revoke all on function public.clear_guild_tag_wearers() from public;
revoke all on function public.prune_guild_tag(uuid) from public;
revoke all on function public.guild_tag_catalyst_changed() from public;
revoke all on function public.clear_guild_tag_on_member_leave() from public;

revoke all on function public.set_server_guild_tag(uuid, text, text, text) from public;
revoke all on function public.remove_server_guild_tag(uuid) from public;
revoke all on function public.equip_guild_tag(uuid) from public;
revoke all on function public.clear_guild_tag() from public;
revoke all on function public.get_my_guild_tags() from public;

grant execute on function public.set_server_guild_tag(uuid, text, text, text) to authenticated;
grant execute on function public.remove_server_guild_tag(uuid) to authenticated;
grant execute on function public.equip_guild_tag(uuid) to authenticated;
grant execute on function public.clear_guild_tag() to authenticated;
grant execute on function public.get_my_guild_tags() to authenticated;
