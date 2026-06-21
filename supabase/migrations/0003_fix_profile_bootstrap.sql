-- Fix: servers.owner_id → profiles(id) fails when auth user has no profile row
-- (e.g. user created before trigger, sign-up UPDATE matched 0 rows, etc.)

-- Backfill any auth users missing a profile
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Ensure profile exists for the current user (callable from app or RPC)
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

  insert into public.profiles (id, display_name, avatar_url)
  values (
    v_user.id,
    coalesce(v_user.raw_user_meta_data ->> 'full_name', split_part(v_user.email, '@', 1)),
    v_user.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_user_profile() to authenticated;

-- Harden create_server: always bootstrap profile first
create or replace function public.create_server(
  p_name text,
  p_icon_url text default null,
  p_banner_url text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  c_info uuid;
  c_text uuid;
  c_voice uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_user_profile();

  insert into public.servers (name, icon_url, banner_url, description, owner_id)
  values (p_name, p_icon_url, p_banner_url, p_description, auth.uid())
  returning id into v_id;

  insert into public.server_members (server_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'INFO', 0) returning id into c_info;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'TEXT CHANNELS', 1) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'VOICE CHANNELS', 2) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_info, 'welcome', 'text', 0),
    (v_id, c_info, 'rules', 'text', 1),
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_voice, 'Lounge', 'voice', 0);

  return v_id;
end;
$$;

grant execute on function public.create_server(text, text, text, text) to authenticated;
