-- ---------------------------------------------------------------------------
-- 0197: voice channels can be locked or capped at a number of people.
--
--   channels.user_limit  null = no limit, otherwise 1–99 people at once.
--   channels.locked      nobody new can join; people already in stay.
--
-- The check runs in a BEFORE INSERT trigger on voice_presence, so it holds no
-- matter which client writes the row, and the client gets a readable error.
-- A BEFORE INSERT trigger also fires for an upsert that turns into an update,
-- so the count leaves out the joiner's own row. Rows older than the live
-- window (voice_presence_live: 90 seconds) are ghosts and do not count.
-- The space owner and admins can always join, so a locked or full room can
-- still be moderated.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column if not exists user_limit integer,
  add column if not exists locked boolean not null default false;

alter table public.channels drop constraint if exists channels_user_limit_range;
alter table public.channels add constraint channels_user_limit_range
  check (user_limit is null or user_limit between 1 and 99);

create or replace function public.voice_presence_enforce_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_locked boolean;
  v_server uuid;
  v_count integer;
begin
  select c.user_limit, c.locked, c.server_id into v_limit, v_locked, v_server
  from public.channels c where c.id = new.channel_id;

  if v_limit is null and not coalesce(v_locked, false) then
    return new;
  end if;
  -- Already in the room (a rejoin or heartbeat upsert): never turn them away.
  if exists (
    select 1 from public.voice_presence vp
    where vp.channel_id = new.channel_id and vp.user_id = new.user_id
      and vp.last_seen_at > now() - interval '90 seconds'
  ) then
    return new;
  end if;
  if exists (select 1 from public.servers s where s.id = v_server and s.owner_id = new.user_id)
     or exists (select 1 from public.server_members m
                where m.server_id = v_server and m.user_id = new.user_id and m.role in ('owner', 'admin')) then
    return new;
  end if;

  if coalesce(v_locked, false) then
    raise exception 'This voice channel is locked.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.voice_presence vp
  where vp.channel_id = new.channel_id and vp.user_id <> new.user_id
    and vp.last_seen_at > now() - interval '90 seconds';
  if v_count >= v_limit then
    raise exception 'This voice channel is full.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.voice_presence_enforce_limits() from public, anon, authenticated;

drop trigger if exists trg_voice_presence_limits on public.voice_presence;
create trigger trg_voice_presence_limits
  before insert on public.voice_presence
  for each row execute function public.voice_presence_enforce_limits();
