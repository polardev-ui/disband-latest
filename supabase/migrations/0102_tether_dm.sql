-- ---------------------------------------------------------------------------
-- 0102: Direct messages with Tether
--
-- Aero subscribers can talk to Tether one-on-one, not just by mentioning it in
-- a conversation. 0097 deliberately made bots un-DM-able ("Tether is pinged
-- inside existing conversations, never opened as a contact"), because
-- get_or_create_dm_thread also gates on friendship and a bot can never accept
-- a friend request — every bot DM would have been a dead end.
--
-- This opens that door for Tether only:
--   * `profiles.bot_dm_enabled` marks the (few) bots users may DM. It is a
--     column rather than a hard-coded id so the gate lives with the identity
--     it controls and future system accounts can opt in deliberately.
--   * get_or_create_dm_thread lets a bot DM through WITHOUT friendship (a bot
--     can't accept requests), but never without the flag.
--   * The block guard is irrelevant for bots: guard_bot_friendships() already
--     refuses to create a 'blocked' friendship row involving a bot, so
--     is_blocked_between() can never be true here.
--
-- Everything else is unchanged: dm_threads/dm_messages RLS is membership-
-- based (auth.uid() in (user_a, user_b)), so once the thread exists the
-- conversation behaves like any other DM, and the ask route still gates on
-- the Aero plan, rate limits, and visibility before Tether answers.
--
-- Reversible: set bot_dm_enabled = false on Tether's profile and bot DMs are
-- refused again (existing threads stay readable, like any DM).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists bot_dm_enabled boolean not null default false;

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

  -- Bots: only DM-able when explicitly flagged (Tether). Friendship is not
  -- required for them — a bot cannot accept a friend request.
  -- Humans: unchanged — no block, and an accepted friendship.
  if exists (select 1 from public.profiles p where p.id = p_friend_id and coalesce(p.is_bot, false)) then
    if not exists (select 1 from public.profiles p where p.id = p_friend_id and coalesce(p.bot_dm_enabled, false)) then
      raise exception 'You cannot message this bot.';
    end if;
  else
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

-- Mark Tether's existing profile(s). `is_bot` excludes the human who squatted
-- the 'tether' username before Tether existed; the prefix covers the
-- 'tether_ai' and 'tether_<id>' fallbacks ensureTetherUser can pick.
update public.profiles
  set bot_dm_enabled = true
  where coalesce(is_bot, false) = true
    and username like 'tether%';
