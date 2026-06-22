-- Security hardening: lock down RLS privilege-escalation paths, function grants,
-- mention-notification spam, and abusable RPCs.

-- ---------------------------------------------------------------------------
-- 1. server_members: prevent self-insert/self-update privilege escalation
-- ---------------------------------------------------------------------------
-- Self-join happens through join_server_by_invite (SECURITY DEFINER, bypasses RLS),
-- and create_server inserts the owner row. Direct table writes are admin/owner only.
drop policy if exists "server_members_insert" on public.server_members;
create policy "server_members_insert" on public.server_members for insert to authenticated
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
  );

drop policy if exists "server_members_update" on public.server_members;
create policy "server_members_update" on public.server_members for update to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  )
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  );

-- Only the server owner may set/alter the privileged legacy `role` (owner/admin).
create or replace function public.guard_server_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role in ('owner', 'admin') and not public.is_server_owner(new.server_id) then
      raise exception 'Only the server owner can assign privileged roles.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not public.is_server_owner(new.server_id) then
      raise exception 'Only the server owner can change member roles.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists server_members_role_guard on public.server_members;
create trigger server_members_role_guard
  before insert or update on public.server_members
  for each row execute function public.guard_server_member_role();

-- ---------------------------------------------------------------------------
-- 2. post_server_welcome: require the caller to be the joining member
-- ---------------------------------------------------------------------------
create or replace function public.post_server_welcome(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel uuid;
  v_server public.servers%rowtype;
  v_name text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authorized';
  end if;
  if not public.is_server_member(p_server_id) then
    raise exception 'Not a member of this server';
  end if;

  select * into v_server from public.servers where id = p_server_id;
  if not found then return; end if;

  select id into v_channel from public.channels
  where server_id = p_server_id and name = 'welcome' limit 1;
  if v_channel is null then
    select id into v_channel from public.channels
    where server_id = p_server_id and type = 'text' order by position limit 1;
  end if;
  if v_channel is null then return; end if;

  select coalesce(display_name, username, 'Someone') into v_name
  from public.profiles where id = p_user_id;

  insert into public.messages (channel_id, author_id, content)
  values (
    v_channel,
    v_server.owner_id,
    format('👋 Everyone welcome **%s** to **%s**!', v_name, v_server.name)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. friendships: inserts may only create pending requests from self
-- ---------------------------------------------------------------------------
drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own" on public.friendships for insert to authenticated
  with check (
    auth.uid() = requester_id
    and status = 'pending'
    and requester_id <> addressee_id
  );

-- ---------------------------------------------------------------------------
-- 4. voice_presence: require channel membership to join
-- ---------------------------------------------------------------------------
drop policy if exists "voice_insert_own" on public.voice_presence;
create policy "voice_insert_own" on public.voice_presence for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.channels c
      where c.id = voice_presence.channel_id
        and public.is_server_member(c.server_id)
    )
  );

drop policy if exists "voice_update_own" on public.voice_presence;
create policy "voice_update_own" on public.voice_presence for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. dm_threads: only created via get_or_create_dm_thread (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
drop policy if exists "dm_threads_insert" on public.dm_threads;

-- ---------------------------------------------------------------------------
-- 6. Platform badges: protect on INSERT as well as UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.protect_platform_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A logged-in user (auth.uid() set) can never set their own badges; only the
  -- service role / dashboard (auth.uid() is null) may.
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.show_owner_badge := false;
      new.show_staff_badge := false;
    end if;
  elsif tg_op = 'UPDATE' then
    if (
      old.show_owner_badge is distinct from new.show_owner_badge
      or old.show_staff_badge is distinct from new.show_staff_badge
    ) and auth.uid() is not null then
      new.show_owner_badge := old.show_owner_badge;
      new.show_staff_badge := old.show_staff_badge;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_platform_badges on public.profiles;
create trigger profiles_protect_platform_badges
  before insert or update on public.profiles
  for each row execute function public.protect_platform_badges();

-- ---------------------------------------------------------------------------
-- 7. Mention notifications: only notify users who can see the message
-- ---------------------------------------------------------------------------
create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
  mentioned uuid[];
  v_server uuid;
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  select server_id into v_server from public.channels where id = new.channel_id;

  mentioned := coalesce(new.mentions, array[]::uuid[]);

  if new.content ~* '@everyone\b' then
    select coalesce(array_agg(distinct member_id), array[]::uuid[]) into mentioned
    from (
      select unnest(mentioned) as member_id
      union
      select sm.user_id
      from public.server_members sm
      where sm.server_id = v_server
        and sm.user_id <> new.author_id
    ) expanded;
  end if;

  foreach uid in array mentioned loop
    -- Only notify actual members of the server (prevents notifying arbitrary users).
    if uid is not null
       and uid <> new.author_id
       and exists (select 1 from public.server_members sm where sm.server_id = v_server and sm.user_id = uid)
    then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        'channel:' || new.channel_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Lock down information-disclosure helper functions
-- ---------------------------------------------------------------------------
-- NOTE: member_has_server_permission is referenced by the server_members_update
-- RLS policy, so it MUST remain executable by `authenticated` (RLS expressions
-- run with the caller's privileges). It only ever discloses a boolean.
-- These helpers are only invoked from SECURITY DEFINER functions/triggers, so we
-- can safely strip direct EXECUTE from clients.
revoke all on function public.is_blocked_between(uuid, uuid) from public;
revoke execute on function public.is_blocked_between(uuid, uuid) from authenticated;
revoke all on function public.profile_change_count(uuid, text, interval) from public;
revoke all on function public.profile_last_change(uuid, text) from public;
revoke all on function public.assert_username_policy(text) from public;
revoke all on function public.username_contains_blocked_word(text) from public;

-- my_server_permissions is SECURITY DEFINER and only reports for auth.uid(); keep it.
grant execute on function public.my_server_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. media_posts: enforce MFA AAL like other user tables
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='media_posts')
     and exists (select 1 from pg_proc where proname='auth_aal_allows_access') then
    execute 'drop policy if exists mfa_aal_required on public.media_posts';
    execute 'create policy mfa_aal_required on public.media_posts as restrictive to authenticated using (public.auth_aal_allows_access())';
  end if;
end $$;
