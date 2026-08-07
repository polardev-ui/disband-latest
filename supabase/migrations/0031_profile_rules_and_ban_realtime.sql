-- 0031_profile_rules_and_ban_realtime.sql
-- Profile rules:
--   * username changes limited to 10/day (was 2)
--   * blank/missing usernames are auto-derived from the display name
--     (lowercased, stripped to letters/numbers/underscores, e.g. "TFOEå…ß∂∆˙˙" -> "tfoe")
--   * display name must have at least one character
-- Ban delivery:
--   * platform_bans joins the realtime publication so already-online users
--     are kicked to the ban screen the moment a ban is written.

begin;

-- ===========================================================================
-- Required username + display name (write-time enforcement)
-- ===========================================================================
-- NOT VALID so existing legacy rows (NULL usernames/display names) are not
-- touched; the constraint is still enforced on every future insert/update.
alter table public.profiles drop constraint if exists profiles_username_required;
alter table public.profiles add constraint profiles_username_required
  check (username is not null and btrim(username) <> '') not valid;

alter table public.profiles drop constraint if exists profiles_display_name_required;
alter table public.profiles add constraint profiles_display_name_required
  check (display_name is not null and btrim(display_name) <> '') not valid;

-- ===========================================================================
-- resolve_username: return a valid unique username.
--   * a valid preferred username is kept as-is
--   * otherwise derive from display_name -> email prefix -> 'user', keeping
--     only [a-z0-9_], minimum 2 chars, maximum 25 chars
--   * a derived name that is already taken gets a numeric suffix
-- ===========================================================================
create or replace function public.resolve_username(
  p_preferred text default null,
  p_display_name text default null,
  p_email text default null,
  p_except_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preferred text := nullif(lower(trim(p_preferred)), '');
  v_base text;
  v_probe text;
  v_i integer := 0;
begin
  if v_preferred is not null and v_preferred ~ '^[a-z0-9_]{2,25}$' then
    return v_preferred;
  end if;

  v_base := regexp_replace(lower(coalesce(nullif(trim(p_display_name), ''), '')), '[^a-z0-9_]', '', 'g');
  if v_base = '' then
    v_base := regexp_replace(lower(coalesce(split_part(coalesce(p_email, ''), '@', 1), '')), '[^a-z0-9_]', '', 'g');
  end if;
  if v_base = '' then
    v_base := 'user';
  end if;
  while length(v_base) < 2 loop
    v_base := v_base || '0';
  end loop;
  v_base := left(v_base, 25);

  v_probe := v_base;
  while exists (
    select 1 from public.profiles
    where lower(username) = v_probe
      and (p_except_id is null or id <> p_except_id)
  ) loop
    v_i := v_i + 1;
    if v_i > 200 then
      v_probe := left(v_base, 20) || to_char(floor(random() * 100000)::bigint, 'FM00000');
      exit;
    end if;
    v_probe := left(v_base, 25 - length(v_i::text)) || v_i::text;
  end loop;
  return v_probe;
end;
$$;

-- ===========================================================================
-- Profile update limits (username 10/day, username + display name required)
-- ===========================================================================
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

  if new.display_name is null or length(trim(new.display_name)) = 0 then
    raise exception 'Display name cannot be empty.'
      using errcode = 'P0001';
  end if;

  if new.username is null or length(trim(new.username)) = 0 then
    new.username := public.resolve_username(null, new.display_name, null, new.id);
  end if;

  if new.username is distinct from old.username then
    perform public.assert_username_available(new.username, new.id);

    v_count := public.profile_change_count(new.id, 'username', interval '24 hours');
    if v_count >= 10 then
      raise exception 'You can only change your username 10 times per day.'
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

-- ===========================================================================
-- Signup requires a username (friendly error before the CHECK fires)
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := public.resolve_username(
    new.raw_user_meta_data ->> 'username',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.id
  );
  perform public.assert_username_available(v_username, new.id);

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

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    select * into v_user from auth.users where id = auth.uid();
    if not found then
      raise exception 'Auth user not found';
    end if;

    v_username := public.resolve_username(
      coalesce(v_username, nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), '')),
      coalesce(
        v_display_name,
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_user.email,
      auth.uid()
    );
    perform public.assert_username_available(v_username, auth.uid());

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
    if v_username is not null then
      v_username := public.resolve_username(
        v_username,
        coalesce(v_display_name, (select display_name from public.profiles where id = auth.uid())),
        null,
        auth.uid()
      );
    end if;
    update public.profiles
    set
      username = coalesce(v_username, username),
      display_name = coalesce(v_display_name, display_name),
      updated_at = now()
    where id = auth.uid();
  end if;
end;
$$;

-- ===========================================================================
-- ensure_user_profile: bootstrap a missing profile, deriving a username when
-- none was provided.
-- ===========================================================================
create or replace function public.ensure_user_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;

  select * into v_user from auth.users where id = auth.uid();
  if not found then
    raise exception 'Auth user not found';
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    v_user.id,
    public.resolve_username(
      nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), ''),
      coalesce(
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_user.email,
      v_user.id
    ),
    coalesce(
      nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
      split_part(v_user.email, '@', 1)
    ),
    v_user.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
end;
$$;

-- ===========================================================================
-- Backfill existing blank usernames from their display name. The update
-- trigger is disabled so the bulk write does not hit rate limits.
-- ===========================================================================
alter table public.profiles disable trigger profiles_enforce_update_limits;
update public.profiles
set username = public.resolve_username(null, display_name, null, id)
where username is null or btrim(username) = '';
alter table public.profiles enable trigger profiles_enforce_update_limits;

-- ===========================================================================
-- Realtime delivery for platform bans — kick online users to the ban screen
-- ===========================================================================
do $$
begin
  alter publication supabase_realtime add table public.platform_bans;
exception when duplicate_object then null;
end $$;

commit;
