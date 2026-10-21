-- Activities: lightweight multiplayer games that live in a chat message.
--
-- The cards are ordinary messages with attachment_type = 'activity' and the
-- session id in attachment_url, so history, replies and reporting all work
-- without a second message model.
--
-- Game state is read and written only through /api/activities. The tables are
-- deliberately service-role only: Wordle answers and trivia keys live in
-- activity_sessions.state and must never be selectable by the browser.

alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio', 'activity'));

alter table public.dm_messages drop constraint if exists dm_messages_attachment_type_check;
alter table public.dm_messages add constraint dm_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio', 'activity'));

alter table public.group_messages drop constraint if exists group_messages_attachment_type_check;
alter table public.group_messages add constraint group_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio', 'activity'));

create table if not exists public.activity_sessions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('wordle', 'eight_ball', 'trivia', 'would_you_rather')),
  scope       text not null check (scope in ('channel', 'dm', 'group')),
  scope_id    uuid not null,
  host_id     uuid not null references public.profiles (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days')
);

create index if not exists activity_sessions_scope_idx
  on public.activity_sessions (scope, scope_id, created_at desc);
create index if not exists activity_sessions_expiry_idx
  on public.activity_sessions (expires_at);

create table if not exists public.activity_players (
  activity_id uuid not null references public.activity_sessions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  score       int not null default 0,
  finished    boolean not null default false,
  won         boolean not null default false,
  joined_at   timestamptz not null default now(),
  finished_at timestamptz,
  primary key (activity_id, user_id)
);

create index if not exists activity_players_user_idx
  on public.activity_players (user_id, joined_at desc);

create table if not exists public.activity_votes (
  activity_id  uuid not null references public.activity_sessions (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  prompt_index int not null check (prompt_index >= 0 and prompt_index < 20),
  choice       int not null check (choice in (0, 1)),
  created_at   timestamptz not null default now(),
  primary key (activity_id, user_id, prompt_index)
);

create table if not exists public.activity_scores (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('wordle', 'eight_ball', 'trivia', 'would_you_rather')),
  plays      int not null default 0,
  wins       int not null default 0,
  points     int not null default 0,
  best       int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create index if not exists activity_scores_kind_points_idx
  on public.activity_scores (kind, points desc, wins desc);

alter table public.activity_sessions enable row level security;
alter table public.activity_players  enable row level security;
alter table public.activity_votes    enable row level security;
alter table public.activity_scores   enable row level security;

revoke all on public.activity_sessions from public, anon, authenticated;
revoke all on public.activity_players  from public, anon, authenticated;
revoke all on public.activity_votes    from public, anon, authenticated;
revoke all on public.activity_scores   from public, anon, authenticated;
