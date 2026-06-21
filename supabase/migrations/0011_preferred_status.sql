-- Store the user's chosen status separately from live presence (offline when tab closed)

alter table public.profiles
  add column if not exists preferred_status text
    check (preferred_status is null or preferred_status in ('online', 'idle', 'dnd', 'offline'));

update public.profiles
set preferred_status = status
where preferred_status is null;

alter table public.profiles
  alter column preferred_status set default 'online';
