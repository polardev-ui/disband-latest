-- 0091_discord_links.sql
-- Links a Disband account to a Discord user for the Vanguard ,disband flow.

create table if not exists public.discord_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discord_user_id text not null unique,
  discord_username text not null default '',
  guild_id text,
  role_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discord_links_discord_user_idx
  on public.discord_links (discord_user_id);

alter table public.discord_links enable row level security;

drop policy if exists discord_links_own on public.discord_links;
create policy discord_links_own on public.discord_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
