-- Draft migration: individual channel-member permission storage.
-- This migration only creates secure storage. It does NOT enable member access
-- or modify my_channel_effects, channel/message RLS, or any existing RPC.
-- Review against the authoritative production schema before deploying.

create table if not exists public.channel_member_permissions (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null,
  can_view boolean,
  can_post boolean,
  can_react boolean,
  can_attach boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  constraint channel_member_permissions_has_override check (
    can_view is not null or can_post is not null
    or can_react is not null or can_attach is not null
  )
);

create index if not exists channel_member_permissions_user_idx
  on public.channel_member_permissions (user_id, channel_id);

-- Fail closed: do not expose direct table access to authenticated users.
-- Future SECURITY DEFINER RPCs must validate server membership and manager
-- privileges before reading or writing overrides.
alter table public.channel_member_permissions enable row level security;
revoke all on public.channel_member_permissions from anon, authenticated;
