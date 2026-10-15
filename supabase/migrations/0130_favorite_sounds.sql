create table if not exists public.favorite_server_sounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sound_id uuid not null references public.server_sounds(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, sound_id)
);

create index if not exists favorite_server_sounds_user_created_idx
  on public.favorite_server_sounds(user_id, created_at desc);

alter table public.favorite_server_sounds enable row level security;

drop policy if exists "own favorite server sounds" on public.favorite_server_sounds;
create policy "own favorite server sounds"
  on public.favorite_server_sounds
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, delete on public.favorite_server_sounds to authenticated;
