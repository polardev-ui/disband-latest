-- ---------------------------------------------------------------------------
-- 0138: server-side Spotify connections
--
-- Spotify tokens used to live in the browser's localStorage, so a connection
-- made in the web app was invisible to the desktop app (a different storage
-- origin) and to every other device. They now live here: one row per user,
-- read and written only by the server. The browser receives the current
-- track, never the tokens.
--
-- Tokens are secrets. RLS is on with no policies, and anon/authenticated have
-- no table privileges; only the service-role API routes can touch the table.
-- ---------------------------------------------------------------------------

create table if not exists public.spotify_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_connections enable row level security;
revoke all on public.spotify_connections from public, anon, authenticated;
grant all on public.spotify_connections to service_role;

-- The API reads by primary key only; no extra indexes are needed.
