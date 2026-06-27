-- 0026_push_triggers.sql
-- Fires a push (via the send-push edge function) on events directed at a user:
-- new DMs, new group messages, channel @mentions, and friend requests.
--
-- Setup (run once, NOT in this migration so the secret isn't committed):
--   alter database postgres set app.webhook_secret = '<same value as WEBHOOK_SECRET>';
-- Requires the pg_net extension (available on Supabase).

create extension if not exists pg_net;

-- Central helper: POST to the edge function. Errors are swallowed so a push
-- failure can never block the underlying insert.
create or replace function public.notify_push(p_user_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text := current_setting('app.webhook_secret', true);
begin
  if p_user_id is null then return; end if;
  perform net.http_post(
    url := 'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object('user_id', p_user_id, 'title', p_title, 'body', p_body)
  );
exception when others then
  -- never block the insert on a push problem
  null;
end;
$$;

-- Direct messages → notify the other participant
create or replace function public.on_dm_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient uuid; sender text;
begin
  select case when user_a = new.author_id then user_b else user_a end
    into recipient from public.dm_threads where id = new.thread_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  perform public.notify_push(recipient, sender,
    coalesce(nullif(new.content, ''), 'Sent an attachment'));
  return new;
end; $$;

drop trigger if exists trg_dm_message_push on public.dm_messages;
create trigger trg_dm_message_push after insert on public.dm_messages
  for each row execute function public.on_dm_message_push();

-- Group messages → notify every other member
create or replace function public.on_group_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; sender text; rec record;
begin
  select name into gname from public.group_chats where id = new.group_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  for rec in select user_id from public.group_chat_members
             where group_id = new.group_id and user_id <> new.author_id loop
    perform public.notify_push(rec.user_id, gname,
      sender || ': ' || coalesce(nullif(new.content, ''), 'attachment'));
  end loop;
  return new;
end; $$;

drop trigger if exists trg_group_message_push on public.group_messages;
create trigger trg_group_message_push after insert on public.group_messages
  for each row execute function public.on_group_message_push();

-- Channel messages → notify only @mentioned users
create or replace function public.on_channel_mention_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender text; uid uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then return new; end if;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid <> new.author_id then
      perform public.notify_push(uid, 'New mention', sender || ' mentioned you');
    end if;
  end loop;
  return new;
end; $$;

drop trigger if exists trg_channel_mention_push on public.messages;
create trigger trg_channel_mention_push after insert on public.messages
  for each row execute function public.on_channel_mention_push();

-- Friend requests → notify the addressee
create or replace function public.on_friend_request_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender text;
begin
  if new.status <> 'pending' then return new; end if;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.requester_id;
  perform public.notify_push(new.addressee_id, 'Friend request',
    sender || ' sent you a friend request');
  return new;
end; $$;

drop trigger if exists trg_friend_request_push on public.friendships;
create trigger trg_friend_request_push after insert on public.friendships
  for each row execute function public.on_friend_request_push();
