-- ---------------------------------------------------------------------------
-- 0114: Fix @everyone detection in Postgres regex (\b -> \y)
--
-- In PostgreSQL's regex engine, \b is BACKSPACE, not a word boundary (word
-- boundaries are \y, \m, \M). Every SQL check written with a PCRE/JavaScript
-- habit silently never matched real text:
--
--   * notify_mentions looked for '@everyone\b', so the everyone-expansion
--     never ran: an @everyone ping notified nobody beyond the client-resolved
--     mentions array (which deliberately skips the token). In a 4,826-member
--     server that meant zero notifications from the expansion path.
--   * bot_send_message's mention_everyone gate looked for
--     '@(everyone|here)\b', so it never fired either — but fail-open: bots
--     could @everyone without the permission.
--
-- Both bodies below are byte-identical copies of the live functions except
-- for that one character, verified by diff at authoring time. Client-side
-- (JS) regexes are unaffected: in JavaScript \b IS a word boundary.
-- ---------------------------------------------------------------------------

create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
  mentioned uuid[];
  v_server uuid;
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  select server_id into v_server from public.channels where id = new.channel_id;

  mentioned := coalesce(new.mentions, array[]::uuid[]);

  if new.content ~* '@everyone\y' then
    select coalesce(array_agg(distinct member_id), array[]::uuid[]) into mentioned
    from (
      select unnest(mentioned) as member_id
      union
      select sm.user_id
      from public.server_members sm
      where sm.server_id = v_server
        and sm.user_id <> new.author_id
    ) expanded;
  end if;

  foreach uid in array mentioned loop
    -- Only notify actual members of the server (prevents notifying arbitrary users).
    if uid is not null
       and uid <> new.author_id
       and exists (select 1 from public.server_members sm where sm.server_id = v_server and sm.user_id = uid)
    then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        'channel:' || new.channel_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;

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

  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'Message content is required';
  end if;
  if length(p_content) > 4000 then
    raise exception 'Message content is too long (max 4000 characters)';
  end if;

  if btrim(p_content) ~* '@(everyone|here)\y'
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
