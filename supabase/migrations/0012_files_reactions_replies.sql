-- Generic file attachments, replies, reactions, and message metadata

-- Attachment metadata + file type
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_size bigint;
alter table public.messages add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

alter table public.dm_messages add column if not exists attachment_name text;
alter table public.dm_messages add column if not exists attachment_size bigint;
alter table public.dm_messages add column if not exists reply_to_id uuid references public.dm_messages (id) on delete set null;
alter table public.dm_messages add column if not exists edited_at timestamptz;

alter table public.group_messages add column if not exists attachment_name text;
alter table public.group_messages add column if not exists attachment_size bigint;
alter table public.group_messages add column if not exists reply_to_id uuid references public.group_messages (id) on delete set null;
alter table public.group_messages add column if not exists edited_at timestamptz;

alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file'));

alter table public.dm_messages drop constraint if exists dm_messages_attachment_type_check;
alter table public.dm_messages add constraint dm_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file'));

alter table public.group_messages drop constraint if exists group_messages_attachment_type_check;
alter table public.group_messages add constraint group_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file'));

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);
create index if not exists dm_messages_reply_to_idx on public.dm_messages (reply_to_id);
create index if not exists group_messages_reply_to_idx on public.group_messages (reply_to_id);

-- Reactions (polymorphic across channel / dm / group messages)
create table if not exists public.message_reactions (
  id            uuid primary key default gen_random_uuid(),
  context_type  text not null check (context_type in ('channel', 'dm', 'group')),
  message_id    uuid not null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  emoji         text not null check (char_length(emoji) between 1 and 32),
  created_at    timestamptz not null default now(),
  unique (context_type, message_id, user_id, emoji)
);

create index if not exists message_reactions_lookup_idx
  on public.message_reactions (context_type, message_id);

alter table public.message_reactions enable row level security;

create or replace function public.can_view_message_reaction(p_context text, p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_context = 'channel' then
    return exists (
      select 1 from public.messages m
      join public.channels c on c.id = m.channel_id
      join public.server_members sm on sm.server_id = c.server_id and sm.user_id = auth.uid()
      where m.id = p_message_id
    );
  elsif p_context = 'dm' then
    return exists (
      select 1 from public.dm_messages dm
      join public.dm_threads t on t.id = dm.thread_id
      where dm.id = p_message_id and (t.user_a = auth.uid() or t.user_b = auth.uid())
    );
  elsif p_context = 'group' then
    return exists (
      select 1 from public.group_messages gm
      where gm.id = p_message_id and public.is_group_member(gm.group_id)
    );
  end if;
  return false;
end;
$$;

grant execute on function public.can_view_message_reaction(text, uuid) to authenticated;

create policy "message_reactions_select" on public.message_reactions for select to authenticated
  using (public.can_view_message_reaction(context_type, message_id));

create policy "message_reactions_insert" on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_message_reaction(context_type, message_id)
  );

create policy "message_reactions_delete_own" on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Group mention notifications
create or replace function public.notify_group_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid <> new.author_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        '/group/' || new.group_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists group_messages_mention_notify on public.group_messages;
create trigger group_messages_mention_notify
  after insert on public.group_messages
  for each row execute function public.notify_group_mentions();

-- Allow editing own messages in DMs and groups
drop policy if exists "dm_messages_update_own" on public.dm_messages;
create policy "dm_messages_update_own" on public.dm_messages for update to authenticated
  using (author_id = auth.uid());

drop policy if exists "group_messages_update_own" on public.group_messages;
create policy "group_messages_update_own" on public.group_messages for update to authenticated
  using (author_id = auth.uid());

-- Realtime for reactions
do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;
