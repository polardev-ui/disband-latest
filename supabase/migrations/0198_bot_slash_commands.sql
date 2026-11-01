-- ---------------------------------------------------------------------------
-- 0198: slash commands, interactions and buttons for bots.
--
--   bot_commands       what a bot registered (PUT /api/v1/commands). Global:
--                      every space the bot is in offers them in the composer.
--   bot_interactions   one row each time someone runs a command or presses a
--                      bot's button. The bot gets an `interactionCreate`
--                      event through the gateway and answers within 15
--                      minutes with POST /api/v1/interactions/{id}/callback.
--   messages.components  rows of buttons on a bot's message.
--   messages.interaction who ran the command a bot's reply answers, shown
--                      above it ("@kai used /weather").
--
-- Both new message columns are trusted: only SECURITY DEFINER code that sets
-- disband.trusted_write can write them, the same as embeds and webhook.
--
-- An interaction reply does not need messages.write. The member who ran the
-- command could post there, and the bot is answering them, as on Discord.
-- ---------------------------------------------------------------------------

-- --- Commands ----------------------------------------------------------------

create table if not exists public.bot_commands (
  id          uuid primary key default gen_random_uuid(),
  bot_id      uuid not null references public.bots (id) on delete cascade,
  name        text not null check (name ~ '^[a-z0-9_-]{1,32}$'),
  description text not null check (char_length(description) between 1 and 100),
  -- [{name, description, type, required, choices?: [{name, value}]}], up to 25.
  options     jsonb not null default '[]'
                check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 25),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bot_id, name)
);

drop trigger if exists bot_commands_set_updated_at on public.bot_commands;
create trigger bot_commands_set_updated_at
  before update on public.bot_commands
  for each row execute function public.set_updated_at();

alter table public.bot_commands enable row level security;

-- Developers see their own bots' commands in the portal. Members get them
-- through space_bot_commands() below.
drop policy if exists "bot_commands_owner_select" on public.bot_commands;
create policy "bot_commands_owner_select" on public.bot_commands
  for select to authenticated
  using (exists (select 1 from public.bots b where b.id = bot_commands.bot_id and b.owner_id = auth.uid()));

grant select on public.bot_commands to authenticated;
grant all on public.bot_commands to service_role;

-- --- Interactions ------------------------------------------------------------

create table if not exists public.bot_interactions (
  id           uuid primary key default gen_random_uuid(),
  bot_id       uuid not null references public.bots (id) on delete cascade,
  server_id    uuid not null references public.servers (id) on delete cascade,
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('command', 'component')),
  command_name text,
  options      jsonb not null default '{}',
  custom_id    text,
  message_id   uuid references public.messages (id) on delete cascade,
  responses    integer not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '15 minutes'
);

create index if not exists bot_interactions_user_idx on public.bot_interactions (user_id, created_at desc);
create index if not exists bot_interactions_bot_idx on public.bot_interactions (bot_id, created_at desc);

alter table public.bot_interactions enable row level security;
grant all on public.bot_interactions to service_role;

-- --- Messages ----------------------------------------------------------------

alter table public.messages
  add column if not exists components jsonb,
  add column if not exists interaction jsonb;

create or replace function public.guard_message_trusted_fields()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(current_setting('disband.trusted_write', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.embeds := null;
    new.webhook := null;
    new.components := null;
    new.interaction := null;
  else
    new.embeds := old.embeds;
    new.webhook := old.webhook;
    new.components := old.components;
    new.interaction := old.interaction;
  end if;
  return new;
end;
$$;

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
    'components', coalesce(p_msg.components, '[]'::jsonb),
    'interaction', p_msg.interaction,
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

-- bot_send_message gains components. The old five-argument version goes, so
-- PostgREST never has two overloads to choose between.
drop function if exists public.bot_send_message(uuid, uuid, text, uuid, jsonb);

create or replace function public.bot_send_message(
  p_bot_id uuid,
  p_channel_id uuid,
  p_content text,
  p_reply_to_id uuid default null,
  p_embeds jsonb default null,
  p_components jsonb default null
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
  v_has_components boolean := p_components is not null and jsonb_typeof(p_components) = 'array' and jsonb_array_length(p_components) > 0;
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
  if v_has_components and jsonb_array_length(p_components) > 5 then
    raise exception 'A message can have at most 5 rows of components';
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
  insert into public.messages (channel_id, author_id, content, reply_to_id, embeds, components)
  values (p_channel_id, v_bot.user_id, btrim(coalesce(p_content, '')), p_reply_to_id,
          case when v_has_embeds then p_embeds else null end,
          case when v_has_components then p_components else null end)
  returning * into v_msg;
  perform set_config('disband.trusted_write', 'off', true);

  return public.bot_message_to_json(v_msg, v_server);
end;
$$;

revoke all on function public.bot_send_message(uuid, uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bot_send_message(uuid, uuid, text, uuid, jsonb, jsonb) to service_role;

-- --- What the composer offers ------------------------------------------------

-- Commands of every live bot in a space, for its members.
create or replace function public.space_bot_commands(p_server_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'bot_id', b.id,
           'bot_user_id', b.user_id,
           'bot_name', coalesce(p.display_name, p.username, b.name),
           'bot_avatar_url', coalesce(p.avatar_url, b.avatar_url),
           'name', c.name,
           'description', c.description,
           'options', c.options
         ) order by c.name, b.name), '[]'::jsonb)
  from public.bot_commands c
  join public.bots b on b.id = c.bot_id and b.revoked_at is null
  join public.bot_grants g on g.bot_id = b.id and g.server_id = p_server_id
  join public.server_members m on m.server_id = p_server_id and m.user_id = b.user_id
  left join public.profiles p on p.id = b.user_id
  where exists (select 1 from public.server_members me where me.server_id = p_server_id and me.user_id = auth.uid())
    and not public.is_bot_platform_banned(b.id);
$$;

revoke all on function public.space_bot_commands(uuid) from public, anon;
grant execute on function public.space_bot_commands(uuid) to authenticated;

-- --- Running a command or pressing a button ------------------------------------

-- The event a bot receives, Discord-shaped.
create or replace function public.bot_interaction_to_json(p_i public.bot_interactions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_i.id,
    'type', p_i.type,
    'server_id', p_i.server_id,
    'channel_id', p_i.channel_id,
    'user', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', coalesce(p.display_name, p.username),
      'avatar_url', p.avatar_url
    ),
    'command', case when p_i.type = 'command'
                    then jsonb_build_object('name', p_i.command_name, 'options', p_i.options) end,
    'component', case when p_i.type = 'component'
                      then jsonb_build_object('custom_id', p_i.custom_id, 'message_id', p_i.message_id) end,
    'created_at', p_i.created_at,
    'expires_at', p_i.expires_at
  )
  from public.profiles p where p.id = p_i.user_id;
$$;

revoke all on function public.bot_interaction_to_json(public.bot_interactions) from public, anon, authenticated;

-- Shared checks for a member starting an interaction: they can see and post
-- in the channel, the bot is in the space with a grant, and they have not
-- started more than 15 in the last 30 seconds.
create or replace function public.bot_interaction_gate(p_bot_id uuid, p_channel_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_server uuid;
  v_bot public.bots%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then
    raise exception 'Channel not found';
  end if;
  if not public.channel_permission_for(v_uid, p_channel_id, 'view')
     or not public.channel_permission_for(v_uid, p_channel_id, 'post') then
    raise exception 'You can''t use commands in this channel.';
  end if;
  select * into v_bot from public.bots where id = p_bot_id;
  if not found or v_bot.revoked_at is not null or public.is_bot_platform_banned(p_bot_id)
     or not exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = v_server)
     or not exists (select 1 from public.server_members where server_id = v_server and user_id = v_bot.user_id) then
    raise exception 'That bot isn''t in this space.';
  end if;
  if (select count(*) from public.bot_interactions
      where user_id = v_uid and created_at > now() - interval '30 seconds') >= 15 then
    raise exception 'You''re using commands too quickly. Try again in a moment.';
  end if;
  return v_server;
end;
$$;

revoke all on function public.bot_interaction_gate(uuid, uuid) from public, anon, authenticated;

create or replace function public.invoke_bot_command(
  p_bot_id uuid,
  p_channel_id uuid,
  p_name text,
  p_options jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
  v_cmd public.bot_commands%rowtype;
  v_opts jsonb := coalesce(p_options, '{}'::jsonb);
  v_def jsonb;
  v_key text;
  v_val jsonb;
  v_type text;
  v_row public.bot_interactions%rowtype;
begin
  v_server := public.bot_interaction_gate(p_bot_id, p_channel_id);

  select * into v_cmd from public.bot_commands where bot_id = p_bot_id and name = lower(p_name);
  if not found then
    raise exception 'That command no longer exists.';
  end if;
  if jsonb_typeof(v_opts) <> 'object' then
    raise exception 'Options must be an object.';
  end if;

  -- Every option given is one the command defines, of the right type.
  for v_key, v_val in select * from jsonb_each(v_opts) loop
    select d into v_def from jsonb_array_elements(v_cmd.options) d where d ->> 'name' = v_key;
    if v_def is null then
      raise exception 'Unknown option: %', v_key;
    end if;
    v_type := v_def ->> 'type';
    if v_type in ('string', 'user', 'channel') and jsonb_typeof(v_val) <> 'string' then
      raise exception 'Option % must be text.', v_key;
    elsif v_type in ('integer', 'number') and jsonb_typeof(v_val) <> 'number' then
      raise exception 'Option % must be a number.', v_key;
    elsif v_type = 'integer' and (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then
      raise exception 'Option % must be a whole number.', v_key;
    elsif v_type = 'boolean' and jsonb_typeof(v_val) <> 'boolean' then
      raise exception 'Option % must be true or false.', v_key;
    end if;
    if v_type = 'string' and char_length(v_val #>> '{}') > 6000 then
      raise exception 'Option % is too long.', v_key;
    end if;
    if v_type = 'user' and not exists (
      select 1 from public.server_members
      where server_id = v_server and user_id::text = (v_val #>> '{}')
    ) then
      raise exception 'Option % must be a member of this space.', v_key;
    end if;
    if v_type = 'channel' and not exists (
      select 1 from public.channels where server_id = v_server and id::text = (v_val #>> '{}')
    ) then
      raise exception 'Option % must be a channel in this space.', v_key;
    end if;
    if jsonb_typeof(v_def -> 'choices') = 'array' and jsonb_array_length(v_def -> 'choices') > 0
       and not exists (select 1 from jsonb_array_elements(v_def -> 'choices') c where c -> 'value' = v_val) then
      raise exception 'Pick one of the choices for %.', v_key;
    end if;
  end loop;

  -- Every required option is there.
  for v_def in select d from jsonb_array_elements(v_cmd.options) d loop
    if coalesce((v_def ->> 'required')::boolean, false) and not (v_opts ? (v_def ->> 'name')) then
      raise exception 'Fill in %.', v_def ->> 'name';
    end if;
  end loop;

  insert into public.bot_interactions (bot_id, server_id, channel_id, user_id, type, command_name, options)
  values (p_bot_id, v_server, p_channel_id, auth.uid(), 'command', v_cmd.name, v_opts)
  returning * into v_row;

  insert into public.bot_events (bot_id, type, payload)
  values (p_bot_id, 'interactionCreate', public.bot_interaction_to_json(v_row));

  return v_row.id;
end;
$$;

revoke all on function public.invoke_bot_command(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.invoke_bot_command(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.press_bot_button(p_message_id uuid, p_custom_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages%rowtype;
  v_bot_id uuid;
  v_server uuid;
  v_row public.bot_interactions%rowtype;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;
  select id into v_bot_id from public.bots where user_id = v_msg.author_id;
  if v_bot_id is null then
    raise exception 'That button isn''t from a bot.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_msg.components, '[]'::jsonb)) r,
         jsonb_array_elements(coalesce(r -> 'components', '[]'::jsonb)) c
    where c ->> 'custom_id' = p_custom_id and not coalesce((c ->> 'disabled')::boolean, false)
  ) then
    raise exception 'That button can''t be pressed.';
  end if;

  v_server := public.bot_interaction_gate(v_bot_id, v_msg.channel_id);

  insert into public.bot_interactions (bot_id, server_id, channel_id, user_id, type, custom_id, message_id)
  values (v_bot_id, v_server, v_msg.channel_id, auth.uid(), 'component', p_custom_id, p_message_id)
  returning * into v_row;

  insert into public.bot_events (bot_id, type, payload)
  values (v_bot_id, 'interactionCreate', public.bot_interaction_to_json(v_row));

  return v_row.id;
end;
$$;

revoke all on function public.press_bot_button(uuid, text) from public, anon;
grant execute on function public.press_bot_button(uuid, text) to authenticated;

-- --- The bot answering -----------------------------------------------------------

-- p_update edits the message whose button was pressed instead of posting.
-- Up to 5 replies per interaction, within 15 minutes.
create or replace function public.bot_interaction_respond(
  p_bot_id uuid,
  p_interaction_id uuid,
  p_content text,
  p_embeds jsonb default null,
  p_components jsonb default null,
  p_update boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.bot_interactions%rowtype;
  v_bot public.bots%rowtype;
  v_msg public.messages%rowtype;
  v_user public.profiles%rowtype;
  v_has_embeds boolean := p_embeds is not null and jsonb_typeof(p_embeds) = 'array' and jsonb_array_length(p_embeds) > 0;
  v_has_components boolean := p_components is not null and jsonb_typeof(p_components) = 'array' and jsonb_array_length(p_components) > 0;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found or v_bot.revoked_at is not null or public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been revoked or restricted';
  end if;

  select * into v_i from public.bot_interactions where id = p_interaction_id and bot_id = p_bot_id for update;
  if not found then
    raise exception 'Interaction not found';
  end if;
  if v_i.expires_at < now() then
    raise exception 'This interaction has expired (15 minutes)';
  end if;
  if v_i.responses >= 5 then
    raise exception 'An interaction can be answered at most 5 times (rate limit)';
  end if;
  if not exists (select 1 from public.bot_grants where bot_id = p_bot_id and server_id = v_i.server_id)
     or not exists (select 1 from public.server_members where server_id = v_i.server_id and user_id = v_bot.user_id) then
    raise exception 'This bot is not a member of that server';
  end if;

  if (p_content is null or length(btrim(p_content)) = 0) and not v_has_embeds and not p_update then
    raise exception 'Message content is required';
  end if;
  if length(coalesce(p_content, '')) > 4000 then
    raise exception 'Message content is too long (max 4000 characters)';
  end if;
  if v_has_embeds and jsonb_array_length(p_embeds) > 10 then
    raise exception 'A message can have at most 10 embeds';
  end if;
  if v_has_components and jsonb_array_length(p_components) > 5 then
    raise exception 'A message can have at most 5 rows of components';
  end if;
  if btrim(coalesce(p_content, '')) ~* '@(everyone|here)\y'
     and not public.bot_has_server_permission(v_i.server_id, v_bot.user_id, 'mention_everyone') then
    raise exception 'This bot needs the mention_everyone permission to use @everyone';
  end if;

  update public.bot_interactions set responses = responses + 1 where id = v_i.id;

  perform set_config('disband.trusted_write', 'on', true);
  if p_update then
    if v_i.type <> 'component' or v_i.message_id is null then
      raise exception 'Only a button press can update its message';
    end if;
    update public.messages set
      content = case when p_content is null then content else btrim(p_content) end,
      embeds = case when p_embeds is null then embeds when v_has_embeds then p_embeds else null end,
      components = case when p_components is null then components when v_has_components then p_components else null end,
      edited_at = now()
    where id = v_i.message_id and author_id = v_bot.user_id
    returning * into v_msg;
    if not found then
      raise exception 'Message not found';
    end if;
  else
    select * into v_user from public.profiles where id = v_i.user_id;
    insert into public.messages (channel_id, author_id, content, embeds, components, interaction)
    values (v_i.channel_id, v_bot.user_id, btrim(coalesce(p_content, '')),
            case when v_has_embeds then p_embeds else null end,
            case when v_has_components then p_components else null end,
            jsonb_build_object(
              'id', v_i.id,
              'type', v_i.type,
              'name', v_i.command_name,
              'user_id', v_i.user_id,
              'username', v_user.username,
              'display_name', coalesce(v_user.display_name, v_user.username)
            ))
    returning * into v_msg;
  end if;
  perform set_config('disband.trusted_write', 'off', true);

  return public.bot_message_to_json(v_msg, v_i.server_id);
end;
$$;

revoke all on function public.bot_interaction_respond(uuid, uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.bot_interaction_respond(uuid, uuid, text, jsonb, jsonb, boolean) to service_role;

-- --- Delivery ----------------------------------------------------------------------

-- Interactions reach a bot that is still in the space, whatever its scopes:
-- a member asked it something directly. Message events keep the
-- messages.read and channel checks.
create or replace function public.take_bot_events(p_bot_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.take_bot_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_bot_events(uuid, integer) to service_role;
