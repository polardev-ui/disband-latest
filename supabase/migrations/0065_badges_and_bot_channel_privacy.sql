-- Apply after 0064. Protect badge identity and private channels from bots.
begin;
-- RLS restricts rows, not columns. Owning a badge must not allow changing its key to Owner.
revoke update on public.user_badges from public, anon, authenticated;
grant update(visible) on public.user_badges to authenticated;

-- Match the existing role/override algorithm, with an explicit service-only actor.
create or replace function public.channel_permission_for(
  p_actor uuid,
  p_channel_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := p_actor;
  v_server_id uuid;
  v_read_only boolean := false;
  v_has_overrides boolean;
  v_role record;
  v_row public.channel_permissions%rowtype;
  v_perms jsonb;
  v_role_allowed boolean;
  v_grant boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  select c.server_id, coalesce(c.read_only, false)
    into v_server_id, v_read_only
    from public.channels c where c.id = p_channel_id;
  if v_server_id is null then
    return false; -- channel doesn't exist
  end if;

  if not exists (select 1 from public.server_members where server_id = v_server_id and user_id = v_uid) then
    return false;
  end if;

  -- Owner / admin legacy roles bypass everything.
  if exists (
    select 1 from public.server_members m
    where m.server_id = v_server_id and m.user_id = v_uid and m.role in ('owner', 'admin')
  ) then
    return true;
  end if;

  -- manage_channels holders can do everything in any channel.
  if public.member_has_server_permission(v_server_id, v_uid, 'manage_channels') then
    return true;
  end if;

  -- read_only only ever blocks posting (and the bypasses above still apply).
  if p_permission = 'post' and v_read_only then
    return false;
  end if;

  select exists (select 1 from public.channel_permissions cp
                  where cp.channel_id = p_channel_id) into v_has_overrides;

  -- No override rows on this channel: keep legacy open behavior.
  if not v_has_overrides then
    return true;
  end if;

  -- Combine rows + per-role key fallbacks across assigned roles + @everyone.
  for v_role in (
    select mr.role_id
    from public.member_roles mr
    where mr.server_id = v_server_id and mr.user_id = v_uid
    union
    select sr.id
    from public.server_roles sr
    where sr.server_id = v_server_id and sr.is_default
  ) loop
    v_row := null;
    select cp.* into v_row
      from public.channel_permissions cp
      where cp.channel_id = p_channel_id and cp.role_id = v_role.role_id;

    select r.permissions into v_perms
      from public.server_roles r where r.id = v_role.role_id;
    if not found then
      v_perms := null;
    end if;

    if p_permission = 'view' then
      -- Server members can see channels by default (NULL row / no row).
      v_role_allowed := coalesce(v_row.can_view, true);
    elsif p_permission = 'post' then
      v_role_allowed := coalesce(v_row.can_post, coalesce((v_perms->>'send_messages')::boolean, false));
    elsif p_permission = 'react' then
      v_role_allowed := coalesce(v_row.can_react, coalesce((v_perms->>'add_reactions')::boolean, false));
    else -- 'attach'
      v_role_allowed := coalesce(v_row.can_attach, coalesce((v_perms->>'attach_files')::boolean, false));
    end if;

    if v_role_allowed then
      v_grant := true;
    end if;
  end loop;

  return v_grant;
end;
$$;
revoke all on function public.channel_permission_for(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.channel_permission_for(uuid,uuid,text) to service_role;

create or replace function public.bot_send_message(
  p_bot_id      uuid,
  p_channel_id  uuid,
  p_content     text,
  p_reply_to_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot     public.bots%rowtype;
  v_channel public.channels%rowtype;
  v_server  uuid;
  v_msg     public.messages%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted from posting';
  end if;

  select * into v_channel from public.channels where id = p_channel_id;
  if not found then
    raise exception 'Channel not found';
  end if;
  v_server := v_channel.server_id;
  if not public.channel_permission_for(v_bot.user_id, p_channel_id, 'view') or not public.channel_permission_for(v_bot.user_id, p_channel_id, 'post') then raise exception 'Channel permission denied'; end if;


  if not exists (
    select 1 from public.server_members
    where server_id = v_server and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'messages.write' = any (scopes)
  ) then
    raise exception 'This bot does not have messages.write in that server';
  end if;

  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'Message content is required';
  end if;
  if length(p_content) > 4000 then
    raise exception 'Message content is too long (max 4000 characters)';
  end if;

  if btrim(p_content) ~* '@(everyone|here)\b'
     and not public.bot_has_server_permission(v_server, v_bot.user_id, 'mention_everyone') then
    raise exception 'This bot needs the mention_everyone permission to use @everyone';
  end if;

  if v_channel.read_only
     and not public.bot_has_server_permission(v_server, v_bot.user_id, 'manage_channels') then
    raise exception 'That channel is read-only';
  end if;

  if p_reply_to_id is not null
     and not exists (
       select 1 from public.messages
       where id = p_reply_to_id and channel_id = p_channel_id
     ) then
    raise exception 'Reply target not found';
  end if;

  insert into public.messages (channel_id, author_id, content, reply_to_id)
  values (p_channel_id, v_bot.user_id, btrim(p_content), p_reply_to_id)
  returning * into v_msg;

  return public.bot_message_to_json(v_msg, v_server);
end;
$$;

create or replace function public.bot_list_messages(
  p_bot_id     uuid,
  p_channel_id uuid,
  p_limit      int default 50,
  p_before_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot     public.bots%rowtype;
  v_channel public.channels%rowtype;
  v_server  uuid;
  v_out     jsonb;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  select * into v_channel from public.channels where id = p_channel_id;
  if not found then
    raise exception 'Channel not found';
  end if;
  v_server := v_channel.server_id;
  if not public.channel_permission_for(v_bot.user_id, p_channel_id, 'view') then raise exception 'Channel permission denied'; end if;


  if not exists (
    select 1 from public.server_members
    where server_id = v_server and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  if not exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = v_server and 'messages.read' = any (scopes)
  ) then
    raise exception 'This bot does not have messages.read in that server';
  end if;

  p_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  select coalesce(jsonb_agg(m order by created_at desc, id desc), '[]'::jsonb) into v_out
  from (
    select public.bot_message_to_json(x, v_server) as m, x.created_at, x.id
    from (
      select *
      from public.messages
      where channel_id = p_channel_id
        and (p_before_id is null or (created_at,id) < (
          select created_at,id from public.messages where id = p_before_id and channel_id = p_channel_id
        ))
      order by created_at desc, id desc
      limit p_limit
    ) x
  ) t;

  return v_out;
end;
$$;

create or replace function public.bot_list_channels(p_bot_id uuid, p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots%rowtype;
  v_has_read boolean;
  v_has_manage boolean;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  v_has_read := exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'messages.read' = any (scopes)
  );
  v_has_manage := exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'channels.manage' = any (scopes)
  );
  if not (v_has_read or v_has_manage) then
    raise exception 'This bot does not have messages.read or channels.manage in that server';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'server_id', c.server_id,
        'category_id', c.category_id,
        'name', c.name,
        'type', c.type,
        'position', c.position,
        'read_only', c.read_only
      ) order by c.position
    )
    from public.channels c
    where c.server_id = p_server_id and public.channel_permission_for(v_bot.user_id, c.id, 'view')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.bot_events_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server  uuid;
  v_type    text;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := 'messageCreate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := public.bot_message_to_json(new, v_server);
  elsif tg_op = 'UPDATE' then
    v_type := 'messageUpdate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := jsonb_build_object(
      'id', new.id,
      'channel_id', new.channel_id,
      'server_id', v_server,
      'content', new.content,
      'edited_at', new.edited_at
    );
  else
    v_type := 'messageDelete';
    select server_id into v_server from public.channels where id = old.channel_id;
    v_payload := jsonb_build_object(
      'id', old.id,
      'channel_id', old.channel_id,
      'server_id', v_server
    );
  end if;

  if v_server is not null then
    insert into public.bot_events (bot_id, type, payload)
    select b.id, v_type, v_payload
    from public.bots b
    where b.revoked_at is null
      and public.channel_permission_for(b.user_id, (v_payload->>'channel_id')::uuid, 'view')
      and 'messages.read' = any (b.scopes)
      and exists (
        select 1 from public.server_members sm
        where sm.server_id = v_server and sm.user_id = b.user_id
      )
      and exists (
        select 1 from public.bot_grants g
        where g.bot_id = b.id and g.server_id = v_server and 'messages.read' = any (g.scopes)
      );
  end if;

  return coalesce(new, old);
end;
$$;

-- Re-authorize queued events at delivery, so permission removal takes effect
-- even for messages queued before this migration or before a role change.
create or replace function public.take_bot_events(p_bot_id uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bots%rowtype; e record; result jsonb := '[]'::jsonb; channel uuid; server uuid;
begin
  select * into b from public.bots where id=p_bot_id;
  if not found or b.revoked_at is not null or public.is_bot_platform_banned(p_bot_id) then raise exception 'Bot revoked or restricted'; end if;
  for e in select * from public.bot_events where bot_id=p_bot_id and delivered_at is null
    order by id limit least(greatest(coalesce(p_limit,50),1),100) for update skip locked
  loop
    update public.bot_events set delivered_at=now() where id=e.id;
    begin channel := (e.payload->>'channel_id')::uuid;
    exception when invalid_text_representation then continue; end;
    select server_id into server from public.channels where id=channel;
    if 'messages.read'=any(b.scopes) and public.channel_permission_for(b.user_id,channel,'view')
       and exists(select 1 from public.bot_grants where bot_id=p_bot_id and server_id=server and 'messages.read'=any(scopes)) then
      result := result || jsonb_build_array(jsonb_build_object('id',e.id,'type',e.type,'payload',e.payload));
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.take_bot_events(uuid,integer) from public,anon,authenticated;
grant execute on function public.take_bot_events(uuid,integer) to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('bot_send_message','bot_list_messages','bot_list_channels','bot_events_dispatch')
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
