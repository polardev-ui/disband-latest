-- ---------------------------------------------------------------------------
-- 0182: "Sign in with Disband" and game activity.
--
--   1. Links: OAuth 2.0 apps a developer registers so their website can offer
--      "Sign in with Disband". Standard authorization-code flow with PKCE;
--      codes, access tokens and refresh tokens are stored only as SHA-256
--      hashes. Everything is written by the API with the service role; people
--      can read their own Links and the apps they have let in.
--   2. profiles.activity: what someone is playing (or doing), set by the
--      desktop app's game detection, Discord-compatible Rich Presence, or a
--      developer's game through the API. activity_updated_at is a heartbeat:
--      clients ignore an activity that has not been refreshed recently, so a
--      crashed app never leaves someone "playing" forever.
-- ---------------------------------------------------------------------------

create table if not exists public.oauth_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  description text check (description is null or char_length(description) <= 300),
  website text check (website is null or char_length(website) <= 300),
  icon_url text check (icon_url is null or char_length(icon_url) <= 1024),
  redirect_uris text[] not null default '{}',
  secret_hash text,
  secret_prefix text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists oauth_links_owner_idx on public.oauth_links (owner_id);
alter table public.oauth_links enable row level security;
drop policy if exists "own links" on public.oauth_links;
create policy "own links" on public.oauth_links for select to authenticated
  using (owner_id = (select auth.uid()));

create table if not exists public.oauth_codes (
  code_hash text primary key,
  link_id uuid not null references public.oauth_links(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge text,
  code_challenge_method text check (code_challenge_method is null or code_challenge_method in ('S256', 'plain')),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.oauth_codes enable row level security;

create table if not exists public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_hash text not null unique,
  refresh_hash text unique,
  link_id uuid not null references public.oauth_links(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scopes text[] not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists oauth_tokens_user_idx on public.oauth_tokens (user_id);
create index if not exists oauth_tokens_link_idx on public.oauth_tokens (link_id);
alter table public.oauth_tokens enable row level security;

create table if not exists public.oauth_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  link_id uuid not null references public.oauth_links(id) on delete cascade,
  scopes text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, link_id)
);
alter table public.oauth_grants enable row level security;
drop policy if exists "own grants" on public.oauth_grants;
create policy "own grants" on public.oauth_grants for select to authenticated
  using (user_id = (select auth.uid()));

-- Expired codes and tokens are useless; clear them daily.
create or replace function public.prune_oauth()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_codes where expires_at < now() - interval '1 day';
  delete from public.oauth_tokens
   where (revoked_at is not null and revoked_at < now() - interval '1 day')
      or (coalesce(refresh_expires_at, expires_at) < now() - interval '1 day');
$$;
revoke all on function public.prune_oauth() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('prune-oauth')
    where exists (select 1 from cron.job where jobname = 'prune-oauth');
  perform cron.schedule('prune-oauth', '23 4 * * *', 'select public.prune_oauth()');
end;
$$;

-- Activity ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists activity jsonb,
  add column if not exists activity_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_activity_size;
alter table public.profiles
  add constraint profiles_activity_size check (activity is null or pg_column_size(activity) <= 4096);
