-- Persist muted/deafened state per voice participant so other server members
-- can see who is muted/deafened without joining the channel.

alter table public.voice_presence
  add column if not exists muted boolean not null default false,
  add column if not exists deafened boolean not null default false;
