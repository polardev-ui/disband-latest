-- ---------------------------------------------------------------------------
-- 0134: Temporarily allow 1-character usernames.
--
-- Lowers the minimum username length from 2 to 1 across every enforcement
-- path (assert_username_available, check_username_available, resolve_username
-- preferred-name + derived-base padding). Revert with 0135 to restore the
-- 2-character minimum.
-- ---------------------------------------------------------------------------
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

  if p_username !~ '^[a-z0-9_]{1,25}$' then
    raise exception 'Usernames must be 1–25 characters: letters, numbers, and underscores only.'
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

  if v_norm !~ '^[a-z0-9_]{1,25}$' then
    return jsonb_build_object('available', false, 'reason', 'Use 1–25 letters, numbers, or underscores');
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
  if v_preferred is not null and v_preferred ~ '^[a-z0-9_]{1,25}$' then
    return v_preferred;
  end if;

  v_base := regexp_replace(lower(coalesce(nullif(trim(p_display_name), ''), '')), '[^a-z0-9_]', '', 'g');
  if v_base = '' then
    v_base := regexp_replace(lower(coalesce(split_part(coalesce(p_email, ''), '@', 1), '')), '[^a-z0-9_]', '', 'g');
  end if;
  if v_base = '' then
    v_base := 'user';
  end if;
  while length(v_base) < 1 loop
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