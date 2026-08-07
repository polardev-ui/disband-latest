-- 0030_security_fixes.sql
-- Security fixes from the 2026-08 security audit.
--
-- Fixes (by severity):
--   CRITICAL  subscriptions RLS: FOR ALL policy applied to PUBLIC (missing `to` clause)
--   HIGH      friendships: either participant could self-accept / self-unblock
--   HIGH      server_members: any admin could delete the owner's membership row
--   MEDIUM    mention triggers notify arbitrary users (no membership check)
--   MEDIUM    notify_push / record_signup_ip_block / is_signup_ip_blocked /
--             get_subscription_plan callable by PUBLIC (no auth)
--   MEDIUM    message/dm/group/voice UPDATE policies let authors move rows into
--             resources they cannot access
--   MEDIUM    member_has_server_permission is a cross-user permission oracle
--   MEDIUM    platform bans not enforced at the data layer
--   MEDIUM    custom_emoji insert policy let ANY member (role_id != null) insert
--   LOW       MFA AAL2 not enforced on newer tables
--   LOW       server_boosts boost any server + no way to remove (app bug too)
--   LOW       default PUBLIC EXECUTE on SECURITY DEFINER functions

begin;

-- ===========================================================================
-- CRITICAL: subscriptions RLS — scope the write policy to service_role only.
-- ===========================================================================
drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions" on public.subscriptions
  for all to service_role
  using (true)
  with check (true);

-- Authenticated users may only read their own subscription row. Updates flow
-- exclusively through the Stripe webhook (service_role).
drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription" on public.subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

-- ===========================================================================
-- HIGH: friendships — block self-accept and block-bypass via UPDATE/DELETE.
-- Blocks are managed only through block_user/unblock_user (SECURITY DEFINER).
-- ===========================================================================
drop policy if exists "friendships_update_participant" on public.friendships;
create policy "friendships_update_transition" on public.friendships
  for update to authenticated
  using (
    auth.uid() in (requester_id, addressee_id)
    and status <> 'blocked'
  )
  with check (
    auth.uid() in (requester_id, addressee_id)
    and status in ('accepted', 'declined', 'pending')
  );

drop policy if exists "friendships_delete_participant" on public.friendships;
create policy "friendships_delete_nonblocked" on public.friendships
  for delete to authenticated
  using (
    auth.uid() in (requester_id, addressee_id)
    and status <> 'blocked'
  );

-- Enforce fine-grained transition rules the policy language cannot express:
--   - only the addressee may accept a pending request
--   - the requester may only cancel (decline) their own pending request
--   - no status changes out of 'pending' (blocks included)
create or replace function public.guard_friendship_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Friend requests can only be accepted or declined while pending.'
        using errcode = 'P0001';
    end if;
    if auth.uid() = new.requester_id then
      if new.status <> 'declined' then
        raise exception 'Only the recipient can accept a friend request.'
          using errcode = 'P0001';
      end if;
    elsif auth.uid() = new.addressee_id then
      if new.status not in ('accepted', 'declined') then
        raise exception 'The recipient can only accept or decline a request.'
          using errcode = 'P0001';
      end if;
    else
      raise exception 'Not a participant.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists friendships_transition_guard on public.friendships;
create trigger friendships_transition_guard
  before update or delete on public.friendships
  for each row execute function public.guard_friendship_transition();

-- ===========================================================================
-- HIGH: server_members — admins must not be able to remove privileged rows
-- (owner / other admins). Members may still leave on their own, and the owner
-- may still manage their server.
-- ===========================================================================
create or replace function public.guard_server_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role in ('owner', 'admin') then
    if auth.uid() is not null
       and auth.uid() <> old.user_id
       and not public.is_server_owner(old.server_id)
    then
      raise exception 'Only the server owner can remove privileged members.'
        using errcode = 'P0001';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists server_members_delete_guard on public.server_members;
create trigger server_members_delete_guard
  before delete on public.server_members
  for each row execute function public.guard_server_member_delete();

-- ===========================================================================
-- MEDIUM: mention notifications must only reach users who can actually see
-- the message (DM participant / group member). Push trigger too.
-- ===========================================================================
create or replace function public.notify_dm_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid;
  author_name text;
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid is not null and uid <> new.author_id
       and exists (
         select 1 from public.dm_threads t
         where t.id = new.thread_id and (t.user_a = uid or t.user_b = uid)
       )
    then
      insert into public.notifications (user_id, type, title, body, link)
      values (uid, 'mention', author_name || ' mentioned you', left(new.content, 200), 'dm:' || new.thread_id::text);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.notify_group_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid is not null and uid <> new.author_id
       and exists (
         select 1 from public.group_chat_members gm
         where gm.group_id = new.group_id and gm.user_id = uid
       )
    then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        '/group/' || new.group_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.on_channel_mention_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender text; uid uuid; v_server uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then return new; end if;
  select server_id into v_server from public.channels where id = new.channel_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid is not null and uid <> new.author_id
       and v_server is not null
       and exists (select 1 from public.server_members sm
                   where sm.server_id = v_server and sm.user_id = uid)
    then
      perform public.notify_push(uid, 'New mention', sender || ' mentioned you');
    end if;
  end loop;
  return new;
end; $$;

drop trigger if exists trg_channel_mention_push on public.messages;
create trigger trg_channel_mention_push after insert on public.messages
  for each row execute function public.on_channel_mention_push();

-- ===========================================================================
-- MEDIUM: lock down PUBLIC-callable SECURITY DEFINER helpers.
-- notify_push is trigger-internal only; signup-IP helpers are service-only;
-- get_subscription_plan / assert_username_available are unused by clients.
-- ===========================================================================
revoke all on function public.notify_push(uuid, text, text) from public;
revoke all on function public.notify_push(uuid, text, text) from anon;
revoke all on function public.notify_push(uuid, text, text) from authenticated;

revoke all on function public.record_signup_ip_block(text, integer, text) from public;
revoke all on function public.record_signup_ip_block(text, integer, text) from anon;
revoke all on function public.record_signup_ip_block(text, integer, text) from authenticated;

revoke all on function public.is_signup_ip_blocked(text) from public;
revoke all on function public.is_signup_ip_blocked(text) from anon;
revoke all on function public.is_signup_ip_blocked(text) from authenticated;

revoke all on function public.get_subscription_plan(uuid) from public;
revoke all on function public.get_subscription_plan(uuid) from anon;

revoke all on function public.assert_username_available(text, uuid) from public;

-- Hygiene: the authenticated-only SECURITY DEFINER RPCs were also reachable by
-- the `anon` role through the implicit PUBLIC grant (they self-guard with
-- auth.uid() checks, but stripping PUBLIC shrinks the surface).
revoke all on function public.create_server(text, text, text, text) from public;
revoke all on function public.delete_server(uuid) from public;
revoke all on function public.get_or_create_dm_thread(uuid) from public;
revoke all on function public.kick_server_member(uuid, uuid) from public;
revoke all on function public.ban_server_member(uuid, uuid, text) from public;
revoke all on function public.join_server_by_invite(text) from public;
revoke all on function public.ensure_user_profile() from public;
revoke all on function public.complete_signup_profile(text, text) from public;
revoke all on function public.create_group_chat(text, uuid[]) from public;
revoke all on function public.add_group_members(uuid, uuid[]) from public;
revoke all on function public.leave_group_chat(uuid) from public;
revoke all on function public.rename_group_chat(uuid, text) from public;
revoke all on function public.block_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.post_server_welcome(uuid, uuid) from public;
revoke all on function public.my_server_permissions(uuid) from public;

-- ===========================================================================
-- MEDIUM: member_has_server_permission was a cross-user permission oracle.
-- It is only ever invoked with auth.uid() internally, so restrict it to the
-- caller's own user id (RLS / kick / ban / my_server_permissions all pass
-- auth.uid(), which keeps working).
-- ===========================================================================
create or replace function public.member_has_server_permission(
  p_server_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_legacy_role text;
  v_role_id uuid;
  v_perms jsonb;
begin
  -- Oracle guard: only ever report on the caller's own membership/permissions.
  if p_user_id is distinct from auth.uid() then
    return false;
  end if;

  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    return true;
  end if;

  select sm.role, sm.role_id into v_legacy_role, v_role_id
  from public.server_members sm
  where sm.server_id = p_server_id and sm.user_id = p_user_id;

  if not found then
    return false;
  end if;

  if v_legacy_role in ('owner', 'admin') then
    return true;
  end if;

  if v_role_id is not null then
    select sr.permissions into v_perms
    from public.server_roles sr
    where sr.id = v_role_id and sr.server_id = p_server_id;

    if coalesce((v_perms ->> p_permission)::boolean, false) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.member_has_server_permission(uuid, uuid, text) to authenticated;

-- ===========================================================================
-- MEDIUM: message / dm / group / voice UPDATE policies let authors move rows
-- into channels / threads / groups / voice channels they cannot access.
-- New rows must stay inside resources the author is a member of.
-- ===========================================================================
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update to authenticated
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_server_member(c.server_id)
    )
  );

drop policy if exists "dm_messages_update_own" on public.dm_messages;
create policy "dm_messages_update_own" on public.dm_messages for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.dm_threads t
      where t.id = thread_id and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

drop policy if exists "group_messages_update_own" on public.group_messages;
create policy "group_messages_update_own" on public.group_messages for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and public.is_group_member(group_id)
  );

drop policy if exists "voice_update_own" on public.voice_presence;
create policy "voice_update_own" on public.voice_presence for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_server_member(c.server_id)
    )
  );

-- ===========================================================================
-- MEDIUM: enforce platform bans at the data layer — banned users cannot write
-- new content (reads stay intact; ban UI shows the ban screen).
-- ===========================================================================
create or replace function public.is_platform_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_bans where user_id = auth.uid());
$$;

grant execute on function public.is_platform_banned() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'messages',
    'dm_messages',
    'group_messages',
    'voice_presence',
    'server_members',
    'friendships',
    'custom_emoji',
    'server_boosts',
    'notifications'
  ]
  loop
    execute format('drop policy if exists banned_users_no_write on public.%I', t);
    execute format(
      'create policy banned_users_no_write on public.%I as restrictive for insert to authenticated with check (not public.is_platform_banned())',
      t
    );
  end loop;
end $$;

-- ===========================================================================
-- MEDIUM/LOW: custom_emoji — any member with any role_id could insert emoji
-- (every member has a role_id). Only server moderators (owner/admin) may add
-- or remove emoji, and uploader_id must be the caller.
-- ===========================================================================
drop policy if exists "Members with manage_emoji can insert" on public.custom_emoji;
create policy "moderators_insert_emoji" on public.custom_emoji for insert to authenticated
  with check (
    public.is_server_admin(server_id)
    and uploader_id = auth.uid()
  );

create policy "moderators_delete_emoji" on public.custom_emoji for delete to authenticated
  using (public.is_server_admin(server_id));

-- ===========================================================================
-- LOW: server_boosts — must be a member of the boosted server, and users
-- need a way to remove their own boost (the app already toggles this).
-- ===========================================================================
drop policy if exists "Users can manage own boosts" on public.server_boosts;
create policy "Users can boost joined servers" on public.server_boosts for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.server_members sm
      where sm.server_id = server_boosts.server_id and sm.user_id = auth.uid()
    )
  );

create policy "Users can remove own boosts" on public.server_boosts for delete to authenticated
  using (auth.uid() = user_id);

-- ===========================================================================
-- LOW: extend MFA AAL2 enforcement to the newer tables that missed 0018.
-- ===========================================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'subscriptions',
    'custom_emoji',
    'server_boosts',
    'device_tokens',
    'notes'
  ]
  loop
    execute format('drop policy if exists mfa_aal_required on public.%I', tbl);
    execute format(
      'create policy mfa_aal_required on public.%I as restrictive to authenticated using (public.auth_aal_allows_access())',
      tbl
    );
  end loop;
end $$;

-- ===========================================================================
-- LOW: constrain accent_color to hex values at the DB layer (client already
-- writes 6-digit hex presets). Guards against CSS value injection if a row is
-- ever written outside the picker.
-- ===========================================================================
-- Existing data may contain non-hex accents (legacy presets, imports). Null
-- them out so the UI falls back to the default accent instead of blocking the
-- migration. The update-ratelimit trigger would otherwise reject the cleanup.
alter table public.profiles disable trigger profiles_enforce_update_limits;

update public.profiles
  set accent_color = null
  where accent_color is not null
    and accent_color !~ '^#[0-9a-fA-F]{6}$';

update public.profiles
  set accent_color_2 = null
  where accent_color_2 is not null
    and accent_color_2 !~ '^#[0-9a-fA-F]{6}$';

alter table public.profiles enable trigger profiles_enforce_update_limits;

alter table public.profiles
  drop constraint if exists profiles_accent_color_format;

alter table public.profiles
  add constraint profiles_accent_color_format check (
    accent_color is null
    or accent_color ~ '^#[0-9a-fA-F]{6}$'
  );

alter table public.profiles
  drop constraint if exists profiles_accent_color_2_format;

alter table public.profiles
  add constraint profiles_accent_color_2_format check (
    accent_color_2 is null
    or accent_color_2 ~ '^#[0-9a-fA-F]{6}$'
  );

-- ===========================================================================
-- NOTE (not changed here): `profiles_select_all` exposes every profile column
-- (including per-user settings such as notification prefs) to all authenticated
-- users. The client reads profiles with `select *`, so hiding columns requires
-- a client refactor to explicit column lists + a public-facing view. Left as a
-- documented follow-up. Most exposed fields are already rendered in the UI
-- (bio, banner, accent colors, status, badges); the truly private fields are
-- sound_enabled / desktop_notifications_enabled / link_previews_enabled.
-- ===========================================================================

commit;
