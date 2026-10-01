-- ---------------------------------------------------------------------------
-- 0113: Favorite GIFs
--
-- One row per (user, url): a user can star any GIF — from search, from a
-- pasted link, from another message — and replay it later from the picker's
-- Favorited tab. URL length is capped so the unique index stays small, and
-- the table carries no PII beyond ownership.
-- ---------------------------------------------------------------------------

create table if not exists public.favorite_gifs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null check (char_length(url) between 1 and 2000),
  title text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists favorite_gifs_user_created_idx
  on public.favorite_gifs (user_id, created_at desc);

alter table public.favorite_gifs enable row level security;

drop policy if exists "own favorites" on public.favorite_gifs;
create policy "own favorites" on public.favorite_gifs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, delete on public.favorite_gifs to authenticated;
