-- Mass pings are checked by the database, not only by the apps.
--
-- The apps offer @everyone and role pings only to people with the
-- mention_everyone permission, but nothing behind them checked. A message's
-- `mentions` list is written by the client, so a modified client could list
-- every member (a fake role ping) or anyone at all, and each one got a
-- notification and a push; `@everyone` was fanned out for whoever typed it.
--
-- Now, before a channel message is saved:
--   * mentions keep only members of the space;
--   * without mention_everyone, they keep only people named in the text
--     (@username or @display name) and the author of the message replied to,
--     which is what an ordinary ping is;
-- and @everyone is fanned out only for someone with the permission.
--
-- Trusted writes (bots and webhooks, which set disband.trusted_write) are
-- left as they are; their routes check permissions themselves.

create or replace function public.sanitize_message_mentions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_server uuid;
  v_can_mass boolean;
  v_reply_author uuid;
  v_text text := lower(coalesce(new.content, ''));
begin
  if coalesce(current_setting('disband.trusted_write', true), '') = 'on' then
    return new;
  end if;
  if coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.mentions is not distinct from old.mentions
     and new.content is not distinct from old.content then
    return new;
  end if;

  select server_id into v_server from public.channels where id = new.channel_id;
  if v_server is null then
    new.mentions := '{}';
    return new;
  end if;

  v_can_mass := public.user_has_server_permission(v_server, new.author_id, 'mention_everyone');
  if new.reply_to_id is not null then
    select author_id into v_reply_author from public.messages where id = new.reply_to_id;
  end if;

  select coalesce(array_agg(distinct m.uid), '{}') into new.mentions
  from unnest(new.mentions) as m(uid)
  join public.server_members sm on sm.server_id = v_server and sm.user_id = m.uid
  join public.profiles p on p.id = m.uid
  where v_can_mass
     or m.uid = v_reply_author
     or (p.username is not null and position('@' || lower(p.username) in v_text) > 0)
     or (p.display_name is not null and position('@' || lower(p.display_name) in v_text) > 0);

  return new;
end;
$function$;

drop trigger if exists messages_sanitize_mentions on public.messages;
create trigger messages_sanitize_mentions
  before insert or update of mentions, content on public.messages
  for each row execute function public.sanitize_message_mentions();

create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  author_name text;
  v_server uuid;
  v_named uuid[];
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  select server_id into v_server from public.channels where id = new.channel_id;
  if v_server is null then
    return new;
  end if;

  select coalesce(array_agg(distinct sm.user_id), '{}') into v_named
  from public.server_members sm
  where sm.server_id = v_server
    and sm.user_id = any (coalesce(new.mentions, '{}'::uuid[]))
    and sm.user_id <> new.author_id;

  insert into public.notifications (user_id, type, title, body, link)
  select u, 'mention', author_name || ' mentioned you', left(new.content, 200), 'channel:' || new.channel_id::text
  from unnest(v_named) u;

  -- @everyone reaches the whole space only from someone allowed to send it.
  if new.content ~* '@everyone\y'
     and public.user_has_server_permission(v_server, new.author_id, 'mention_everyone') then
    insert into public.mention_fanout (message_id, channel_id, server_id, author_id, author_name, body, skip_ids)
    values (new.id, new.channel_id, v_server, new.author_id, author_name, left(new.content, 200), v_named);
  end if;
  return new;
end;
$function$;
