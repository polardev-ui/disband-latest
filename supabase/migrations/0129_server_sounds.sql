-- server soundboards: up to 15 named sounds with a required emoji per server.
create table if not exists public.server_sounds (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null,
  emoji text not null,
  url text not null,
  uploader_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint server_sounds_name_required check (length(btrim(name)) > 0),
  constraint server_sounds_emoji_required check (length(btrim(emoji)) > 0),
  constraint server_sounds_name_max check (char_length(name) <= 32)
);

create index if not exists server_sounds_server_created_idx
  on public.server_sounds(server_id, created_at desc);

alter table public.server_sounds enable row level security;

create policy "Members can view server sounds"
  on public.server_sounds for select to authenticated
  using (public.is_server_member(server_id));

create policy "Moderators can insert server sounds"
  on public.server_sounds for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and public.member_has_server_permission(server_id, auth.uid(), 'manage_emojis')
  );

create policy "Moderators can delete server sounds"
  on public.server_sounds for delete to authenticated
  using (public.member_has_server_permission(server_id, auth.uid(), 'manage_emojis'));

create or replace function public.enforce_server_sound_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.server_sounds where server_id = new.server_id) >= 15 then
    raise exception 'This server can have at most 15 soundboard sounds.';
  end if;
  return new;
end;
$$;

drop trigger if exists server_sounds_limit on public.server_sounds;
create trigger server_sounds_limit
  before insert on public.server_sounds
  for each row execute function public.enforce_server_sound_limit();

-- Public storage bucket for uploaded soundboard clips.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('server-sounds', 'server-sounds', true, 10485760, array['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/flac'])
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view server soundboard clips" on storage.objects;
create policy "Anyone can view server soundboard clips"
  on storage.objects for select
  using (bucket_id = 'server-sounds');

drop policy if exists "Moderators can upload server soundboard clips" on storage.objects;
create policy "Moderators can upload server soundboard clips"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'server-sounds');
