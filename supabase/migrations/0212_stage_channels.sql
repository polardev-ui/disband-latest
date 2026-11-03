-- Stage channels: a voice channel where speakers talk and everyone else
-- listens. Stored as a voice channel with is_stage, so every voice path
-- (presence, the SFU, the phone apps) keeps working; only who can be heard
-- changes. The SFU route only forwards speakers' tracks in a stage, so an
-- audience member can't be heard whatever their app does.
--
-- Stage moderators are the space's owner and admins, and anyone with
-- Manage Channels. They open the stage with a topic, bring people up to
-- speak and move them back down. The stage closes when the last moderator
-- leaves.

alter table public.channels
  add column if not exists is_stage boolean not null default false,
  add column if not exists stage_topic text,
  add column if not exists stage_started_at timestamptz,
  add column if not exists stage_requests_enabled boolean not null default true;

alter table public.channels
  drop constraint if exists channels_stage_is_voice,
  add constraint channels_stage_is_voice check (not is_stage or type = 'voice'),
  drop constraint if exists channels_stage_topic_len,
  add constraint channels_stage_topic_len check (stage_topic is null or char_length(stage_topic) between 1 and 120);

alter table public.voice_presence
  add column if not exists stage_speaker boolean not null default false,
  add column if not exists stage_invited boolean not null default false,
  add column if not exists stage_hand_raised_at timestamptz;

create or replace view public.voice_presence_live
with (security_invoker = true) as
  select channel_id, user_id, joined_at, muted, deafened, last_seen_at,
         transport, sfu_session_id, sfu_tracks,
         stage_speaker, stage_invited, stage_hand_raised_at
  from public.voice_presence
  where last_seen_at > now() - interval '90 seconds';

-- The stage columns only change through the functions below (which run as
-- the owner). A client writing its own row keeps whatever was there, and a
-- fresh row always starts in the audience.
create or replace function public.voice_presence_guard_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.stage_speaker := false;
    new.stage_invited := false;
    new.stage_hand_raised_at := null;
  else
    new.stage_speaker := old.stage_speaker;
    new.stage_invited := old.stage_invited;
    new.stage_hand_raised_at := old.stage_hand_raised_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voice_presence_guard_stage on public.voice_presence;
create trigger trg_voice_presence_guard_stage
  before insert or update on public.voice_presence
  for each row execute function public.voice_presence_guard_stage();

create or replace function public.is_stage_moderator(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.is_stage
      and public.user_has_server_permission(c.server_id, p_user_id, 'manage_channels')
  );
$$;

revoke all on function public.is_stage_moderator(uuid, uuid) from public, anon;
grant execute on function public.is_stage_moderator(uuid, uuid) to authenticated;

-- Shared checks for the actions below.
create or replace function public.stage_require(p_channel_id uuid, p_moderator boolean)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.channels where id = p_channel_id and is_stage) then
    raise exception 'That isn''t a stage.' using errcode = 'P0001';
  end if;
  if p_moderator and not public.is_stage_moderator(p_channel_id, auth.uid()) then
    raise exception 'Only stage moderators can do that.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.stage_require(uuid, boolean) from public, anon, authenticated;

-- Open the stage (or change its topic while it's open).
create or replace function public.stage_start(p_channel_id uuid, p_topic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
begin
  perform public.stage_require(p_channel_id, true);
  if v_topic is null then raise exception 'Give the stage a topic.' using errcode = 'P0001'; end if;
  if char_length(v_topic) > 120 then raise exception 'Topics can be up to 120 characters.' using errcode = 'P0001'; end if;
  update public.channels
  set stage_topic = v_topic,
      stage_started_at = coalesce(stage_started_at, now())
  where id = p_channel_id;
end;
$$;

-- Close the stage: no topic, and everyone back in the audience.
create or replace function public.stage_end_internal(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channels set stage_topic = null, stage_started_at = null where id = p_channel_id;
  update public.voice_presence
  set stage_speaker = false, stage_invited = false, stage_hand_raised_at = null
  where channel_id = p_channel_id;
end;
$$;

revoke all on function public.stage_end_internal(uuid) from public, anon, authenticated;

create or replace function public.stage_end(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, true);
  perform public.stage_end_internal(p_channel_id);
end;
$$;

-- Raise or lower my hand.
create or replace function public.stage_raise_hand(p_channel_id uuid, p_raised boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, false);
  if p_raised and not exists (select 1 from public.channels where id = p_channel_id and stage_requests_enabled) then
    raise exception 'Requests to speak are turned off.' using errcode = 'P0001';
  end if;
  update public.voice_presence
  set stage_hand_raised_at = case when p_raised then coalesce(stage_hand_raised_at, now()) end
  where channel_id = p_channel_id and user_id = auth.uid() and not stage_speaker;
  if not found and p_raised then
    raise exception 'Join the stage first.' using errcode = 'P0001';
  end if;
end;
$$;

-- A moderator invites someone up. Inviting yourself puts you straight on
-- stage; anyone else has to accept.
create or replace function public.stage_invite(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, true);
  if p_user_id = auth.uid() then
    update public.voice_presence
    set stage_speaker = true, stage_invited = false, stage_hand_raised_at = null
    where channel_id = p_channel_id and user_id = p_user_id;
  else
    update public.voice_presence
    set stage_invited = true
    where channel_id = p_channel_id and user_id = p_user_id and not stage_speaker;
  end if;
  if not found then raise exception 'They aren''t in the audience.' using errcode = 'P0001'; end if;
end;
$$;

-- Accept or decline an invitation to speak.
create or replace function public.stage_respond_invite(p_channel_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, false);
  update public.voice_presence
  set stage_speaker = p_accept,
      stage_invited = false,
      stage_hand_raised_at = case when p_accept then null else stage_hand_raised_at end
  where channel_id = p_channel_id and user_id = auth.uid() and stage_invited;
  if not found then raise exception 'That invitation has gone.' using errcode = 'P0001'; end if;
end;
$$;

-- Back to the audience: yourself, or anyone if you're a moderator. Also
-- dismisses a raised hand or an open invitation.
create or replace function public.stage_move_to_audience(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, p_user_id <> auth.uid());
  update public.voice_presence
  set stage_speaker = false, stage_invited = false, stage_hand_raised_at = null
  where channel_id = p_channel_id and user_id = p_user_id;
end;
$$;

-- Take someone off the stage channel entirely.
create or replace function public.stage_disconnect(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, true);
  if p_user_id = auth.uid() then raise exception 'Use Leave to go.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.channels c join public.servers s on s.id = c.server_id
             where c.id = p_channel_id and s.owner_id = p_user_id) then
    raise exception 'The space owner can''t be disconnected.' using errcode = 'P0001';
  end if;
  delete from public.voice_presence where channel_id = p_channel_id and user_id = p_user_id;
end;
$$;

create or replace function public.stage_set_requests(p_channel_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stage_require(p_channel_id, true);
  update public.channels set stage_requests_enabled = p_enabled where id = p_channel_id;
  if not p_enabled then
    update public.voice_presence set stage_hand_raised_at = null where channel_id = p_channel_id;
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'stage_start(uuid,text)', 'stage_end(uuid)', 'stage_raise_hand(uuid,boolean)',
    'stage_invite(uuid,uuid)', 'stage_respond_invite(uuid,boolean)',
    'stage_move_to_audience(uuid,uuid)', 'stage_disconnect(uuid,uuid)',
    'stage_set_requests(uuid,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- The stage closes when its last moderator leaves (or times out).
create or replace function public.stage_close_when_unmoderated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.channels where id = old.channel_id and is_stage and stage_started_at is not null) then
    return null;
  end if;
  if exists (
    select 1 from public.voice_presence vp
    where vp.channel_id = old.channel_id
      and public.is_stage_moderator(old.channel_id, vp.user_id)
  ) then
    return null;
  end if;
  perform public.stage_end_internal(old.channel_id);
  return null;
end;
$$;

drop trigger if exists trg_stage_close_when_unmoderated on public.voice_presence;
create trigger trg_stage_close_when_unmoderated
  after delete on public.voice_presence
  for each row execute function public.stage_close_when_unmoderated();
