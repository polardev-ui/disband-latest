-- Expand role permissions: manage_messages, manage_emojis, mention_everyone.
-- member_has_server_permission reads arbitrary keys, so role checks work
-- automatically once the keys exist; this migration backfills the keys,
-- rebuilds my_server_permissions, and enforces the new permissions in RLS.

-- ---------------------------------------------------------------------------
-- 1. New permission keys on server_roles
-- ---------------------------------------------------------------------------
alter table public.server_roles
  alter column permissions set default '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false,"manage_channels":false,"manage_messages":false,"manage_emojis":false,"mention_everyone":false}'::jsonb;

update public.server_roles
set permissions = permissions
  || '{"manage_messages":false,"manage_emojis":false,"mention_everyone":false}'::jsonb
where not (permissions ? 'manage_messages');

-- create_server hardcodes the @everyone role's permissions; stop doing that so
-- new servers inherit the (expanded) column default.
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

  insert into public.server_roles (server_id, name, color, position, is_default)
  values (v_id, '@everyone', '#949ba4', 0, true)
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

-- ---------------------------------------------------------------------------
-- 2. my_server_permissions includes the new keys
-- ---------------------------------------------------------------------------
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
    'manage_server', public.member_has_server_permission(p_server_id, v_uid, 'manage_server'),
    'manage_channels', public.member_has_server_permission(p_server_id, v_uid, 'manage_channels'),
    'manage_messages', public.member_has_server_permission(p_server_id, v_uid, 'manage_messages'),
    'manage_emojis', public.member_has_server_permission(p_server_id, v_uid, 'manage_emojis'),
    'mention_everyone', public.member_has_server_permission(p_server_id, v_uid, 'mention_everyone')
  );
end;
$$;

grant execute on function public.my_server_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enforce: manage_messages allows deleting others' messages
-- ---------------------------------------------------------------------------
drop policy if exists "messages_delete_own" on public.messages;
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
        and public.member_has_server_permission(c.server_id, auth.uid(), 'manage_messages')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Enforce: manage_emojis allows adding/removing server emoji
-- ---------------------------------------------------------------------------
drop policy if exists "moderators_insert_emoji" on public.custom_emoji;
create policy "moderators_insert_emoji" on public.custom_emoji for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and public.member_has_server_permission(server_id, auth.uid(), 'manage_emojis')
  );

drop policy if exists "moderators_delete_emoji" on public.custom_emoji;
create policy "moderators_delete_emoji" on public.custom_emoji for delete to authenticated
  using (public.member_has_server_permission(server_id, auth.uid(), 'manage_emojis'));

-- ---------------------------------------------------------------------------
-- 5. Enforce: mention_everyone required for @everyone / @here
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
        and public.is_server_member(c.server_id)
        and (
          lower(messages.content) !~ '@(everyone|here)'
          or public.member_has_server_permission(c.server_id, auth.uid(), 'mention_everyone')
        )
    )
  );
