-- Disband — initial schema
-- ============================================================================
-- Apply with the Supabase CLI:
--   pnpm supabase db push        (against a linked project)
-- or paste into the Supabase Dashboard > SQL Editor.
--
-- This migration creates:
--   1. profiles    — one row per auth user, including a `theme` preference
--   2. media_posts — asset URLs produced by the custom media API
-- Row Level Security is enabled so users can only touch their own rows.
-- ============================================================================

-- Helpful for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique,
  display_name  text,
  avatar_url    text,
  -- Stored theme preference. Matches the theme ids in src/lib/theme/themes.ts
  -- (light | dark | midnight | sunset), but kept as free text to allow
  -- fully user-defined themes in the future.
  theme         text not null default 'dark',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.theme is
  'Active Disband theme id (e.g. light, dark, midnight, sunset).';

-- ---------------------------------------------------------------------------
-- media_posts
-- ---------------------------------------------------------------------------
create table if not exists public.media_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text,
  caption     text,
  media_type  text not null default 'image'
                check (media_type in ('image', 'video')),
  -- URL + key returned by POST https://api.wsgpolar.me/v1/images
  asset_url   text not null,
  asset_key   text,
  created_at  timestamptz not null default now()
);

create index if not exists media_posts_user_id_idx
  on public.media_posts (user_id);
create index if not exists media_posts_created_at_idx
  on public.media_posts (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger for profiles
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.media_posts enable row level security;

-- profiles: anyone authenticated can read; users manage only their own row.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- media_posts: owners have full control over their own posts.
drop policy if exists "media_select_own" on public.media_posts;
create policy "media_select_own"
  on public.media_posts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "media_insert_own" on public.media_posts;
create policy "media_insert_own"
  on public.media_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "media_update_own" on public.media_posts;
create policy "media_update_own"
  on public.media_posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "media_delete_own" on public.media_posts;
create policy "media_delete_own"
  on public.media_posts for delete
  to authenticated
  using (auth.uid() = user_id);
