-- Welcome channel + join welcome messages

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

-- Add welcome channel to create_server
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
  v_invite text;
  c_text uuid;
  c_voice uuid;
  r_everyone uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.ensure_user_profile();

  v_invite := public.generate_invite_code();
  while exists (select 1 from public.servers where invite_code = v_invite) loop
    v_invite := public.generate_invite_code();
  end loop;

  insert into public.servers (name, icon_url, banner_url, description, owner_id, invite_code)
  values (p_name, p_icon_url, p_banner_url, p_description, auth.uid(), v_invite)
  returning id into v_id;

  insert into public.server_roles (server_id, name, color, position, is_default, permissions)
  values (v_id, '@everyone', '#949ba4', 0, true, '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false}'::jsonb)
  returning id into r_everyone;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_id, auth.uid(), 'owner', r_everyone);

  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Text Channels', 0) returning id into c_text;
  insert into public.channel_categories (server_id, name, position)
  values (v_id, 'Voice Channels', 1) returning id into c_voice;

  insert into public.channels (server_id, category_id, name, type, position) values
    (v_id, c_text, 'general', 'text', 0),
    (v_id, c_text, 'welcome', 'text', 1),
    (v_id, c_voice, 'voice-1', 'voice', 0);

  return v_id;
end;
$$;

-- Welcome message when joining via invite
create or replace function public.join_server_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server public.servers%rowtype;
  v_role uuid;
  v_already boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.ensure_user_profile();

  select * into v_server from public.servers where invite_code = p_code;
  if not found then raise exception 'Invalid invite code'; end if;

  if exists (select 1 from public.server_bans where server_id = v_server.id and user_id = auth.uid()) then
    raise exception 'You are banned from this server';
  end if;

  v_already := exists (
    select 1 from public.server_members where server_id = v_server.id and user_id = auth.uid()
  );
  if v_already then return v_server.id; end if;

  select id into v_role from public.server_roles
  where server_id = v_server.id and is_default = true limit 1;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_server.id, auth.uid(), 'member', v_role);

  perform public.post_server_welcome(v_server.id, auth.uid());

  return v_server.id;
end;
$$;

-- Backfill welcome channel for servers missing it
do $$
declare
  s record;
  c_text uuid;
begin
  for s in select id from public.servers loop
    select id into c_text from public.channel_categories
    where server_id = s.id and name = 'Text Channels' limit 1;
    if c_text is not null and not exists (
      select 1 from public.channels where server_id = s.id and name = 'welcome'
    ) then
      insert into public.channels (server_id, category_id, name, type, position)
      values (s.id, c_text, 'welcome', 'text', 99);
    end if;
  end loop;
end $$;

grant execute on function public.post_server_welcome(uuid, uuid) to authenticated;
