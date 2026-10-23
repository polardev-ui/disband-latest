-- ---------------------------------------------------------------------------
-- 0161: Instant message delivery over Realtime Broadcast
--
-- Postgres Changes is fed by the Realtime server's CDC poll, which runs about
-- once a second. That made a healthy live channel still feel a second late.
-- This migration mirrors each new message onto a private Broadcast topic from
-- a database trigger, so subscribed clients receive it as soon as the insert
-- commits. Postgres Changes stays in place as the durable fallback.
--
-- Topics:
--   messages:ch:<channel_id>
--   messages:dm:<thread_id>
--   messages:group:<group_id>
--
-- Receive authorization is an RLS policy on realtime.messages: the same
-- membership checks the message tables already use. There is deliberately no
-- INSERT policy for these topics, so clients cannot forge a broadcast; the
-- trigger is the only sender.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_topic text;
  v_author jsonb;
begin
  if tg_table_name = 'messages' then
    v_topic := 'messages:ch:' || new.channel_id::text;
  elsif tg_table_name = 'dm_messages' then
    v_topic := 'messages:dm:' || new.thread_id::text;
  elsif tg_table_name = 'group_messages' then
    v_topic := 'messages:group:' || new.group_id::text;
  else
    return new;
  end if;

  begin
    if new.author_id is not null then
      select to_jsonb(p) into v_author
      from public.profiles p
      where p.id = new.author_id;
    end if;

    perform realtime.send(
      jsonb_build_object('record', to_jsonb(new), 'author', v_author),
      'INSERT',
      v_topic,
      true
    );
  exception when others then
    -- A broadcast failure must never roll back the message itself. The CDC
    -- path and the client catch-up poll still deliver it.
    null;
  end;

  return new;
end;
$$;

revoke all on function public.broadcast_chat_message() from public;

drop trigger if exists broadcast_chat_message on public.messages;
create trigger broadcast_chat_message
after insert on public.messages
for each row execute function public.broadcast_chat_message();

drop trigger if exists broadcast_chat_message on public.dm_messages;
create trigger broadcast_chat_message
after insert on public.dm_messages
for each row execute function public.broadcast_chat_message();

drop trigger if exists broadcast_chat_message on public.group_messages;
create trigger broadcast_chat_message
after insert on public.group_messages
for each row execute function public.broadcast_chat_message();

drop policy if exists chat_message_broadcast_read on realtime.messages;
create policy chat_message_broadcast_read
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and public.auth_aal_allows_access()
  and (
    case
      when realtime.topic() like 'messages:ch:%'
        and pg_catalog.pg_input_is_valid(split_part(realtime.topic(), ':', 3), 'uuid')
        then public.channel_user_can_view(split_part(realtime.topic(), ':', 3)::uuid)
      when realtime.topic() like 'messages:dm:%'
        and pg_catalog.pg_input_is_valid(split_part(realtime.topic(), ':', 3), 'uuid')
        then exists (
          select 1
          from public.dm_threads d
          where d.id = split_part(realtime.topic(), ':', 3)::uuid
            and (d.user_a = (select auth.uid()) or d.user_b = (select auth.uid()))
        )
      when realtime.topic() like 'messages:group:%'
        and pg_catalog.pg_input_is_valid(split_part(realtime.topic(), ':', 3), 'uuid')
        then exists (
          select 1
          from public.group_chat_members gm
          where gm.group_id = split_part(realtime.topic(), ':', 3)::uuid
            and gm.user_id = (select auth.uid())
        )
      else false
    end
  )
);
