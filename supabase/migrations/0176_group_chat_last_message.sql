-- 0176: track last message time on group chats so they sort like DMs.
alter table public.group_chats
  add column if not exists last_message_at timestamptz;

-- Backfill from existing messages.
update public.group_chats g
set last_message_at = (
  select max(created_at) from public.group_messages m where m.group_id = g.id
);

create or replace function public.update_group_chat_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.group_chats set last_message_at = new.created_at where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists group_messages_last_activity on public.group_messages;
create trigger group_messages_last_activity
  after insert on public.group_messages
  for each row execute function public.update_group_chat_last_message();