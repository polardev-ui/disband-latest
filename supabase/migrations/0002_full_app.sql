-- Disband — full application schema (servers, friends, messages, voice, DMs)
-- Apply after 0001_init.sql

-- ---------------------------------------------------------------------------
-- Extend profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists status text not null default 'online'
    check (status in ('online', 'idle', 'dnd', 'offline')),
  add column if not exists banner_url text,
  add column if not exists accent_color text default '#5865f2';

create index if not exists profiles_username_idx on public.profiles (username);

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------
-- Servers & members
-- ---------------------------------------------------------------------------
create table if not exists public.servers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  icon_url    text,
  banner_url  text,
  description text,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member'
              check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index if not exists server_members_user_idx on public.server_members (user_id);

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
create table if not exists public.channel_categories (
  id        uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name      text not null,
  position  int not null default 0
);

create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers (id) on delete cascade,
  category_id uuid references public.channel_categories (id) on delete set null,
  name        text not null,
  type        text not null check (type in ('text', 'voice')),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists channels_server_idx on public.channels (server_id);

-- ---------------------------------------------------------------------------
-- Messages (server channels)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '',
  attachment_url  text,
  attachment_type text check (attachment_type in ('image', 'video')),
  attachment_key  text,
  mentions        uuid[] not null default '{}',
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------
create table if not exists public.dm_threads (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table if not exists public.dm_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.dm_threads (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '',
  attachment_url  text,
  attachment_type text check (attachment_type in ('image', 'video')),
  attachment_key  text,
  mentions        uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Voice presence
-- ---------------------------------------------------------------------------
create table if not exists public.voice_presence (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RPC: create server with default channels
-- ---------------------------------------------------------------------------
create or replace function public.create_server(
  p_name text,
  p_icon_url text default null,
  p_banner_url text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  c_info uuid;
  c_text uuid;
  c_voice uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.servers (name, icon_url, banner_url, description, owner_id)
  values (p_name, p_icon_url, p_banner_url, p_description, auth.uid())
  returning id into v_id;

  insert into public.server_members (server_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'INFO', 0) returning id into c_info;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'TEXT CHANNELS', 1) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'VOICE CHANNELS', 2) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_info, 'welcome', 'text', 0),
    (v_id, c_info, 'rules', 'text', 1),
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_voice, 'Lounge', 'voice', 0);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: delete server (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.delete_server(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.servers
    where id = p_server_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the server owner can delete this server';
  end if;
  delete from public.servers where id = p_server_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get or create DM thread with a friend
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_dm_thread(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_thread uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_friend_id = auth.uid() then raise exception 'Cannot DM yourself'; end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = p_friend_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_friend_id)
      )
  ) then
    raise exception 'You must be friends to start a DM';
  end if;

  v_a := least(auth.uid(), p_friend_id);
  v_b := greatest(auth.uid(), p_friend_id);

  select id into v_thread from public.dm_threads where user_a = v_a and user_b = v_b;
  if v_thread is null then
    insert into public.dm_threads (user_a, user_b) values (v_a, v_b) returning id into v_thread;
  end if;
  return v_thread;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: notify mentioned users
-- ---------------------------------------------------------------------------
create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  foreach uid in array new.mentions loop
    if uid is not null and uid <> new.author_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        'channel:' || new.channel_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_mentions
  after insert on public.messages
  for each row execute function public.notify_mentions();

create or replace function public.notify_dm_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid;
  author_name text;
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid is not null and uid <> new.author_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (uid, 'mention', author_name || ' mentioned you', left(new.content, 200), 'dm:' || new.thread_id::text);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists dm_messages_notify_mentions on public.dm_messages;
create trigger dm_messages_notify_mentions
  after insert on public.dm_messages
  for each row execute function public.notify_dm_mentions();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.friendships      enable row level security;
alter table public.servers          enable row level security;
alter table public.server_members   enable row level security;
alter table public.channel_categories enable row level security;
alter table public.channels         enable row level security;
alter table public.messages         enable row level security;
alter table public.dm_threads       enable row level security;
alter table public.dm_messages      enable row level security;
alter table public.voice_presence   enable row level security;
alter table public.notifications    enable row level security;

-- Friendships
create policy "friendships_select_own" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "friendships_insert_own" on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id);
create policy "friendships_update_participant" on public.friendships for update to authenticated
  using (auth.uid() in (requester_id, addressee_id))
  with check (auth.uid() in (requester_id, addressee_id));
create policy "friendships_delete_participant" on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Servers
create policy "servers_select_member" on public.servers for select to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = servers.id and sm.user_id = auth.uid()
  ));
create policy "servers_insert_own" on public.servers for insert to authenticated
  with check (auth.uid() = owner_id);
create policy "servers_update_owner" on public.servers for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "servers_delete_owner" on public.servers for delete to authenticated
  using (auth.uid() = owner_id);

-- Server members
create policy "server_members_select" on public.server_members for select to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = server_members.server_id and sm.user_id = auth.uid()
  ));
create policy "server_members_insert" on public.server_members for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.server_members sm
      where sm.server_id = server_members.server_id
        and sm.user_id = auth.uid()
        and sm.role in ('owner', 'admin')
    )
  );
create policy "server_members_delete" on public.server_members for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.servers s
      where s.id = server_members.server_id and s.owner_id = auth.uid()
    )
  );

-- Categories & channels (members of server)
create policy "categories_select" on public.channel_categories for select to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = channel_categories.server_id and sm.user_id = auth.uid()
  ));
create policy "categories_mutate_admin" on public.channel_categories for all to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = channel_categories.server_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.server_members sm
    where sm.server_id = channel_categories.server_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  ));

create policy "channels_select" on public.channels for select to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = channels.server_id and sm.user_id = auth.uid()
  ));
create policy "channels_mutate_admin" on public.channels for all to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = channels.server_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.server_members sm
    where sm.server_id = channels.server_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  ));

-- Messages
create policy "messages_select" on public.messages for select to authenticated
  using (exists (
    select 1 from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = messages.channel_id and sm.user_id = auth.uid()
  ));
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.channels c
      join public.server_members sm on sm.server_id = c.server_id
      where c.id = messages.channel_id and sm.user_id = auth.uid()
    )
  );
create policy "messages_update_own" on public.messages for update to authenticated
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "messages_delete_own" on public.messages for delete to authenticated
  using (auth.uid() = author_id);

-- DM threads
create policy "dm_threads_select" on public.dm_threads for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy "dm_threads_insert" on public.dm_threads for insert to authenticated
  with check (auth.uid() in (user_a, user_b));

-- DM messages
create policy "dm_messages_select" on public.dm_messages for select to authenticated
  using (exists (
    select 1 from public.dm_threads t
    where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
  ));
create policy "dm_messages_insert" on public.dm_messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    )
  );
create policy "dm_messages_delete_own" on public.dm_messages for delete to authenticated
  using (auth.uid() = author_id);

-- Voice presence
create policy "voice_select" on public.voice_presence for select to authenticated
  using (exists (
    select 1 from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = voice_presence.channel_id and sm.user_id = auth.uid()
  ));
create policy "voice_insert_own" on public.voice_presence for insert to authenticated
  with check (auth.uid() = user_id);
create policy "voice_delete_own" on public.voice_presence for delete to authenticated
  using (auth.uid() = user_id);

-- Notifications
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime publication (run if not already added)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.voice_presence;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
