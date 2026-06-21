-- Fix sign-up RLS: client INSERT/upsert on profiles fails when session is missing
-- or before the auth trigger row exists. Bootstrap profiles via security definer.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), ''),
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
    nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), ''),
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

-- Called after sign-up when a session exists, or on first login to apply username.
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

    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      auth.uid(),
      coalesce(v_username, nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), '')),
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

grant execute on function public.complete_signup_profile(text, text) to authenticated;
