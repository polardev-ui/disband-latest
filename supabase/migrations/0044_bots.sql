-- 0044: Bots — self-hosted integrations.
--
-- A bot is a first-class member of servers: it owns a profile row (is_bot = true)
-- so the existing permission model, member lists and message RLS all apply to it
-- unchanged. What a bot can actually do in a server is the *intersection* of:
--
--   1. the scopes on its `bots` row (what its developer asked for), and
--   2. the scopes granted per-server in `bot_grants` (what an owner approved).
--
-- All bot actions happen through SECURITY DEFINER functions below, so a leaked
-- token can only ever reach what the developer requested and an owner granted —
-- never the database itself. Bots never receive Supabase credentials.

-- ---------------------------------------------------------------------------
-- 1. Profiles: mark bot identities
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_bot boolean not null default false;

create index if not exists profiles_is_bot_idx on public.profiles (is_bot) where is_bot;

-- ---------------------------------------------------------------------------
-- 2. bots — one row per bot application
-- ---------------------------------------------------------------------------
create table if not exists public.bots (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  avatar_url   text,
  -- The full set of scopes the developer requested when creating the bot.
  scopes       text[] not null default '{}',
  token_hash   text not null,
  token_prefix text not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists bots_token_hash_idx on public.bots (token_hash);
create index if not exists bots_owner_idx on public.bots (owner_id);
create index if not exists bots_user_idx on public.bots (user_id);

drop trigger if exists bots_set_updated_at on public.bots;
create trigger bots_set_updated_at
  before update on public.bots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. bot_grants — scopes an owner approved for a bot in one server
-- ---------------------------------------------------------------------------
create table if not exists public.bot_grants (
  bot_id     uuid not null references public.bots (id) on delete cascade,
  server_id  uuid not null references public.servers (id) on delete cascade,
  scopes     text[] not null default '{}',
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (bot_id, server_id)
);

create index if not exists bot_grants_server_idx on public.bot_grants (server_id);

-- ---------------------------------------------------------------------------
-- 4. bot_invites — pending owner approvals
-- ---------------------------------------------------------------------------
create table if not exists public.bot_invites (
  id         uuid primary key default gen_random_uuid(),
  bot_id     uuid not null references public.bots (id) on delete cascade,
  server_id  uuid not null references public.servers (id) on delete cascade,
  code       text not null unique,
  scopes     text[] not null default '{}',
  status     text not null default 'pending'
               check (status in ('pending', 'approved', 'declined', 'expired')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists bot_invites_bot_idx on public.bot_invites (bot_id);
create index if not exists bot_invites_server_idx on public.bot_invites (server_id);

-- ---------------------------------------------------------------------------
-- 5. bot_events — queued events consumed by the gateway (long-poll)
-- ---------------------------------------------------------------------------
create table if not exists public.bot_events (
  id           bigint generated always as identity primary key,
  bot_id       uuid not null references public.bots (id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists bot_events_pending_idx
  on public.bot_events (bot_id, id) where delivered_at is null;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bots        enable row level security;
alter table public.bot_grants  enable row level security;
alter table public.bot_invites enable row level security;
alter table public.bot_events  enable row level security;

-- Owners manage their own bots; everyone else reaches bots through the API.
drop policy if exists "bots_owner_select" on public.bots;
create policy "bots_owner_select" on public.bots
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "bots_owner_update" on public.bots;
create policy "bots_owner_update" on public.bots
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Any server member can see which bots are in a server and what was granted.
drop policy if exists "bot_grants_member_select" on public.bot_grants;
create policy "bot_grants_member_select" on public.bot_grants
  for select to authenticated
  using (public.is_server_member(server_id));

-- Inviters can see the invites they created.
drop policy if exists "bot_invites_creator_select" on public.bot_invites;
create policy "bot_invites_creator_select" on public.bot_invites
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.servers s
      where s.id = bot_invites.server_id and s.owner_id = auth.uid()
    )
  );

grant select, update on public.bots        to authenticated;
grant select          on public.bot_grants  to authenticated;
grant select          on public.bot_invites to authenticated;

grant all on public.bots        to service_role;
grant all on public.bot_grants  to service_role;
grant all on public.bot_invites to service_role;
grant all on public.bot_events  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Helpers
-- ---------------------------------------------------------------------------

-- Validates a scope array against the known set.
create or replace function public.is_valid_bot_scopes(p_scopes text[])
returns boolean
language plpgsql
immutable
as $$
declare
  s text;
begin
  if p_scopes is null then
    return false;
  end if;
  foreach s in array p_scopes loop
    if s not in ('messages.read', 'messages.write', 'members.read', 'channels.manage') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Like member_has_server_permission, but for an explicit user id. Only invoked
-- from our SECURITY DEFINER bot functions — it is not exposed to clients, so it
-- does not act as a cross-user permission oracle.
create or replace function public.bot_has_server_permission(
  p_server_id uuid,
  p_user_id   uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_legacy_role text;
  v_role_id uuid;
  v_perms jsonb;
begin
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

  -- Role stacks: any assigned role granting the permission wins.
  if exists (
    select 1
    from public.member_roles mr
    join public.server_roles sr on sr.id = mr.role_id and sr.server_id = mr.server_id
    where mr.server_id = p_server_id and mr.user_id = p_user_id
      and coalesce((sr.permissions ->> p_permission)::boolean, false)
  ) then
    return true;
  end if;

  -- Legacy single-role fallback.
  if v_role_id is not null then
    select sr.permissions into v_perms
    from public.server_roles sr
    where sr.id = v_role_id and sr.server_id = p_server_id;

    if coalesce((v_perms ->> p_permission)::boolean, false) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public.bot_has_server_permission(uuid, uuid, text) from public;
grant execute on function public.bot_has_server_permission(uuid, uuid, text) to service_role;

-- True when the bot (or its owner) is platform-banned.
create or replace function public.is_bot_platform_banned(p_bot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bots b
    where b.id = p_bot_id
      and (
        exists (select 1 from public.platform_bans where user_id = b.user_id)
        or exists (select 1 from public.platform_bans where user_id = b.owner_id)
      )
  );
$$;

grant execute on function public.is_bot_platform_banned(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Invite lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.bot_create_invite(
  p_bot_id    uuid,
  p_actor_id  uuid,
  p_server_id uuid,
  p_scopes    text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_code  text;
begin
  if not public.is_valid_bot_scopes(p_scopes) then
    raise exception 'Invalid bot scopes';
  end if;

  select owner_id into v_owner from public.bots where id = p_bot_id;
  if v_owner is null then
    raise exception 'Bot not found';
  end if;

  -- The actor must own the bot or be the bot itself.
  if v_owner <> p_actor_id and not exists (
    select 1 from public.bots where id = p_bot_id and user_id = p_actor_id
  ) then
    raise exception 'Only the bot owner can generate invites';
  end if;

  -- Only scopes the bot actually has can be offered.
  select coalesce(array_agg(x), array[]::text[]) into p_scopes
  from unnest(p_scopes) x
  where x = any((
    select scopes from public.bots where id = p_bot_id
  ));

  if array_length(p_scopes, 1) is null then
    raise exception 'No valid scopes requested';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');

  insert into public.bot_invites (bot_id, server_id, code, scopes, created_by)
  values (p_bot_id, p_server_id, v_code, p_scopes, p_actor_id);

  return v_code;
end;
$$;

grant execute on function public.bot_create_invite(uuid, uuid, uuid, text[]) to service_role;

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

grant execute on function public.bot_invite_info(text) to anon, authenticated, service_role;

create or replace function public.bot_approve_invite(p_code text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.bot_invites%rowtype;
  v_bot    public.bots%rowtype;
  v_role   uuid;
begin
  select * into v_invite from public.bot_invites where code = p_code;
  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been used';
  end if;
  if v_invite.expires_at < now() then
    update public.bot_invites set status = 'expired' where id = v_invite.id;
    raise exception 'This invite has expired';
  end if;

  -- Only the server owner can approve a bot joining their server.
  if not exists (
    select 1 from public.servers where id = v_invite.server_id and owner_id = p_actor_id
  ) then
    raise exception 'Only the server owner can approve a bot invite';
  end if;

  select * into v_bot from public.bots where id = v_invite.bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  -- Join the bot as a regular member.
  select id into v_role from public.server_roles
  where server_id = v_invite.server_id and is_default = true
  limit 1;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_invite.server_id, v_bot.user_id, 'member', v_role)
  on conflict (server_id, user_id) do nothing;

  if v_role is not null then
    insert into public.member_roles (server_id, user_id, role_id)
    values (v_invite.server_id, v_bot.user_id, v_role)
    on conflict (server_id, user_id, role_id) do nothing;
  end if;

  insert into public.bot_grants (bot_id, server_id, scopes, granted_by)
  values (v_invite.bot_id, v_invite.server_id, v_invite.scopes, p_actor_id)
  on conflict (bot_id, server_id) do update
    set scopes = excluded.scopes, granted_by = excluded.granted_by;

  update public.bot_invites set status = 'approved' where id = v_invite.id;

  perform public.write_audit_log(
    v_invite.server_id,
    'bot.invite.approve',
    'bot',
    v_bot.id::text,
    jsonb_build_object('name', v_bot.name, 'scopes', v_invite.scopes)
  );
end;
$$;

grant execute on function public.bot_approve_invite(text, uuid) to service_role;

create or replace function public.bot_decline_invite(p_code text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
begin
  select server_id into v_server from public.bot_invites where code = p_code;
  if v_server is null then
    raise exception 'Invite not found';
  end if;

  if not exists (
    select 1 from public.servers where id = v_server and owner_id = p_actor_id
  ) then
    raise exception 'Only the server owner can decline a bot invite';
  end if;

  update public.bot_invites set status = 'declined' where code = p_code;
end;
$$;

grant execute on function public.bot_decline_invite(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Acting as a bot
-- ---------------------------------------------------------------------------

-- Internal: message-row → JSON payload for the events gateway.
-- `%rowtype` is only valid inside a PL/pgSQL DECLARE block, never in a
-- parameter list. A table name is already a usable composite type, so the
-- parameter takes `public.messages` directly.
create or replace function public.bot_message_to_json(p_msg public.messages, p_server_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_author_name text;
  v_author_username text;
  v_author_avatar text;
  v_author_bot boolean;
begin
  select coalesce(display_name, username, 'Unknown'), username, avatar_url, is_bot
    into v_author_name, v_author_username, v_author_avatar, v_author_bot
  from public.profiles where id = p_msg.author_id;

  return jsonb_build_object(
    'id', p_msg.id,
    'channel_id', p_msg.channel_id,
    'server_id', p_server_id,
    'author', jsonb_build_object(
      'id', p_msg.author_id,
      'username', v_author_username,
      'display_name', v_author_name,
      'avatar_url', v_author_avatar,
      'is_bot', coalesce(v_author_bot, false)
    ),
    'content', p_msg.content,
    'reply_to_id', p_msg.reply_to_id,
    'mentions', p_msg.mentions,
    'attachment_url', p_msg.attachment_url,
    'attachment_type', p_msg.attachment_type,
    'created_at', p_msg.created_at,
    'edited_at', p_msg.edited_at,
    'display_id', p_msg.display_id
  );
end;
$$;

-- Sends a message as a bot. Enforces membership, scopes, and the same rules
-- the RLS insert policy enforces for humans (mention_everyone, read_only).
create or replace function public.bot_send_message(
  p_bot_id      uuid,
  p_channel_id  uuid,
  p_content     text,
  p_reply_to_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot     public.bots%rowtype;
  v_channel public.channels%rowtype;
  v_server  uuid;
  v_msg     public.messages%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted from posting';
  end if;

  select * into v_channel from public.channels where id = p_channel_id;
  if not found then
    raise exception 'Channel not found';
  end if;
  v_server := v_channel.server_id;

  if not exists (
    select 1 from public.server_members
    where server_id = v_server and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'messages.write' = any (scopes)
  ) then
    raise exception 'This bot does not have messages.write in that server';
  end if;

  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'Message content is required';
  end if;
  if length(p_content) > 4000 then
    raise exception 'Message content is too long (max 4000 characters)';
  end if;

  if btrim(p_content) ~* '@(everyone|here)\b'
     and not public.bot_has_server_permission(v_server, v_bot.user_id, 'mention_everyone') then
    raise exception 'This bot needs the mention_everyone permission to use @everyone';
  end if;

  if v_channel.read_only
     and not public.bot_has_server_permission(v_server, v_bot.user_id, 'manage_channels') then
    raise exception 'That channel is read-only';
  end if;

  if p_reply_to_id is not null
     and not exists (
       select 1 from public.messages
       where id = p_reply_to_id and channel_id = p_channel_id
     ) then
    raise exception 'Reply target not found';
  end if;

  insert into public.messages (channel_id, author_id, content, reply_to_id)
  values (p_channel_id, v_bot.user_id, btrim(p_content), p_reply_to_id)
  returning * into v_msg;

  return public.bot_message_to_json(v_msg, v_server);
end;
$$;

grant execute on function public.bot_send_message(uuid, uuid, text, uuid) to service_role;

create or replace function public.bot_list_messages(
  p_bot_id     uuid,
  p_channel_id uuid,
  p_limit      int default 50,
  p_before_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot     public.bots%rowtype;
  v_channel public.channels%rowtype;
  v_server  uuid;
  v_out     jsonb;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  select * into v_channel from public.channels where id = p_channel_id;
  if not found then
    raise exception 'Channel not found';
  end if;
  v_server := v_channel.server_id;

  if not exists (
    select 1 from public.server_members
    where server_id = v_server and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'messages.read' = any (scopes)
  ) then
    raise exception 'This bot does not have messages.read in that server';
  end if;

  p_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at desc), '[]'::jsonb) into v_out
  from (
    select public.bot_message_to_json(x, v_server) as m
    from (
      select *
      from public.messages
      where channel_id = p_channel_id
        and (p_before_id is null or created_at < (
          select created_at from public.messages where id = p_before_id
        ))
      order by created_at desc
      limit p_limit
    ) x
  ) t;

  return v_out;
end;
$$;

grant execute on function public.bot_list_messages(uuid, uuid, int, uuid) to service_role;

create or replace function public.bot_list_channels(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots%rowtype;
  v_has_read boolean;
  v_has_manage boolean;
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

  v_has_read := exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'messages.read' = any (scopes)
  );
  v_has_manage := exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'channels.manage' = any (scopes)
  );
  if not (v_has_read or v_has_manage) then
    raise exception 'This bot does not have messages.read or channels.manage in that server';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'server_id', c.server_id,
        'category_id', c.category_id,
        'name', c.name,
        'type', c.type,
        'position', c.position,
        'read_only', c.read_only
      ) order by c.position
    )
    from public.channels c
    where c.server_id = p_server_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.bot_list_channels(uuid, uuid) to service_role;

create or replace function public.bot_list_members(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        'joined_at', sm.joined_at
      ) order by p.display_name, p.username
    )
    from public.server_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.server_id = p_server_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.bot_list_members(uuid, uuid) to service_role;

create or replace function public.bot_leave_server(p_bot_id uuid, p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;

  delete from public.server_members
  where server_id = p_server_id and user_id = v_bot.user_id;

  delete from public.bot_grants
  where bot_id = p_bot_id and server_id = p_server_id;
end;
$$;

grant execute on function public.bot_leave_server(uuid, uuid) to service_role;

-- Channel management behind the channels.manage scope.
create or replace function public.bot_create_channel(
  p_bot_id      uuid,
  p_server_id   uuid,
  p_name        text,
  p_type        text default 'text',
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot  public.bots%rowtype;
  v_pos  int;
  v_id   uuid;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  if p_type not in ('text', 'voice') then
    raise exception 'Invalid channel type';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Channel name is required';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'channels.manage' = any (scopes)
  ) then
    raise exception 'This bot does not have channels.manage in that server';
  end if;

  if not public.bot_has_server_permission(p_server_id, v_bot.user_id, 'manage_channels') then
    raise exception 'This bot needs the manage_channels role permission';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.channels where server_id = p_server_id;

  insert into public.channels (server_id, category_id, name, type, position)
  values (p_server_id, p_category_id, lower(btrim(p_name)), p_type, v_pos)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.bot_create_channel(uuid, uuid, text, text, uuid) to service_role;

create or replace function public.bot_rename_channel(
  p_bot_id     uuid,
  p_channel_id uuid,
  p_name       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot      public.bots%rowtype;
  v_server   uuid;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then
    raise exception 'Channel not found';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'channels.manage' = any (scopes)
  ) then
    raise exception 'This bot does not have channels.manage in that server';
  end if;

  if not public.bot_has_server_permission(v_server, v_bot.user_id, 'manage_channels') then
    raise exception 'This bot needs the manage_channels role permission';
  end if;

  update public.channels set name = lower(btrim(p_name)) where id = p_channel_id;
end;
$$;

grant execute on function public.bot_rename_channel(uuid, uuid, text) to service_role;

create or replace function public.bot_delete_channel(p_bot_id uuid, p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot    public.bots%rowtype;
  v_server uuid;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then
    return;
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'channels.manage' = any (scopes)
  ) then
    raise exception 'This bot does not have channels.manage in that server';
  end if;

  if not public.bot_has_server_permission(v_server, v_bot.user_id, 'manage_channels') then
    raise exception 'This bot needs the manage_channels role permission';
  end if;

  delete from public.channels where id = p_channel_id;
end;
$$;

grant execute on function public.bot_delete_channel(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Event dispatch — queue messages to bots that can read them
-- ---------------------------------------------------------------------------
create or replace function public.bot_events_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server  uuid;
  v_type    text;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := 'messageCreate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := public.bot_message_to_json(new, v_server);
  elsif tg_op = 'UPDATE' then
    v_type := 'messageUpdate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := jsonb_build_object(
      'id', new.id,
      'channel_id', new.channel_id,
      'server_id', v_server,
      'content', new.content,
      'edited_at', new.edited_at
    );
  else
    v_type := 'messageDelete';
    select server_id into v_server from public.channels where id = old.channel_id;
    v_payload := jsonb_build_object(
      'id', old.id,
      'channel_id', old.channel_id,
      'server_id', v_server
    );
  end if;

  if v_server is not null then
    insert into public.bot_events (bot_id, type, payload)
    select b.id, v_type, v_payload
    from public.bots b
    where b.revoked_at is null
      and 'messages.read' = any (b.scopes)
      and exists (
        select 1 from public.server_members sm
        where sm.server_id = v_server and sm.user_id = b.user_id
      )
      and exists (
        select 1 from public.bot_grants g
        where g.bot_id = b.id and g.server_id = v_server and 'messages.read' = any (g.scopes)
      );
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists bot_events_message_create on public.messages;
create trigger bot_events_message_create
  after insert on public.messages
  for each row execute function public.bot_events_dispatch();

drop trigger if exists bot_events_message_update on public.messages;
create trigger bot_events_message_update
  after update on public.messages
  for each row execute function public.bot_events_dispatch();

drop trigger if exists bot_events_message_delete on public.messages;
create trigger bot_events_message_delete
  after delete on public.messages
  for each row execute function public.bot_events_dispatch();
