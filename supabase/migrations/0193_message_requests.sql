-- ---------------------------------------------------------------------------
-- 0193: message requests.
--
-- DMs used to need an accepted friendship. Now anyone who shares a space with
-- you can message you, if you allow it (Settings → Privacy, on by default).
-- Their first message lands in your Message Requests, not your DM list. The
-- thread moves to your DMs when you reply, press Accept, or become friends.
--
--   * profiles.allow_message_requests — the privacy switch.
--   * dm_threads.requested_by — the person who started a non-friend thread.
--     Null means a normal DM (friends, bots, @disband).
--   * dm_threads.accepted_at — set once the recipient replies or accepts.
--   * dm_threads.request_ignored_at — the recipient pressed Ignore: the
--     request is hidden from them and stops sending pushes. The sender is not
--     told; Discord behaves the same way.
--
-- The official Disband space does not count as a shared space: every account
-- joins it at sign-up, so it would let anyone message anyone. Suspended
-- spaces don't count either.
--
-- A sender may open at most 25 new requests a day, so a shared space can't be
-- used to mass-message its members.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists allow_message_requests boolean not null default true;

alter table public.dm_threads
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists request_ignored_at timestamptz;

create index if not exists dm_threads_requested_by_created_idx
  on public.dm_threads (requested_by, created_at)
  where requested_by is not null;

-- True when the two people share a space other than the official one.
create or replace function public.share_space_for_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members a
    join public.server_members b on b.server_id = a.server_id and b.user_id = p_b
    join public.servers s on s.id = a.server_id
    where a.user_id = p_a
      and s.suspended_at is null
      and lower(coalesce(s.vanity_code, '')) <> 'disband'
  );
$$;

revoke all on function public.share_space_for_dm(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_or_create_dm_thread(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_thread uuid;
  v_requested_by uuid;
  v_recent integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_friend_id = v_uid then raise exception 'Cannot DM yourself'; end if;

  v_a := least(v_uid, p_friend_id);
  v_b := greatest(v_uid, p_friend_id);
  select id, requested_by into v_thread, v_requested_by
  from public.dm_threads where user_a = v_a and user_b = v_b;

  if exists (select 1 from public.profiles p where p.id = p_friend_id and coalesce(p.is_bot, false)) then
    if not exists (select 1 from public.profiles p where p.id = p_friend_id and coalesce(p.bot_dm_enabled, false)) then
      raise exception 'You cannot message this bot.';
    end if;
  else
    if public.is_blocked_between(v_uid, p_friend_id) then
      raise exception 'You cannot message this user.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = v_uid and f.addressee_id = p_friend_id)
          or (f.addressee_id = v_uid and f.requester_id = p_friend_id)
        )
    ) then
      -- Not friends. An existing conversation (an earlier request, or one
      -- from when you were friends) can always be reopened.
      if v_thread is not null then return v_thread; end if;

      if not public.share_space_for_dm(v_uid, p_friend_id) then
        raise exception 'You can only message friends, or people you share a space with.' using errcode = 'P0001';
      end if;
      if not exists (select 1 from public.profiles p where p.id = p_friend_id and p.allow_message_requests) then
        raise exception 'This person isn''t accepting message requests.' using errcode = 'P0001';
      end if;

      select count(*) into v_recent from public.dm_threads
      where requested_by = v_uid and created_at > now() - interval '1 day';
      if v_recent >= 25 then
        raise exception 'You''ve sent a lot of message requests today. Try again tomorrow.' using errcode = 'P0001';
      end if;

      insert into public.dm_threads (user_a, user_b, requested_by)
      values (v_a, v_b, v_uid)
      on conflict (user_a, user_b) do nothing
      returning id into v_thread;
      if v_thread is null then
        select id into v_thread from public.dm_threads where user_a = v_a and user_b = v_b;
      end if;
      return v_thread;
    end if;
  end if;

  if v_thread is null then
    insert into public.dm_threads (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_thread;
    if v_thread is null then
      select id into v_thread from public.dm_threads where user_a = v_a and user_b = v_b;
    end if;
  end if;
  return v_thread;
end;
$$;

-- Accept or ignore a request you received.
create or replace function public.respond_message_request(p_thread_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_action not in ('accept', 'ignore') then raise exception 'Unknown action %', p_action; end if;

  update public.dm_threads
     set accepted_at = case when p_action = 'accept' then now() else accepted_at end,
         request_ignored_at = case when p_action = 'ignore' then now() else null end
   where id = p_thread_id
     and v_uid in (user_a, user_b)
     and requested_by is not null
     and requested_by <> v_uid;
  if not found then raise exception 'Message request not found'; end if;
end;
$$;

revoke all on function public.respond_message_request(uuid, text) from public, anon;
grant execute on function public.respond_message_request(uuid, text) to authenticated;

-- Replying to a request accepts it.
create or replace function public.dm_accept_request_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads
     set accepted_at = now(), request_ignored_at = null
   where id = new.thread_id
     and requested_by is not null
     and accepted_at is null
     and requested_by <> new.author_id;
  return null;
end;
$$;

revoke all on function public.dm_accept_request_on_reply() from public, anon, authenticated;

drop trigger if exists trg_dm_accept_request_on_reply on public.dm_messages;
create trigger trg_dm_accept_request_on_reply
  after insert on public.dm_messages
  for each row execute function public.dm_accept_request_on_reply();

-- Becoming friends accepts any request between the two.
create or replace function public.dm_accept_request_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    update public.dm_threads
       set accepted_at = coalesce(accepted_at, now()), request_ignored_at = null
     where user_a = least(new.requester_id, new.addressee_id)
       and user_b = greatest(new.requester_id, new.addressee_id)
       and requested_by is not null
       and accepted_at is null;
  end if;
  return null;
end;
$$;

revoke all on function public.dm_accept_request_on_friendship() from public, anon, authenticated;

drop trigger if exists trg_dm_accept_request_on_friendship on public.friendships;
create trigger trg_dm_accept_request_on_friendship
  after insert or update of status on public.friendships
  for each row execute function public.dm_accept_request_on_friendship();

-- Pushes: a request says so, and an ignored request stays quiet.
create or replace function public.on_dm_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  sender text;
  v_requested_by uuid;
  v_accepted timestamptz;
  v_ignored timestamptz;
begin
  select case when user_a = new.author_id then user_b else user_a end,
         requested_by, accepted_at, request_ignored_at
    into recipient, v_requested_by, v_accepted, v_ignored
    from public.dm_threads where id = new.thread_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  if v_requested_by = new.author_id and v_accepted is null then
    if v_ignored is not null then return new; end if;
    sender := sender || ' (message request)';
  end if;
  perform public.notify_push(recipient, sender,
    coalesce(nullif(new.content, ''), 'Sent an attachment'),
    new.thread_id::text);
  return new;
end;
$$;
