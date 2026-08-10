-- Track the latest message per DM thread so the DM list can sort by recency and
-- show a live preview, even after a cold start (no client-side state).

alter table public.dm_threads
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text;

-- Updates the thread as messages arrive. `security definer` because
-- dm_threads only exposes SELECT/INSERT to participants — the trigger still
-- only ever touches the row that was just messaged.
create or replace function public.set_dm_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at,
         last_message_preview = left(case when new.content = '' then 'Attachment' else new.content end, 200)
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists dm_thread_last_message_insert on public.dm_messages;
create trigger dm_thread_last_message_insert
  after insert on public.dm_messages
  for each row execute function public.set_dm_thread_last_message();

-- Backfill from existing messages.
update public.dm_threads t
   set last_message_at = latest.created_at,
       last_message_preview = left(case when latest.content = '' then 'Attachment' else latest.content end, 200)
  from lateral (
    select created_at, content
      from public.dm_messages
     where thread_id = t.id
     order by created_at desc
     limit 1
  ) latest;
