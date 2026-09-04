-- 0049_chat_read_state.sql
-- Server-authoritative per-user read cursors for DMs and group chats.
--
-- Background: unread badges were previously computed purely client-side from
-- realtime INSERTs received while the app was open. That meant:
--   * messages arriving while the app was closed / suspended were missed
--     (badge showed 0 even though the messages were pushed),
--   * reading on one device never cleared the badge on another.
--
-- This migration adds a single source of truth: DM cursors in a new table and
-- group cursors on the membership row, updated via RPCs scoped to the caller.

-- ============================================================================
-- DMs: per-user read cursor
-- ============================================================================
create table if not exists public.dm_thread_reads (
  thread_id    uuid not null references public.dm_threads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.dm_thread_reads enable row level security;

-- Users may only touch their own read cursor.
drop policy if exists "dm_thread_reads_select_own" on public.dm_thread_reads;
create policy "dm_thread_reads_select_own" on public.dm_thread_reads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "dm_thread_reads_insert_own" on public.dm_thread_reads;
create policy "dm_thread_reads_insert_own" on public.dm_thread_reads
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "dm_thread_reads_update_own" on public.dm_thread_reads;
create policy "dm_thread_reads_update_own" on public.dm_thread_reads
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.dm_thread_reads to authenticated;
grant all on public.dm_thread_reads to service_role;

-- ============================================================================
-- Groups: add a per-member read cursor column
-- ============================================================================
alter table public.group_chat_members
  add column if not exists last_read_at timestamptz;

-- ============================================================================
-- Realtime: let clients see cross-device read changes live.
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.dm_thread_reads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_chat_members;
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- RPC: unread DMs for the calling user
-- ============================================================================
create or replace function public.get_dm_unread()
returns table (
  thread_id    uuid,
  unread_count bigint,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select
      t.id,
      count(m.id)::bigint as unread_count,
      r.last_read_at
    from public.dm_threads t
    left join public.dm_thread_reads r
      on r.thread_id = t.id and r.user_id = me
    left join public.dm_messages m
      on m.thread_id = t.id
     and m.author_id <> me
     and (r.last_read_at is null or m.created_at > r.last_read_at)
    where me in (t.user_a, t.user_b)
    group by t.id, r.last_read_at;
end;
$$;

grant execute on function public.get_dm_unread() to authenticated;

-- ============================================================================
-- RPC: mark a DM read for the calling user
-- ============================================================================
create or replace function public.mark_dm_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  -- Only allow marking a thread you actually belong to.
  if not exists (
    select 1 from public.dm_threads
    where id = p_thread_id and me in (user_a, user_b)
  ) then
    return;
  end if;
  insert into public.dm_thread_reads (thread_id, user_id, last_read_at)
  values (p_thread_id, me, now())
  on conflict (thread_id, user_id)
  do update set last_read_at = now();
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ============================================================================
-- RPC: unread group messages for the calling user
-- ============================================================================
create or replace function public.get_group_unread()
returns table (
  group_id     uuid,
  unread_count bigint,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select
      mem.group_id,
      count(gm.id)::bigint as unread_count,
      mem.last_read_at
    from public.group_chat_members mem
    left join public.group_messages gm
      on gm.group_id = mem.group_id
     and gm.author_id <> me
     and (mem.last_read_at is null or gm.created_at > mem.last_read_at)
    where mem.user_id = me
    group by mem.group_id, mem.last_read_at;
end;
$$;

grant execute on function public.get_group_unread() to authenticated;

-- ============================================================================
-- RPC: mark a group chat read for the calling user
-- ============================================================================
create or replace function public.mark_group_read(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_chat_members
     set last_read_at = now()
   where group_id = p_group_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_group_read(uuid) to authenticated;
