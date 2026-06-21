-- Fix RLS infinite recursion (500 errors), invite codes, roles, default channels

-- ---------------------------------------------------------------------------
-- Security-definer helpers (avoid self-referential RLS on server_members)
-- ---------------------------------------------------------------------------
create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_server_admin(p_server_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_server_owner(p_server_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.servers
    where id = p_server_id and owner_id = auth.uid()
  );
$$;

grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.is_server_admin(uuid) to authenticated;
grant execute on function public.is_server_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite codes on servers
-- ---------------------------------------------------------------------------
alter table public.servers
  add column if not exists invite_code text;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i int;
begin
  for i in 1..7 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

update public.servers set invite_code = public.generate_invite_code() where invite_code is null;

alter table public.servers alter column invite_code set not null;

create unique index if not exists servers_invite_code_idx on public.servers (invite_code);

-- ---------------------------------------------------------------------------
-- Profile avatar crop metadata
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_crop jsonb;

-- ---------------------------------------------------------------------------
-- Server roles
-- ---------------------------------------------------------------------------
create table if not exists public.server_roles (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers (id) on delete cascade,
  name        text not null,
  color       text not null default '#949ba4',
  permissions jsonb not null default '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false}'::jsonb,
  position    int not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.server_bans (
  server_id   uuid not null references public.servers (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  banned_by   uuid not null references public.profiles (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (server_id, user_id)
);

alter table public.server_members
  add column if not exists role_id uuid references public.server_roles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Drop broken RLS policies
-- ---------------------------------------------------------------------------
drop policy if exists "servers_select_member" on public.servers;
drop policy if exists "server_members_select" on public.server_members;
drop policy if exists "server_members_insert" on public.server_members;
drop policy if exists "server_members_delete" on public.server_members;
drop policy if exists "categories_select" on public.channel_categories;
drop policy if exists "categories_mutate_admin" on public.channel_categories;
drop policy if exists "channels_select" on public.channels;
drop policy if exists "channels_mutate_admin" on public.channels;
drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;
drop policy if exists "voice_select" on public.voice_presence;

-- ---------------------------------------------------------------------------
-- Fixed RLS policies
-- ---------------------------------------------------------------------------
create policy "servers_select_member" on public.servers for select to authenticated
  using (public.is_server_member(id) or owner_id = auth.uid());

create policy "server_members_select" on public.server_members for select to authenticated
  using (public.is_server_member(server_id));

create policy "server_members_insert" on public.server_members for insert to authenticated
  with check (
    auth.uid() = user_id
    or public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
  );

create policy "server_members_delete" on public.server_members for delete to authenticated
  using (
    auth.uid() = user_id
    or public.is_server_owner(server_id)
    or public.is_server_admin(server_id)
  );

create policy "categories_select" on public.channel_categories for select to authenticated
  using (public.is_server_member(server_id));

create policy "categories_mutate_admin" on public.channel_categories for all to authenticated
  using (public.is_server_admin(server_id) or public.is_server_owner(server_id))
  with check (public.is_server_admin(server_id) or public.is_server_owner(server_id));

create policy "channels_select" on public.channels for select to authenticated
  using (public.is_server_member(server_id));

create policy "channels_mutate_admin" on public.channels for all to authenticated
  using (public.is_server_admin(server_id) or public.is_server_owner(server_id))
  with check (public.is_server_admin(server_id) or public.is_server_owner(server_id));

create policy "messages_select" on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = messages.channel_id and public.is_server_member(c.server_id)
    )
  );

create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.channels c
      where c.id = messages.channel_id and public.is_server_member(c.server_id)
    )
  );

create policy "voice_select" on public.voice_presence for select to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = voice_presence.channel_id and public.is_server_member(c.server_id)
    )
  );

alter table public.server_roles enable row level security;
alter table public.server_bans enable row level security;

create policy "roles_select" on public.server_roles for select to authenticated
  using (public.is_server_member(server_id));

create policy "roles_mutate_admin" on public.server_roles for all to authenticated
  using (public.is_server_admin(server_id) or public.is_server_owner(server_id))
  with check (public.is_server_admin(server_id) or public.is_server_owner(server_id));

create policy "bans_select" on public.server_bans for select to authenticated
  using (public.is_server_member(server_id));

create policy "bans_mutate_mod" on public.server_bans for all to authenticated
  using (public.is_server_admin(server_id) or public.is_server_owner(server_id))
  with check (public.is_server_admin(server_id) or public.is_server_owner(server_id));

-- ---------------------------------------------------------------------------
-- Updated create_server: 2 categories, general + voice-1, invite code
-- ---------------------------------------------------------------------------
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

  insert into public.server_roles (server_id, name, color, position, is_default, permissions)
  values (v_id, '@everyone', '#949ba4', 0, true, '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false}'::jsonb)
  returning id into r_everyone;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_id, auth.uid(), 'owner', r_everyone);

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Text Channels', 0) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Voice Channels', 1) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_voice, 'voice-1', 'voice', 0);

  return v_id;
end;
$$;

-- Join server by invite code
create or replace function public.join_server_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server public.servers%rowtype;
  v_role uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.ensure_user_profile();

  select * into v_server from public.servers where invite_code = p_code;
  if not found then raise exception 'Invalid invite code'; end if;

  if exists (select 1 from public.server_bans where server_id = v_server.id and user_id = auth.uid()) then
    raise exception 'You are banned from this server';
  end if;

  if exists (select 1 from public.server_members where server_id = v_server.id and user_id = auth.uid()) then
    return v_server.id;
  end if;

  select id into v_role from public.server_roles
  where server_id = v_server.id and is_default = true limit 1;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_server.id, auth.uid(), 'member', v_role);

  return v_server.id;
end;
$$;

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
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.invite_code = p_code;
end;
$$;

-- Kick member
create or replace function public.kick_server_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_server_admin(p_server_id) and not public.is_server_owner(p_server_id) then
    raise exception 'Insufficient permissions';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot kick the server owner';
  end if;
  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

-- Ban member
create or replace function public.ban_server_member(p_server_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_server_admin(p_server_id) and not public.is_server_owner(p_server_id) then
    raise exception 'Insufficient permissions';
  end if;
  insert into public.server_bans (server_id, user_id, banned_by, reason)
  values (p_server_id, p_user_id, auth.uid(), p_reason)
  on conflict (server_id, user_id) do nothing;
  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

grant execute on function public.join_server_by_invite(text) to authenticated;
grant execute on function public.get_server_by_invite(text) to anon, authenticated;
grant execute on function public.kick_server_member(uuid, uuid) to authenticated;
grant execute on function public.ban_server_member(uuid, uuid, text) to authenticated;

-- Backfill default channels for servers missing them
do $$
declare
  s record;
  c_text uuid;
  c_voice uuid;
begin
  for s in select id from public.servers loop
    if not exists (select 1 from public.channel_categories where server_id = s.id) then
      insert into public.channel_categories (server_id, name, position) values (s.id, 'Text Channels', 0) returning id into c_text;
      insert into public.channel_categories (server_id, name, position) values (s.id, 'Voice Channels', 1) returning id into c_voice;
      insert into public.channels (server_id, category_id, name, type, position) values
        (s.id, c_text, 'general', 'text', 0),
        (s.id, c_voice, 'voice-1', 'voice', 0);
    end if;
    if not exists (select 1 from public.server_roles where server_id = s.id) then
      insert into public.server_roles (server_id, name, color, is_default) values (s.id, '@everyone', '#949ba4', true);
    end if;
    update public.servers set invite_code = public.generate_invite_code() where id = s.id and invite_code is null;
  end loop;
end $$;
