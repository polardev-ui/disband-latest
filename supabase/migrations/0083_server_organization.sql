-- 0083_server_organization.sql
-- Per-user server ordering + server folders (name + custom color).

create table if not exists public.server_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Folder',
  color text not null default '#5865f2',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint server_folders_name_length check (char_length(name) between 1 and 32),
  constraint server_folders_color_format check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.server_list_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  position integer not null default 0,
  folder_id uuid references public.server_folders (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, server_id)
);

create index if not exists server_folders_user_position_idx
  on public.server_folders (user_id, position);
create index if not exists server_list_state_user_position_idx
  on public.server_list_state (user_id, position);
create index if not exists server_list_state_folder_idx
  on public.server_list_state (folder_id) where folder_id is not null;

alter table public.server_folders enable row level security;
alter table public.server_list_state enable row level security;

drop policy if exists server_folders_own on public.server_folders;
create policy server_folders_own on public.server_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists server_list_state_own on public.server_list_state;
create policy server_list_state_own on public.server_list_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
