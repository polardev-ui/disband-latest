-- ---------------------------------------------------------------------------
-- 0201: voice through Cloudflare Realtime (an SFU) instead of a mesh.
--
-- In a mesh every person uploads their mic and camera once per other person,
-- so a room of 8 means 7 uploads each and the weakest connection drags
-- everyone down. With the SFU each person uploads once to Cloudflare's
-- nearest location and downloads the others from there.
--
--   transport        'sfu' or 'mesh'. Older apps don't send it, so they stay
--                    'mesh', and newer apps keep a direct connection with
--                    those people only, so mixed rooms still hear each other.
--   sfu_session_id   the Cloudflare session carrying this person's tracks.
--                    Only the server writes it (POST /api/voice/sfu), so
--                    nobody can point a room at someone else's audio.
--   sfu_tracks       which of audio, camera, screen and screenaudio they are
--                    sending right now. Others pull exactly these.
-- ---------------------------------------------------------------------------

alter table public.voice_presence
  add column if not exists transport text not null default 'mesh',
  add column if not exists sfu_session_id text,
  add column if not exists sfu_tracks text[] not null default '{}';

alter table public.voice_presence drop constraint if exists voice_presence_transport_check;
alter table public.voice_presence add constraint voice_presence_transport_check
  check (transport in ('sfu', 'mesh'));

create or replace function public.voice_presence_guard_sfu()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sfu_session_id := null;
  else
    new.sfu_session_id := old.sfu_session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voice_presence_guard_sfu on public.voice_presence;
create trigger trg_voice_presence_guard_sfu
  before insert or update on public.voice_presence
  for each row execute function public.voice_presence_guard_sfu();

create or replace view public.voice_presence_live
with (security_invoker = true) as
  select channel_id, user_id, joined_at, muted, deafened, last_seen_at,
         transport, sfu_session_id, sfu_tracks
  from public.voice_presence
  where last_seen_at > now() - interval '90 seconds';
