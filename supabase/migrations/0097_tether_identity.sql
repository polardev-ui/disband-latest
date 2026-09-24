-- ---------------------------------------------------------------------------
-- 0097: Tether is a first-class system account
--
-- 1. Free the reserved "tether" username so the Tether bot can own it. A
--    human account ("tether" / egodiddyblud) squatted the name; the API route
--    keys Tether's identity off its stable email (tether@disband.dev), never
--    off the squatted username, and it will claim "tether" for the bot.
-- 2. Bots cannot be friended, blocked, or DM'ed directly. These guards are
--    DB-level so every client (web, desktop, iOS, Android) is covered.
-- ---------------------------------------------------------------------------

-- 1) Rename any non-bot profile squatting the reserved "tether" username.
update public.profiles
set username = 'tether_' || substr(md5(id::text), 1, 8),
    updated_at = now()
where username = 'tether'
  and coalesce(is_bot, false) = false;

-- 2) No friendships (pending / accepted / blocked) may involve a bot. This
--    blocks friend requests to or from Tether AND blocking Tether (a block
--    is a 'blocked' friendship row).
create or replace function public.guard_bot_friendships() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id in (new.requester_id, new.addressee_id)
      and coalesce(p.is_bot, false)
  ) then
    raise exception 'You cannot friend or block a bot.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_bot_guard on public.friendships;
create trigger friendships_bot_guard
  before insert or update on public.friendships
  for each row execute function public.guard_bot_friendships();

-- 3) block_user: explicit bot guard (the trigger above is the backstop).
create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_user_id = auth.uid() then raise exception 'Cannot block yourself'; end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and coalesce(p.is_bot, false)) then
    raise exception 'You cannot block a bot.';
  end if;

  -- Remove any existing relationship in either direction, then record the block.
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = auth.uid());

  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), p_user_id, 'blocked');
end;
$$;

-- 4) Bot DMs are rejected: Tether is pinged inside existing conversations,
--    never opened as a contact.
create or replace function public.get_or_create_dm_thread(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_thread uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_friend_id = auth.uid() then raise exception 'Cannot DM yourself'; end if;
  if exists (select 1 from public.profiles p where p.id = p_friend_id and coalesce(p.is_bot, false)) then
    raise exception 'You cannot message a bot.';
  end if;

  if public.is_blocked_between(auth.uid(), p_friend_id) then
    raise exception 'You cannot message this user.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = p_friend_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_friend_id)
      )
  ) then
    raise exception 'You must be friends to start a DM';
  end if;

  v_a := least(auth.uid(), p_friend_id);
  v_b := greatest(auth.uid(), p_friend_id);

  select id into v_thread from public.dm_threads where user_a = v_a and user_b = v_b;
  if v_thread is null then
    insert into public.dm_threads (user_a, user_b) values (v_a, v_b) returning id into v_thread;
  end if;
  return v_thread;
end;
$$;