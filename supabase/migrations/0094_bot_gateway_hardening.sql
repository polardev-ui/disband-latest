-- 0094_bot_gateway_hardening.sql
-- Bot gateway audit fixes (route-level rate limits live in
-- src/lib/bot-gateway-guard.ts; this file is the DB half).
--
-- Fix 1: banned bots could still manage channels. bot_send_message has the
--   is_bot_platform_banned check; create/rename/delete did not — a
--   platform-banned bot stayed able to create/rename/DELETE channels.
-- Fix 2: any bot owner could mint invites targeting ANY server, spamming
--   owners with bogus approval requests. Creation now requires the actor to
--   be a member of the target server.
-- Fix 3: channels.name is unbounded text and bot_create_channel had no
--   length cap — 100-char cap on create + rename (matches client limits).

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

  -- Fix 2: the actor must belong to the target server. Otherwise any bot
  -- owner can mint pending invites for servers they have nothing to do
  -- with, spamming owners with approval requests (social-engineering).
  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_actor_id
  ) then
    raise exception 'You must be a member of that server to invite a bot to it';
  end if;

  -- Only scopes the bot actually has can be offered.
  select coalesce(array_agg(x), array[]::text[]) into p_scopes
  from unnest(p_scopes) x
  where x in (select unnest(scopes) from public.bots where id = p_bot_id);

  if array_length(p_scopes, 1) is null then
    raise exception 'No valid scopes requested';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');

  insert into public.bot_invites (bot_id, server_id, code, scopes, created_by)
  values (p_bot_id, p_server_id, v_code, p_scopes, p_actor_id);

  return v_code;
end;
$$;

-- Fix 1: ban checks on all channel-manage paths.
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
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted';
  end if;

  if p_type not in ('text', 'voice') then
    raise exception 'Invalid channel type';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Channel name is required';
  end if;
  -- Fix 3: channels.name is unbounded text; cap bot-created names.
  if length(btrim(p_name)) > 100 then
    raise exception 'Channel name is too long (max 100 characters)';
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
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Channel name is required';
  end if;
  if length(btrim(p_name)) > 100 then
    raise exception 'Channel name is too long (max 100 characters)';
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
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted';
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
