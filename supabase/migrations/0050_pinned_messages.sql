-- ---------------------------------------------------------------------------
-- 0050 — Pinned messages (DMs, group chats, and server channels)
--
-- A pinned message is a lightweight reference + snapshot pointing at a row in
-- the source's message table. The source is polymorphic:
--   source_type = 'dm'      | source_id -> dm_threads.id
--                = 'group'  | source_id -> group_chats.id
--                = 'channel'| source_id -> channels.id
--
-- The table itself is fully RLS-locked: all access goes through the
-- security-definer RPCs below, which validate that the caller is a participant
-- in the source conversation before pin/list/unpin.
-- ---------------------------------------------------------------------------

create table if not exists public.pinned_messages (
  id          uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('dm', 'group', 'channel')),
  source_id   uuid not null,
  message_id  uuid not null,
  content     text not null default '',
  author_id   uuid not null references public.profiles (id) on delete cascade,
  pinner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (source_type, source_id, message_id)
);

create index if not exists pinned_messages_source_idx
  on public.pinned_messages (source_type, source_id, created_at desc);

alter table public.pinned_messages enable row level security;

-- No direct-policy access (locked). Everything is gated by the RPCs.

-- ---------------------------------------------------------------------------
-- Internal helper: is uid a participant of the given source conversation?
-- ---------------------------------------------------------------------------
create or replace function public.pinned_is_participant(p_source_type text, p_source_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case p_source_type
    when 'dm' then exists (
      select 1 from public.dm_threads t
      where t.id = p_source_id and (t.user_a = p_uid or t.user_b = p_uid)
    )
    when 'group' then exists (
      select 1 from public.group_chat_members m
      where m.group_id = p_source_id and m.user_id = p_uid
    )
    when 'channel' then exists (
      select 1 from public.channels ch
      where ch.id = p_source_id and public.is_server_member(ch.server_id)
    )
    else false
  end;
$$;

grant execute on function public.pinned_is_participant(text, uuid, uuid) to authenticated;

-- Internal helper: does a message with the given id actually belong to the
-- source conversation? Prevents pinning a message from a different chat.
create or replace function public.pinned_message_in_source(
  p_source_type text, p_source_id uuid, p_message_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case p_source_type
    when 'dm' then exists (
      select 1 from public.dm_messages m
      where m.id = p_message_id and m.thread_id = p_source_id
    )
    when 'group' then exists (
      select 1 from public.group_messages m
      where m.id = p_message_id and m.group_id = p_source_id
    )
    when 'channel' then exists (
      select 1 from public.messages m
      where m.id = p_message_id and m.channel_id = p_source_id
    )
    else false
  end;
$$;

grant execute on function public.pinned_message_in_source(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- pin_message — idempotently pin a message.
-- ---------------------------------------------------------------------------
create or replace function public.pin_message(
  p_source_type text,
  p_source_id   uuid,
  p_message_id  uuid,
  p_content     text default '',
  p_author_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_resolved_author uuid := coalesce(p_author_id, v_uid);
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.pinned_is_participant(p_source_type, p_source_id, v_uid) then
    raise exception 'You are not a member of this conversation';
  end if;

  if not public.pinned_message_in_source(p_source_type, p_source_id, p_message_id) then
    raise exception 'Message does not belong to this conversation';
  end if;

  insert into public.pinned_messages
    (source_type, source_id, message_id, content, author_id, pinner_id)
  values
    (p_source_type, p_source_id, p_message_id, p_content, v_resolved_author, v_uid)
  on conflict (source_type, source_id, message_id) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id
    from public.pinned_messages
    where source_type = p_source_type and source_id = p_source_id and message_id = p_message_id;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.pin_message(text, uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unpin_message — any participant can unpin any pinned message.
-- ---------------------------------------------------------------------------
create or replace function public.unpin_message(
  p_source_type text,
  p_source_id   uuid,
  p_message_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.pinned_is_participant(p_source_type, p_source_id, v_uid) then
    raise exception 'You are not a member of this conversation';
  end if;

  delete from public.pinned_messages
  where source_type = p_source_type
    and source_id = p_source_id
    and message_id = p_message_id;
end;
$$;

grant execute on function public.unpin_message(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_pinned_messages — list pins for a source the caller participates in.
-- ---------------------------------------------------------------------------
create or replace function public.get_pinned_messages(
  p_source_type text,
  p_source_id   uuid
)
returns table (
  id          uuid,
  message_id  uuid,
  content     text,
  author_id   uuid,
  pinner_id   uuid,
  created_at  timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select pm.id, pm.message_id, pm.content, pm.author_id, pm.pinner_id, pm.created_at
  from public.pinned_messages pm
  where pm.source_type = p_source_type
    and pm.source_id = p_source_id
    and public.pinned_is_participant(p_source_type, p_source_id, auth.uid())
  order by pm.created_at desc;
$$;

grant execute on function public.get_pinned_messages(text, uuid) to authenticated;