-- 0183: preserve replies when the original message is deleted.
--
-- Previously reply_to_id was nulled on delete (on delete set null), which
-- made the reply quote disappear. Keep a flag so the client can render
-- "Original message was deleted" instead of dropping the quote.

alter table public.messages
  add column if not exists reply_to_deleted boolean not null default false;
alter table public.dm_messages
  add column if not exists reply_to_deleted boolean not null default false;
alter table public.group_messages
  add column if not exists reply_to_deleted boolean not null default false;

create or replace function public.mark_replies_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  update public.dm_messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  update public.group_messages set reply_to_id = null, reply_to_deleted = true where reply_to_id = old.id;
  return old;
end;
$$;

drop trigger if exists messages_mark_replies_deleted on public.messages;
create trigger messages_mark_replies_deleted
  before delete on public.messages
  for each row execute function public.mark_replies_deleted();

drop trigger if exists dm_messages_mark_replies_deleted on public.dm_messages;
create trigger dm_messages_mark_replies_deleted
  before delete on public.dm_messages
  for each row execute function public.mark_replies_deleted();

drop trigger if exists group_messages_mark_replies_deleted on public.group_messages;
create trigger group_messages_mark_replies_deleted
  before delete on public.group_messages
  for each row execute function public.mark_replies_deleted();