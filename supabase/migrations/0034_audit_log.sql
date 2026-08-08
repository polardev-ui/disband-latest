-- Audit log: records moderation + lifecycle actions for each server.
-- Writes happen inside security-definer functions / triggers (service role path),
-- reads are restricted to the server owner.

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  server_id   uuid references public.servers (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_server_created_idx
  on public.audit_log (server_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_owner_select" on public.audit_log;
create policy "audit_log_owner_select" on public.audit_log
  for select to authenticated
  using (
    server_id is not null
    and exists (
      select 1 from public.servers where id = audit_log.server_id and owner_id = auth.uid()
    )
  );

grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

-- Helper used by triggers and functions to write an audit entry.
create or replace function public.write_audit_log(
  p_server_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (server_id, actor_id, action, target_type, target_id, details)
  values (p_server_id, auth.uid(), p_action, p_target_type, p_target_id, p_details);
end;
$$;

grant execute on function public.write_audit_log(uuid, text, text, text, jsonb) to service_role;

-- Log message deletions across all message tables.
create or replace function public.audit_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_action text;
  v_details jsonb;
begin
  if tg_table_name = 'messages' then
    v_action := 'channel.message.delete';
    select server_id into v_server_id from public.channels where id = old.channel_id;
    v_details := jsonb_build_object(
      'channel_id', old.channel_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  elsif tg_table_name = 'dm_messages' then
    v_action := 'dm.message.delete';
    v_details := jsonb_build_object(
      'thread_id', old.thread_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  elsif tg_table_name = 'group_messages' then
    v_action := 'group.message.delete';
    v_details := jsonb_build_object(
      'group_id', old.group_id,
      'author_id', old.author_id,
      'content', left(old.content, 200)
    );
  end if;

  insert into public.audit_log (server_id, actor_id, action, target_type, target_id, details)
  values (v_server_id, auth.uid(), v_action, tg_table_name, old.id::text, v_details);

  return old;
end;
$$;

drop trigger if exists audit_message_deleted on public.messages;
create trigger audit_message_deleted
  after delete on public.messages
  for each row execute function public.audit_message_deleted();

drop trigger if exists audit_message_deleted on public.dm_messages;
create trigger audit_message_deleted
  after delete on public.dm_messages
  for each row execute function public.audit_message_deleted();

drop trigger if exists audit_message_deleted on public.group_messages;
create trigger audit_message_deleted
  after delete on public.group_messages
  for each row execute function public.audit_message_deleted();

-- Audit: server creation
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

  perform public.write_audit_log(
    v_id,
    'server.create',
    'server',
    v_id::text,
    jsonb_build_object('name', p_name)
  );

  return v_id;
end;
$$;

grant execute on function public.create_server(text, text, text, text) to authenticated;

-- Audit: joining via invite
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

  perform public.write_audit_log(
    v_server.id,
    'server.join',
    'user',
    auth.uid()::text,
    '{}'::jsonb
  );

  perform public.post_server_welcome(v_server.id, auth.uid());

  return v_server.id;
end;
$$;

grant execute on function public.join_server_by_invite(text) to authenticated;

-- Audit: kick + ban
create or replace function public.kick_server_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'kick') then
    raise exception 'Insufficient permissions';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot kick the server owner';
  end if;

  select coalesce(display_name, username, p_user_id::text) into v_name
  from public.profiles where id = p_user_id;

  perform public.write_audit_log(
    p_server_id,
    'member.kick',
    'user',
    p_user_id::text,
    jsonb_build_object('name', v_name)
  );

  delete from public.server_members where server_id = p_server_id and user_id = p_user_id;
end;
$$;

create or replace function public.ban_server_member(p_server_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'ban') then
    raise exception 'Insufficient permissions';
  end if;
  if exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then
    raise exception 'Cannot ban the server owner';
  end if;

  select coalesce(display_name, username, p_user_id::text) into v_name
  from public.profiles where id = p_user_id;

  perform public.write_audit_log(
    p_server_id,
    'member.ban',
    'user',
    p_user_id::text,
    jsonb_build_object('name', v_name, 'reason', p_reason)
  );

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

grant execute on function public.kick_server_member(uuid, uuid) to authenticated;
grant execute on function public.ban_server_member(uuid, uuid, text) to authenticated;
