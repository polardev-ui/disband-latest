-- Case-insensitive unique usernames, profile change rate limits, group message anti-spam.

-- ---------------------------------------------------------------------------
-- Username uniqueness (case-insensitive)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_username_key;
drop index if exists profiles_username_lower_unique;
create unique index profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- Profile change audit log (written by security-definer triggers)
-- ---------------------------------------------------------------------------
create table if not exists public.profile_change_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  field      text not null check (field in ('username', 'display_name', 'avatar', 'appearance', 'banner')),
  changed_at timestamptz not null default now()
);

create index if not exists profile_change_log_user_field_idx
  on public.profile_change_log (user_id, field, changed_at desc);

alter table public.profile_change_log enable row level security;

create or replace function public.profile_change_count(
  p_user_id uuid,
  p_field text,
  p_window interval
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profile_change_log
  where user_id = p_user_id
    and field = p_field
    and changed_at > now() - p_window;
$$;

create or replace function public.profile_last_change(
  p_user_id uuid,
  p_field text
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(changed_at)
  from public.profile_change_log
  where user_id = p_user_id
    and field = p_field;
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

  if p_username !~ '^[a-z0-9_]{2,32}$' then
    raise exception 'Usernames must be 2–32 characters: letters, numbers, and underscores only.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(username) = lower(p_username)
      and id <> p_user_id
  ) then
    raise exception 'That username is already taken.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.enforce_profile_update_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_count integer;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.username is distinct from old.username then
    perform public.assert_username_available(new.username, new.id);

    v_count := public.profile_change_count(new.id, 'username', interval '24 hours');
    if v_count >= 2 then
      raise exception 'You can only change your username twice per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'username');
  end if;

  if new.display_name is distinct from old.display_name then
    v_last := public.profile_last_change(new.id, 'display_name');
    if v_last is not null and v_last > now() - interval '20 seconds' then
      raise exception 'Wait 20 seconds before changing your display name again.'
        using errcode = 'P0001';
    end if;

    v_count := public.profile_change_count(new.id, 'display_name', interval '24 hours');
    if v_count >= 10 then
      raise exception 'You can only change your display name 10 times per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'display_name');
  end if;

  if new.avatar_url is distinct from old.avatar_url
     or new.avatar_crop is distinct from old.avatar_crop then
    v_last := public.profile_last_change(new.id, 'avatar');
    if v_last is not null and v_last > now() - interval '60 seconds' then
      raise exception 'Wait a minute before changing your profile picture again.'
        using errcode = 'P0001';
    end if;

    v_count := public.profile_change_count(new.id, 'avatar', interval '24 hours');
    if v_count >= 10 then
      raise exception 'You can only change your profile picture 10 times per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'avatar');
  end if;

  if new.accent_color is distinct from old.accent_color
     or new.accent_color_2 is distinct from old.accent_color_2 then
    v_last := public.profile_last_change(new.id, 'appearance');
    if v_last is not null and v_last > now() - interval '30 seconds' then
      raise exception 'Wait 30 seconds before changing profile colors again.'
        using errcode = 'P0001';
    end if;

    v_count := public.profile_change_count(new.id, 'appearance', interval '24 hours');
    if v_count >= 20 then
      raise exception 'You can only change profile colors 20 times per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'appearance');
  end if;

  if new.banner_url is distinct from old.banner_url then
    v_last := public.profile_last_change(new.id, 'banner');
    if v_last is not null and v_last > now() - interval '60 seconds' then
      raise exception 'Wait a minute before changing your banner again.'
        using errcode = 'P0001';
    end if;

    v_count := public.profile_change_count(new.id, 'banner', interval '24 hours');
    if v_count >= 5 then
      raise exception 'You can only change your banner 5 times per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'banner');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_update_limits on public.profiles;
create trigger profiles_enforce_update_limits
  before update on public.profiles
  for each row execute function public.enforce_profile_update_limits();

-- Sign-up profile bootstrap: reject taken usernames
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '');
  if v_username is not null then
    perform public.assert_username_available(v_username, new.id);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.complete_signup_profile(
  p_username text default null,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_username text;
  v_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_username := nullif(lower(trim(p_username)), '');
  v_display_name := nullif(trim(p_display_name), '');

  if v_username is not null then
    perform public.assert_username_available(v_username, auth.uid());
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    select * into v_user from auth.users where id = auth.uid();
    if not found then
      raise exception 'Auth user not found';
    end if;

    v_username := coalesce(v_username, nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), ''));
    if v_username is not null then
      perform public.assert_username_available(v_username, auth.uid());
    end if;

    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      auth.uid(),
      v_username,
      coalesce(
        v_display_name,
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_user.raw_user_meta_data ->> 'avatar_url'
    );
  elsif v_username is not null or v_display_name is not null then
    update public.profiles
    set
      username = coalesce(v_username, username),
      display_name = coalesce(v_display_name, display_name),
      updated_at = now()
    where id = auth.uid();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group chat message rate limits
-- ---------------------------------------------------------------------------
create index if not exists group_messages_spam_guard_idx
  on public.group_messages (group_id, author_id, created_at desc);

create or replace function public.enforce_group_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_burst integer;
  v_minute integer;
begin
  select count(*)::integer into v_burst
  from public.group_messages
  where group_id = new.group_id
    and author_id = new.author_id
    and created_at > now() - interval '5 seconds';

  if v_burst >= 5 then
    raise exception 'You are sending messages too quickly. Slow down.'
      using errcode = 'P0001';
  end if;

  select count(*)::integer into v_minute
  from public.group_messages
  where group_id = new.group_id
    and author_id = new.author_id
    and created_at > now() - interval '1 minute';

  if v_minute >= 25 then
    raise exception 'Message limit reached for this group. Try again in a minute.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists group_messages_enforce_rate on public.group_messages;
create trigger group_messages_enforce_rate
  before insert on public.group_messages
  for each row execute function public.enforce_group_message_rate();

-- MFA gate for change log table (opt-in users need AAL2)
drop policy if exists mfa_aal_required on public.profile_change_log;
create policy mfa_aal_required
  on public.profile_change_log
  as restrictive
  to authenticated
  using (public.auth_aal_allows_access());
