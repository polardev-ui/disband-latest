-- 0091_badge_count.sql
-- One number for the app icon badge.
--
-- The clients each keep their own unread state while they are running, but a
-- phone with the app closed has none: the count has to travel in the APNs
-- payload, so the push sender needs to be able to ask for it.
--
-- What counts, matching what the web and desktop clients badge:
--   * unread direct messages
--   * unread group-chat messages
--   * unread server mentions
--
-- Mentions that point at a DM or a group chat are NOT added, because those
-- conversations are already counted above; adding both would double every
-- ping. Channel unread state has no server-side read marker at all, so plain
-- channel traffic is deliberately absent — it is a dot in the clients, never a
-- number, and a number is all a push payload can carry.
--
-- Service-role only: this reads another user's unread state, so execute is
-- revoked from anon and authenticated.

create or replace function public.badge_count_for(p_user uuid)
returns integer
language sql
security definer
stable
set search_path to 'public'
as $$
  select coalesce((
    select count(*)
      from public.dm_threads t
      left join public.dm_thread_reads r
        on r.thread_id = t.id and r.user_id = p_user
      join public.dm_messages m
        on m.thread_id = t.id
       and m.author_id <> p_user
       and (r.last_read_at is null or m.created_at > r.last_read_at)
     where p_user in (t.user_a, t.user_b)
  ), 0)
  + coalesce((
    select count(*)
      from public.group_chat_members mem
      join public.group_messages gm
        on gm.group_id = mem.group_id
       and gm.author_id <> p_user
       and (mem.last_read_at is null or gm.created_at > mem.last_read_at)
     where mem.user_id = p_user
  ), 0)
  + coalesce((
    select count(*)
      from public.notifications n
     where n.user_id = p_user
       and n.type = 'mention'
       and n.read = false
       -- Already counted as a DM or group message above.
       and coalesce(n.link, '') not like 'dm:%'
       and coalesce(n.link, '') not like 'group:%'
  ), 0);
$$;

revoke all on function public.badge_count_for(uuid) from public, anon, authenticated;
grant execute on function public.badge_count_for(uuid) to service_role;

comment on function public.badge_count_for(uuid) is
  'Unread DMs + group messages + server mentions, for the app icon badge in push payloads.';
