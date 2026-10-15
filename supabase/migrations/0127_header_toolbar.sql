-- ---------------------------------------------------------------------------
-- 0127: Header toolbar — full-text search + per-channel notification mute
--
-- Adds Postgres FTS (generated tsvector, GIN) + trigram fallback on every
-- message table, a security-invoker RPC `search_messages` that only returns
-- rows the caller can read, a matching count RPC, and per-channel/per-DM mute
-- settings with RLS.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

-- 1) Full-text columns -------------------------------------------------------
alter table public.messages
  add column if not exists search_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(content, ''))) stored;
create index if not exists messages_search_tsv_idx on public.messages using gin (search_tsv);
create index if not exists messages_search_trgm_idx on public.messages using gin (coalesce(content, '') gin_trgm_ops);

alter table public.dm_messages
  add column if not exists search_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(content, ''))) stored;
create index if not exists dm_messages_search_tsv_idx on public.dm_messages using gin (search_tsv);
create index if not exists dm_messages_search_trgm_idx on public.dm_messages using gin (coalesce(content, '') gin_trgm_ops);

alter table public.group_messages
  add column if not exists search_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(content, ''))) stored;
create index if not exists group_messages_search_tsv_idx on public.group_messages using gin (search_tsv);
create index if not exists group_messages_search_trgm_idx on public.group_messages using gin (coalesce(content, '') gin_trgm_ops);

-- 2) Per-channel notification settings --------------------------------------
create table if not exists public.channel_notification_settings (
  user_id   uuid not null references auth.users (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  level     text not null default 'all' check (level in ('all','mentions','nothing')),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.channel_notification_settings enable row level security;
drop policy if exists "cns_owner_all" on public.channel_notification_settings;
create policy "cns_owner_all" on public.channel_notification_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.dm_notification_settings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  thread_id  uuid not null references public.dm_threads (id) on delete cascade,
  level      text not null default 'all' check (level in ('all','mentions','nothing')),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
alter table public.dm_notification_settings enable row level security;
drop policy if exists "dns_owner_all" on public.dm_notification_settings;
create policy "dns_owner_all" on public.dm_notification_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) Search RPC -------------------------------------------------------------
create or replace function public.search_messages(
  p_query text default null,
  p_scope text default 'server',        -- 'server' | 'channel' | 'dm' | 'group'
  p_server_id uuid default null,
  p_container_id uuid default null,
  p_has text default null,             -- 'link' | 'image' | 'file' | null
  p_before date default null,
  p_after date default null,
  p_author_filter text default null,   -- username substring
  p_mention_filter text default null,  -- username substring
  p_sort text default 'newest',        -- 'newest' | 'oldest' | 'relevance'
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  message_id uuid,
  source_kind text,
  container_id uuid,
  author_id uuid,
  content text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
(
    select m.id as message_id,
           'channel'::text as source_kind,
           m.channel_id as container_id,
           m.author_id,
           coalesce(m.content,'') as content,
           m.created_at
    from public.messages m
    where (p_scope in ('server','channel'))
      and (p_scope = 'channel' or m.channel_id = any (coalesce(
            (select array_agg(c.id) from public.channels c where c.server_id = p_server_id and c.type = 'text'), array[]::uuid[])))
      and (p_scope <> 'channel' or m.channel_id = p_container_id)
      and (p_query is null or p_query = '' or m.search_tsv @@ plainto_tsquery('simple', p_query) or m.content ilike '%' || p_query || '%')
      and (p_has is null
           or (p_has = 'link' and m.content ilike '%http%')
           or (p_has = 'image' and m.attachment_type = 'image')
           or (p_has = 'file' and m.attachment_url is not null))
      and (p_before is null or m.created_at::date <= p_before)
      and (p_after is null or m.created_at::date >= p_after)
      and (p_author_filter is null or exists (select 1 from public.profiles pa where pa.id = m.author_id and pa.username ilike '%' || p_author_filter || '%'))
      and (p_mention_filter is null or m.content ilike '%' || p_mention_filter || '%')
  )
  union all
  (
    select dm.id as message_id,
           'dm'::text as source_kind,
           dm.thread_id as container_id,
           dm.author_id,
           coalesce(dm.content,'') as content,
           dm.created_at
    from public.dm_messages dm
    where p_scope = 'dm'
      and dm.thread_id = p_container_id
      and (p_query is null or p_query = '' or dm.search_tsv @@ plainto_tsquery('simple', p_query) or dm.content ilike '%' || p_query || '%')
      and (p_has is null
           or (p_has = 'link' and dm.content ilike '%http%')
           or (p_has = 'image' and dm.attachment_type = 'image')
           or (p_has = 'file' and dm.attachment_url is not null))
      and (p_before is null or dm.created_at::date <= p_before)
      and (p_after is null or dm.created_at::date >= p_after)
      and (p_author_filter is null or exists (select 1 from public.profiles pa where pa.id = dm.author_id and pa.username ilike '%' || p_author_filter || '%'))
      and (p_mention_filter is null or dm.content ilike '%' || p_mention_filter || '%')
  )
  union all
  (
    select gm.id as message_id,
           'group'::text as source_kind,
           gm.group_id as container_id,
           gm.author_id,
           coalesce(gm.content,'') as content,
           gm.created_at
    from public.group_messages gm
    where p_scope = 'group'
      and gm.group_id = p_container_id
      and (p_query is null or p_query = '' or gm.search_tsv @@ plainto_tsquery('simple', p_query) or gm.content ilike '%' || p_query || '%')
      and (p_has is null
           or (p_has = 'link' and gm.content ilike '%http%')
           or (p_has = 'image' and gm.attachment_type = 'image')
           or (p_has = 'file' and gm.attachment_url is not null))
      and (p_before is null or gm.created_at::date <= p_before)
      and (p_after is null or gm.created_at::date >= p_after)
      and (p_author_filter is null or exists (select 1 from public.profiles pa where pa.id = gm.author_id and pa.username ilike '%' || p_author_filter || '%'))
      and (p_mention_filter is null or gm.content ilike '%' || p_mention_filter || '%')
  )
) u
  order by
    case when p_sort = 'oldest' then created_at end asc nulls last,
    case when p_sort = 'oldest' then 0 end,
    created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.count_search_messages(
  p_query text default null,
  p_scope text default 'server',
  p_server_id uuid default null,
  p_container_id uuid default null,
  p_has text default null,
  p_before date default null,
  p_after date default null,
  p_author_filter text default null,
  p_mention_filter text default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*)::bigint from public.messages m
      where (p_scope in ('server','channel'))
        and (p_scope = 'channel' or m.channel_id = any (coalesce((select array_agg(c.id) from public.channels c where c.server_id = p_server_id and c.type = 'text'), array[]::uuid[])))
        and (p_scope <> 'channel' or m.channel_id = p_container_id)
        and (p_query is null or p_query = '' or m.search_tsv @@ plainto_tsquery('simple', p_query) or m.content ilike '%' || p_query || '%')
        and (p_has is null or (p_has = 'link' and m.content ilike '%http%') or (p_has = 'image' and m.attachment_type = 'image') or (p_has = 'file' and m.attachment_url is not null))
        and (p_before is null or m.created_at::date <= p_before)
        and (p_after is null or m.created_at::date >= p_after)
        and (p_author_filter is null or exists (select 1 from public.profiles pa where pa.id = m.author_id and pa.username ilike '%' || p_author_filter || '%'))
        and (p_mention_filter is null or m.content ilike '%' || p_mention_filter || '%')
      )
    + (select count(*)::bigint from public.dm_messages dm
        where p_scope = 'dm' and dm.thread_id = p_container_id
          and (p_query is null or p_query = '' or dm.search_tsv @@ plainto_tsquery('simple', p_query) or dm.content ilike '%' || p_query || '%')
          and (p_before is null or dm.created_at::date <= p_before)
          and (p_after is null or dm.created_at::date >= p_after))
    + (select count(*)::bigint from public.group_messages gm
        where p_scope = 'group' and gm.group_id = p_container_id
          and (p_query is null or p_query = '' or gm.search_tsv @@ plainto_tsquery('simple', p_query) or gm.content ilike '%' || p_query || '%')
          and (p_before is null or gm.created_at::date <= p_before)
          and (p_after is null or gm.created_at::date >= p_after));
$$;
