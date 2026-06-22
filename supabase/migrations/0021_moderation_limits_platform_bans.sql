-- Message word limits, bio cap, username policy, role permissions, platform bans, signup blocks.

-- ---------------------------------------------------------------------------
-- Platform bans & signup IP blocks
-- ---------------------------------------------------------------------------
create table if not exists public.platform_bans (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  banned_by  uuid references public.profiles (id) on delete set null,
  reason     text,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists public.signup_ip_blocks (
  id            uuid primary key default gen_random_uuid(),
  ip_hash       text not null,
  blocked_until timestamptz not null,
  reason        text,
  created_at    timestamptz not null default now()
);

create index if not exists signup_ip_blocks_lookup_idx
  on public.signup_ip_blocks (ip_hash, blocked_until desc);

alter table public.platform_bans enable row level security;
alter table public.signup_ip_blocks enable row level security;

create policy "platform_bans_select_own" on public.platform_bans
  for select to authenticated
  using (user_id = auth.uid());

create policy "platform_bans_select_owner" on public.platform_bans
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.show_owner_badge = true
    )
  );

-- Bio length (120 chars; line breaks count)
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 120);

-- ---------------------------------------------------------------------------
-- Word counting & message limits (500 words max)
-- ---------------------------------------------------------------------------
create or replace function public.count_words(p_text text)
returns integer
language sql
immutable
as $$
  select case
    when p_text is null or btrim(p_text) = '' then 0
    else coalesce(
      array_length(
        regexp_split_to_array(btrim(regexp_replace(p_text, '\s+', ' ', 'g')), '\s+'),
        1
      ),
      0
    )
  end;
$$;

create or replace function public.enforce_message_word_limit()
returns trigger
language plpgsql
as $$
begin
  if public.count_words(new.content) > 500 then
    raise exception 'Messages cannot exceed 500 words.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_word_limit on public.messages;
create trigger messages_word_limit
  before insert or update of content on public.messages
  for each row execute function public.enforce_message_word_limit();

drop trigger if exists dm_messages_word_limit on public.dm_messages;
create trigger dm_messages_word_limit
  before insert or update of content on public.dm_messages
  for each row execute function public.enforce_message_word_limit();

drop trigger if exists group_messages_word_limit on public.group_messages;
create trigger group_messages_word_limit
  before insert or update of content on public.group_messages
  for each row execute function public.enforce_message_word_limit();

-- ---------------------------------------------------------------------------
-- Username policy (blocked words)
-- ---------------------------------------------------------------------------
create or replace function public.username_contains_blocked_word(p_username text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_clean text;
  v_word text;
  v_blocked text[] := array[
    'nigger', 'nigga', 'benjaminnetanyahu', 'childporn', 'racist', 'hitler',
    'faggot', 'fag', 'kike', 'chink', 'spic', 'wetback', 'pedophile', 'pedo',
    'nazi', 'nazis', 'holocaust', 'terrorist', 'isis', 'rape', 'rapist',
    'incest', 'bestiality', 'loli', 'lolicon', 'shota', 'shotacon'
  ];
begin
  v_clean := regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9]', '', 'g');
  if v_clean = '' then
    return false;
  end if;
  if v_clean = 'cp' or v_clean like '%cp%' and length(v_clean) <= 4 then
    return true;
  end if;
  foreach v_word in array v_blocked loop
    if position(v_word in v_clean) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.assert_username_policy(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.username_contains_blocked_word(p_username) then
    raise exception 'That username is not allowed.'
      using errcode = 'P0001';
  end if;
end;
$$;

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

  if p_username !~ '^[a-z0-9_]{2,32}$' then
    raise exception 'Usernames must be 2–32 characters: letters, numbers, and underscores only.'
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

  if v_norm !~ '^[a-z0-9_]{2,32}$' then
    return jsonb_build_object('available', false, 'reason', 'Use 2–32 letters, numbers, or underscores');
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

create or replace function public.record_signup_ip_block(p_ip_hash text, p_hours integer default 24, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ip_hash is null or length(trim(p_ip_hash)) = 0 then
    return;
  end if;
  insert into public.signup_ip_blocks (ip_hash, blocked_until, reason)
  values (p_ip_hash, now() + make_interval(hours => coalesce(p_hours, 24)), p_reason);
end;
$$;

create or replace function public.is_signup_ip_blocked(p_ip_hash text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.signup_ip_blocks
    where ip_hash = p_ip_hash
      and blocked_until > now()
  );
$$;

grant execute on function public.record_signup_ip_block(text, integer, text) to service_role;
grant execute on function public.is_signup_ip_blocked(text) to service_role;

-- Block re-registration with banned emails
create or replace function public.prevent_banned_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.platform_bans pb
    where pb.email is not null
      and lower(pb.email) = lower(new.email)
  ) then
    raise exception 'This email cannot create an account while a platform ban is active.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_banned_email_signup on auth.users;
create trigger prevent_banned_email_signup
  before insert on auth.users
  for each row execute function public.prevent_banned_email_signup();

-- Bio enforcement on profile updates
create or replace function public.enforce_bio_length()
returns trigger
language plpgsql
as $$
begin
  if new.bio is not null and char_length(new.bio) > 120 then
    raise exception 'Bio cannot exceed 120 characters.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_bio_length on public.profiles;
create trigger profiles_bio_length
  before insert or update of bio on public.profiles
  for each row execute function public.enforce_bio_length();

-- ---------------------------------------------------------------------------
-- Role permission checks
-- ---------------------------------------------------------------------------
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

create or replace function public.my_server_permissions(p_server_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'kick', public.member_has_server_permission(p_server_id, v_uid, 'kick'),
    'ban', public.member_has_server_permission(p_server_id, v_uid, 'ban'),
    'manage_roles', public.member_has_server_permission(p_server_id, v_uid, 'manage_roles'),
    'manage_server', public.member_has_server_permission(p_server_id, v_uid, 'manage_server')
  );
end;
$$;

grant execute on function public.my_server_permissions(uuid) to authenticated;

-- Kick / ban with role permissions; ban deletes all server messages
create or replace function public.kick_server_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'kick') then
    raise exception 'Insufficient permissions';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot kick the server owner';
  end if;
  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

create or replace function public.ban_server_member(p_server_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'ban') then
    raise exception 'Insufficient permissions';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot ban the server owner';
  end if;

  delete from public.messages m
  using public.channels c
  where m.channel_id = c.id
    and c.server_id = p_server_id
    and m.author_id = p_user_id;

  insert into public.server_bans (server_id, user_id, banned_by, reason)
  values (p_server_id, p_user_id, auth.uid(), p_reason)
  on conflict (server_id, user_id) do update
    set banned_by = excluded.banned_by,
        reason = excluded.reason,
        created_at = now();

  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

-- Allow admins to update member roles
drop policy if exists "server_members_update" on public.server_members;
create policy "server_members_update" on public.server_members
  for update to authenticated
  using (
    auth.uid() = user_id
    or public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  )
  with check (
    auth.uid() = user_id
    or public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  );

-- MFA policies for new tables
drop policy if exists mfa_aal_required on public.platform_bans;
create policy mfa_aal_required
  on public.platform_bans
  as restrictive
  to authenticated
  using (public.auth_aal_allows_access());

drop policy if exists mfa_aal_required on public.signup_ip_blocks;
create policy mfa_aal_required
  on public.signup_ip_blocks
  as restrictive
  to authenticated
  using (public.auth_aal_allows_access());
