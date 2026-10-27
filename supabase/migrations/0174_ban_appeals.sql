create table if not exists public.ban_appeals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  ban_id      uuid references public.platform_bans (user_id) on delete set null,
  reason      text not null check (char_length(reason) between 10 and 2000),
  status      text not null default 'pending'
              check (status in ('pending','reviewing','approved','denied','closed')),
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision    text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ban_appeals_status_created_idx
  on public.ban_appeals (status, created_at desc);
create index if not exists ban_appeals_user_idx
  on public.ban_appeals (user_id, created_at desc);

alter table public.ban_appeals enable row level security;
revoke all on public.ban_appeals from public, anon, authenticated;
