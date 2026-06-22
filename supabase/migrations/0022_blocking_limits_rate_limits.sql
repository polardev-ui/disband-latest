-- Friend blocking, 25-char username/display-name caps, and broad rate limiting.

-- ---------------------------------------------------------------------------
-- Username & display name length: max 25
-- ---------------------------------------------------------------------------
update public.profiles set username = left(username, 25) where username is not null and char_length(username) > 25;
update public.profiles set display_name = left(display_name, 25) where display_name is not null and char_length(display_name) > 25;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 25);

create or replace function public.assert_username_available(p_username text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_username is null or length(trim(p_username)) = 0 then
    return;
  end if;

  perform public.assert_username_policy(p_username);

  if p_username !~ '^[a-z0-9_]{2,25}$' then
    raise exception 'Usernames must be 2–25 characters: letters, numbers, and underscores only.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = lower(p_username)
      and id <> p_user_id
  ) then
    raise exception 'That username is already taken.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.check_username_available(p_username text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := lower(trim(coalesce(p_username, '')));
begin
  if v_norm = '' then
    return jsonb_build_object('available', false, 'reason', 'Enter a username');
  end if;

  if v_norm !~ '^[a-z0-9_]{2,25}$' then
    return jsonb_build_object('available', false, 'reason', 'Use 2–25 letters, numbers, or underscores');
  end if;

  if public.username_contains_blocked_word(v_norm) then
    return jsonb_build_object('available', false, 'reason', 'That username is not allowed');
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = v_norm
      and (v_uid is null or id <> v_uid)
  ) then
    return jsonb_build_object('available', false, 'reason', 'Username is taken');
  end if;

  return jsonb_build_object('available', true);
end;
$$;

grant execute on function public.check_username_available(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Friend blocking
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'blocked'
      and (
        (f.requester_id = p_a and f.addressee_id = p_b)
        or (f.requester_id = p_b and f.addressee_id = p_a)
      )
  );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_user_id = auth.uid() then raise exception 'Cannot block yourself'; end if;

  -- Remove any existing relationship in either direction, then record the block.
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = auth.uid());

  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), p_user_id, 'blocked');
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
  where status = 'blocked'
    and requester_id = auth.uid()
    and addressee_id = p_user_id;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Reject DM creation when a block exists in either direction
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

-- Block DM message inserts between blocked users
create or replace function public.enforce_dm_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  select case when t.user_a = new.author_id then t.user_b else t.user_a end
    into v_other
  from public.dm_threads t
  where t.id = new.thread_id;

  if v_other is not null and public.is_blocked_between(new.author_id, v_other) then
    raise exception 'You cannot message this user.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_block_guard on public.dm_messages;
create trigger dm_messages_block_guard
  before insert on public.dm_messages
  for each row execute function public.enforce_dm_not_blocked();

-- ---------------------------------------------------------------------------
-- Rate limiting: channel + DM messages, friend requests, reactions
-- ---------------------------------------------------------------------------
create index if not exists messages_author_created_idx
  on public.messages (author_id, created_at desc);
create index if not exists dm_messages_author_created_idx
  on public.dm_messages (author_id, created_at desc);

create or replace function public.enforce_channel_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_burst integer;
  v_minute integer;
begin
  select count(*) into v_burst from public.messages
  where author_id = new.author_id and created_at > now() - interval '5 seconds';
  if v_burst >= 7 then
    raise exception 'You are sending messages too quickly. Slow down.' using errcode = 'P0001';
  end if;

  select count(*) into v_minute from public.messages
  where author_id = new.author_id and created_at > now() - interval '1 minute';
  if v_minute >= 40 then
    raise exception 'Message rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_channel_message_rate();

create or replace function public.enforce_dm_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_burst integer;
  v_minute integer;
begin
  select count(*) into v_burst from public.dm_messages
  where author_id = new.author_id and created_at > now() - interval '5 seconds';
  if v_burst >= 7 then
    raise exception 'You are sending messages too quickly. Slow down.' using errcode = 'P0001';
  end if;

  select count(*) into v_minute from public.dm_messages
  where author_id = new.author_id and created_at > now() - interval '1 minute';
  if v_minute >= 40 then
    raise exception 'Message rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_rate_limit on public.dm_messages;
create trigger dm_messages_rate_limit
  before insert on public.dm_messages
  for each row execute function public.enforce_dm_message_rate();

create or replace function public.enforce_friend_request_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
  v_minute integer;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  select count(*) into v_minute from public.friendships
  where requester_id = new.requester_id and created_at > now() - interval '1 minute';
  if v_minute >= 10 then
    raise exception 'You are sending friend requests too quickly.' using errcode = 'P0001';
  end if;

  select count(*) into v_recent from public.friendships
  where requester_id = new.requester_id and created_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Friend request limit reached. Try again later.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_rate_limit on public.friendships;
create trigger friendships_rate_limit
  before insert on public.friendships
  for each row execute function public.enforce_friend_request_rate();

-- Reactions rate limit (table added in 0012)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'message_reactions'
  ) then
    execute $fn$
      create or replace function public.enforce_reaction_rate()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_burst integer;
      begin
        select count(*) into v_burst from public.message_reactions
        where user_id = new.user_id and created_at > now() - interval '5 seconds';
        if v_burst >= 15 then
          raise exception 'You are reacting too quickly. Slow down.' using errcode = 'P0001';
        end if;
        return new;
      end;
      $body$;
    $fn$;

    -- created_at may not exist on older reaction tables; guard the trigger creation.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'created_at'
    ) then
      execute 'drop trigger if exists message_reactions_rate_limit on public.message_reactions';
      execute 'create trigger message_reactions_rate_limit before insert on public.message_reactions for each row execute function public.enforce_reaction_rate()';
    end if;
  end if;
end $$;
