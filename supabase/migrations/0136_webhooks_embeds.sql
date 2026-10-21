-- ---------------------------------------------------------------------------
-- 0136: Discord-compatible webhooks, and rich embeds for webhooks and bots
--
-- Webhooks
--   A webhook posts into one channel through a secret URL:
--     https://disband.dev/webhook/<server key: 8 digits>/<token: 26 digits>
--   The server key is assigned to a space once and kept; the token is the
--   secret. Request and response shapes follow Discord's Execute Webhook, so
--   an integration can switch by changing the URL.
--
--   Each webhook has its own backing profile (is_bot) as the message author.
--   That keeps the existing per-author rate limits per webhook (as Discord
--   limits per webhook) instead of every webhook in the platform sharing one
--   author's budget. The per-message name/avatar override lives in
--   messages.webhook.
--
-- Embeds
--   messages.embeds holds up to 10 Discord-shaped embed objects. They are
--   validated and normalised by the API before they reach the database.
--
-- Trusted fields
--   Clients insert their own messages directly, so without a guard anyone
--   could post a message claiming to be a webhook or carrying an embed. The
--   trigger below strips both fields unless the write comes from one of the
--   server paths here, which set disband.trusted_write for their transaction.
--
-- Everything here is additive; existing reads and writes are unchanged.
-- ---------------------------------------------------------------------------

set lock_timeout = '5s';

alter table public.messages
  add column if not exists embeds jsonb,
  add column if not exists webhook jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_embeds_shape_check') then
    alter table public.messages add constraint messages_embeds_shape_check
      check (embeds is null or (jsonb_typeof(embeds) = 'array' and jsonb_array_length(embeds) <= 10));
  end if;
end $$;

create or replace function public.guard_message_trusted_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('disband.trusted_write', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.embeds := null;
    new.webhook := null;
  else
    new.embeds := old.embeds;
    new.webhook := old.webhook;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_trusted_fields on public.messages;
create trigger messages_guard_trusted_fields
  before insert or update on public.messages
  for each row execute function public.guard_message_trusted_fields();

-- --- Server key ------------------------------------------------------------

alter table public.servers add column if not exists webhook_key text;
create unique index if not exists servers_webhook_key_idx on public.servers (webhook_key) where webhook_key is not null;

-- 8 random digits, assigned once and kept for the life of the space.
create or replace function public.ensure_server_webhook_key(p_server_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select webhook_key into v_key from public.servers where id = p_server_id;
  if v_key is not null then return v_key; end if;
  loop
    v_key := lpad((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
    begin
      update public.servers set webhook_key = v_key where id = p_server_id and webhook_key is null;
      exit;
    exception when unique_violation then
      -- Collided with another space's key; draw again.
    end;
  end loop;
  select webhook_key into v_key from public.servers where id = p_server_id;
  return v_key;
end;
$$;

-- --- Webhooks --------------------------------------------------------------

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  -- The backing profile. Not cascaded: deleting a webhook keeps the messages
  -- it already posted, as on Discord.
  author_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  token text not null unique check (token ~ '^[0-9]{26}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  deleted_at timestamptz
);
create index if not exists webhooks_server_idx on public.webhooks (server_id) where deleted_at is null;

-- Only the API (service role) touches this table; tokens are secrets.
alter table public.webhooks enable row level security;
revoke all on public.webhooks from anon, authenticated;

-- A permission check for the API, which acts for a user without being them.
create or replace function public.user_has_server_permission(p_server_id uuid, p_user_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_legacy_role text;
  v_role_id uuid;
begin
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    return true;
  end if;
  select sm.role, sm.role_id into v_legacy_role, v_role_id
  from public.server_members sm where sm.server_id = p_server_id and sm.user_id = p_user_id;
  if not found then return false; end if;
  if v_legacy_role in ('owner', 'admin') then return true; end if;
  if v_role_id is not null and exists (
    select 1 from public.server_roles sr
    where sr.id = v_role_id and sr.server_id = p_server_id
      and coalesce((sr.permissions ->> p_permission)::boolean, false)
  ) then
    return true;
  end if;
  return exists (
    select 1 from public.member_roles mr
    join public.server_roles sr on sr.id = mr.role_id and sr.server_id = p_server_id
    where mr.server_id = p_server_id and mr.user_id = p_user_id
      and coalesce((sr.permissions ->> p_permission)::boolean, false)
  );
end;
$$;
revoke all on function public.user_has_server_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.user_has_server_permission(uuid, uuid, text) to service_role;

-- Execute: post as the webhook. Called by the API with validated input.
create or replace function public.webhook_execute(
  p_server_key text,
  p_token text,
  p_content text,
  p_username text,
  p_avatar_url text,
  p_embeds jsonb,
  p_parse_users boolean,
  p_parse_everyone boolean
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook public.webhooks%rowtype;
  v_channel public.channels%rowtype;
  v_content text := coalesce(p_content, '');
  v_mentions uuid[] := '{}';
  v_msg public.messages%rowtype;
begin
  select w.* into v_hook
  from public.webhooks w
  join public.servers s on s.id = w.server_id
  where w.token = p_token and s.webhook_key = p_server_key and w.deleted_at is null;
  if not found then raise exception 'Unknown Webhook' using errcode = 'P0002'; end if;

  select * into v_channel from public.channels where id = v_hook.channel_id;
  if not found or v_channel.server_id <> v_hook.server_id then
    raise exception 'Unknown Channel' using errcode = 'P0002';
  end if;

  -- Defuse @everyone when the caller didn't allow it, the way Discord's
  -- allowed_mentions leaves the text but sends no ping.
  if not p_parse_everyone then
    v_content := regexp_replace(v_content, '@(everyone|here)', '@' || chr(8203) || '\1', 'gi');
  end if;

  if p_parse_users then
    select coalesce(array_agg(distinct p.id), '{}') into v_mentions
    from regexp_matches(v_content, '@([a-zA-Z0-9_]{2,32})', 'g') m
    join public.profiles p on lower(p.username) = lower(m[1])
    join public.server_members sm on sm.user_id = p.id and sm.server_id = v_hook.server_id;
  end if;

  perform set_config('disband.trusted_write', 'on', true);
  insert into public.messages (channel_id, author_id, content, mentions, embeds, webhook)
  values (
    v_hook.channel_id,
    v_hook.author_id,
    v_content,
    v_mentions,
    case when p_embeds is null or jsonb_array_length(p_embeds) = 0 then null else p_embeds end,
    jsonb_build_object(
      'id', v_hook.id,
      'name', coalesce(nullif(btrim(p_username), ''), v_hook.name),
      'avatar_url', coalesce(nullif(btrim(p_avatar_url), ''), v_hook.avatar_url)
    )
  )
  returning * into v_msg;
  perform set_config('disband.trusted_write', 'off', true);

  update public.webhooks set last_used_at = now() where id = v_hook.id;
  return v_msg;
end;
$$;
revoke all on function public.webhook_execute(text, text, text, text, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.webhook_execute(text, text, text, text, text, jsonb, boolean, boolean) to service_role;

-- Edit or delete a message this webhook posted (Discord's /messages/{id}).
create or replace function public.webhook_edit_message(
  p_server_key text,
  p_token text,
  p_display_id bigint,
  p_content text,
  p_set_content boolean,
  p_embeds jsonb,
  p_set_embeds boolean
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook public.webhooks%rowtype;
  v_msg public.messages%rowtype;
begin
  select w.* into v_hook from public.webhooks w join public.servers s on s.id = w.server_id
  where w.token = p_token and s.webhook_key = p_server_key and w.deleted_at is null;
  if not found then raise exception 'Unknown Webhook' using errcode = 'P0002'; end if;

  perform set_config('disband.trusted_write', 'on', true);
  update public.messages m set
    content = case when p_set_content then coalesce(p_content, '') else m.content end,
    embeds = case when p_set_embeds then (case when p_embeds is null or jsonb_array_length(p_embeds) = 0 then null else p_embeds end) else m.embeds end,
    edited_at = now()
  where m.display_id = p_display_id and m.author_id = v_hook.author_id
  returning * into v_msg;
  perform set_config('disband.trusted_write', 'off', true);
  if not found then raise exception 'Unknown Message' using errcode = 'P0002'; end if;
  return v_msg;
end;
$$;
revoke all on function public.webhook_edit_message(text, text, bigint, text, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.webhook_edit_message(text, text, bigint, text, boolean, jsonb, boolean) to service_role;

create or replace function public.webhook_delete_message(p_server_key text, p_token text, p_display_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook public.webhooks%rowtype;
begin
  select w.* into v_hook from public.webhooks w join public.servers s on s.id = w.server_id
  where w.token = p_token and s.webhook_key = p_server_key and w.deleted_at is null;
  if not found then raise exception 'Unknown Webhook' using errcode = 'P0002'; end if;
  delete from public.messages where display_id = p_display_id and author_id = v_hook.author_id;
  if not found then raise exception 'Unknown Message' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.webhook_delete_message(text, text, bigint) from public, anon, authenticated;
grant execute on function public.webhook_delete_message(text, text, bigint) to service_role;

-- --- Manage Webhooks permission ---------------------------------------------

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
    'manage_webhooks', public.member_has_server_permission(p_server_id, v_uid, 'manage_webhooks'),
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

-- --- Bots can send embeds ----------------------------------------------------

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
    'embeds', coalesce(p_msg.embeds, '[]'::jsonb),
    'webhook_id', p_msg.webhook ->> 'id',
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

-- Same checks as before, plus embeds. The 4-argument version is replaced by
-- one with a defaulted fifth argument, so existing callers are unaffected.
drop function if exists public.bot_send_message(uuid, uuid, text, uuid);
create or replace function public.bot_send_message(
  p_bot_id uuid,
  p_channel_id uuid,
  p_content text,
  p_reply_to_id uuid default null,
  p_embeds jsonb default null
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
  v_has_embeds boolean := p_embeds is not null and jsonb_typeof(p_embeds) = 'array' and jsonb_array_length(p_embeds) > 0;
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
  if not public.channel_permission_for(v_bot.user_id, p_channel_id, 'view') or not public.channel_permission_for(v_bot.user_id, p_channel_id, 'post') then raise exception 'Channel permission denied'; end if;

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

  if (p_content is null or length(btrim(p_content)) = 0) and not v_has_embeds then
    raise exception 'Message content is required';
  end if;
  if length(coalesce(p_content, '')) > 4000 then
    raise exception 'Message content is too long (max 4000 characters)';
  end if;
  if v_has_embeds and jsonb_array_length(p_embeds) > 10 then
    raise exception 'A message can have at most 10 embeds';
  end if;

  if btrim(coalesce(p_content, '')) ~* '@(everyone|here)\y'
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

  perform set_config('disband.trusted_write', 'on', true);
  insert into public.messages (channel_id, author_id, content, reply_to_id, embeds)
  values (p_channel_id, v_bot.user_id, btrim(coalesce(p_content, '')), p_reply_to_id,
          case when v_has_embeds then p_embeds else null end)
  returning * into v_msg;
  perform set_config('disband.trusted_write', 'off', true);

  return public.bot_message_to_json(v_msg, v_server);
end;
$$;

-- Recreated functions start with default (public) execute; restore service-only.
revoke all on function public.bot_send_message(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bot_send_message(uuid, uuid, text, uuid, jsonb) to service_role;
revoke all on function public.ensure_server_webhook_key(uuid) from public, anon, authenticated;
grant execute on function public.ensure_server_webhook_key(uuid) to service_role;
