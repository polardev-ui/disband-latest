-- ---------------------------------------------------------------------------
-- 0159: persistent mention badges for servers and channels.
--
-- Mention badges used to be incremented only from realtime INSERTs, so a
-- mention that arrived while the app was closed disappeared on the next open.
-- The notifications table already holds one row per mention (including the
-- @everyone roster expansion) and is the durable source of truth.
--
-- These functions expose the caller's unread channel mentions in one indexed
-- call, and clear them when the channel is actually opened.
-- ---------------------------------------------------------------------------

create index if not exists notifications_unread_mentions_idx
  on public.notifications (user_id, created_at desc)
  where read = false and type = 'mention';

create or replace function public.get_channel_mention_unread()
returns table (
  channel_id uuid,
  server_id uuid,
  mention_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.server_id, count(*)::bigint
  from public.notifications n
  join public.channels c on n.link = 'channel:' || c.id::text
  join public.server_members sm
    on sm.server_id = c.server_id
   and sm.user_id = auth.uid()
  where n.user_id = auth.uid()
    and n.type = 'mention'
    and n.read = false
  group by c.id, c.server_id;
$$;

revoke all on function public.get_channel_mention_unread() from public, anon;
grant execute on function public.get_channel_mention_unread() to authenticated;

create or replace function public.mark_channel_mentions_read(p_channel_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
       set read = true
     where user_id = auth.uid()
       and type = 'mention'
       and read = false
       and link = 'channel:' || p_channel_id::text
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.mark_channel_mentions_read(uuid) from public, anon;
grant execute on function public.mark_channel_mentions_read(uuid) to authenticated;
