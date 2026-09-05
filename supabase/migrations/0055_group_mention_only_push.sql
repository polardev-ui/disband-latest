-- 0055_group_mention_only_push.sql
-- Group chat push policy: @mentions only.
--
-- Previously every message in a group pushed every other member, so a busy
-- group flooded each participant's phone and desktop with one notification
-- per message, and threads the user had already read kept "coming back" as
-- new messages arrived. Group chatter is now surfaced through unread badges
-- and in-app realtime; pushes fire only for members actually mentioned
-- (@username, or @everyone which the client expands into member ids inside
-- `mentions`).

create or replace function public.on_group_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; sender text; uid uuid;
begin
  if new.mentions is null or coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  select name into gname from public.group_chats where id = new.group_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid <> new.author_id then
      perform public.notify_push(uid, gname, sender || ' mentioned you',
        new.group_id::text);
    end if;
  end loop;
  return new;
end; $$;