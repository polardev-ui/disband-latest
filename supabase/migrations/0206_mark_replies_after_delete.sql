-- Deleting a batch of messages that reply to each other failed.
--
-- 0183's mark_replies_deleted ran BEFORE DELETE and updated the replies to
-- each deleted message. When a reply was in the same batch (banning someone
-- who had replied to themselves, which deletes all their messages in the
-- space in one statement), the trigger updated a row the statement was about
-- to delete, and Postgres stopped the whole thing: "tuple to be updated was
-- already modified by an operation triggered by the current command".
--
-- As an AFTER trigger it only sees replies that survive the statement. It
-- has to fire before the reply_to_id foreign key's ON DELETE SET NULL
-- (an internal "RI_ConstraintTrigger_a_*" trigger), or the link it matches
-- on is already gone. Triggers on the same event fire in name order, so the
-- name starts with an upper-case "A", which sorts before "R".
--
-- It also only touches the table the message was deleted from; the old
-- version updated all three on every delete.

create or replace function public.mark_replies_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'messages' then
    update public.messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  elsif tg_table_name = 'dm_messages' then
    update public.dm_messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  elsif tg_table_name = 'group_messages' then
    update public.group_messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  end if;
  return null;
end;
$$;

drop trigger if exists messages_mark_replies_deleted on public.messages;
drop trigger if exists "A_mark_replies_deleted" on public.messages;
create trigger "A_mark_replies_deleted"
  after delete on public.messages
  for each row execute function public.mark_replies_deleted();

drop trigger if exists dm_messages_mark_replies_deleted on public.dm_messages;
drop trigger if exists "A_mark_replies_deleted" on public.dm_messages;
create trigger "A_mark_replies_deleted"
  after delete on public.dm_messages
  for each row execute function public.mark_replies_deleted();

drop trigger if exists group_messages_mark_replies_deleted on public.group_messages;
drop trigger if exists "A_mark_replies_deleted" on public.group_messages;
create trigger "A_mark_replies_deleted"
  after delete on public.group_messages
  for each row execute function public.mark_replies_deleted();
