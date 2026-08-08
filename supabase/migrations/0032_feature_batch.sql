-- Feature batch:
--   * audio attachments (was previously limited to image/video/gif/file)
--   * register 'poll' in attachment check constraints (client already sends it)
--   * group-chat member-add system messages (author_id nullable)
--   * server discovery (discoverable flag + list/join RPCs)
--   * platform badge icons (OG + bug bounty hunter)

-- 1) Attachment types: add audio + poll everywhere
alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio'));

alter table public.dm_messages drop constraint if exists dm_messages_attachment_type_check;
alter table public.dm_messages add constraint dm_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio'));

alter table public.group_messages drop constraint if exists group_messages_attachment_type_check;
alter table public.group_messages add constraint group_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio'));

alter table public.notes drop constraint if exists notes_attachment_type_check;
alter table public.notes add constraint notes_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file', 'poll', 'audio'));

-- 2) Allow system rows in group_messages (no author)
alter table public.group_messages alter column author_id drop not null;

-- 3) Emit a system message when members are added to a group chat
create or replace function public.add_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_count int;
  v_current int;
  v_adder text;
  v_member_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Not a member'; end if;

  select count(*) into v_current from public.group_chat_members where group_id = p_group_id;
  v_count := coalesce(array_length(p_member_ids, 1), 0);
  if v_count < 1 then raise exception 'Select at least one friend'; end if;
  if v_current + v_count > 10 then raise exception 'Group cannot exceed 10 members'; end if;

  select coalesce(p.display_name, p.username, 'Unknown')
    into v_adder from public.profiles p where p.id = auth.uid();

  foreach v_member in array p_member_ids loop
    if v_member = auth.uid() then raise exception 'Cannot add yourself'; end if;
    if exists (select 1 from public.group_chat_members where group_id = p_group_id and user_id = v_member) then
      continue;
    end if;
    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = v_member)
          or (f.addressee_id = auth.uid() and f.requester_id = v_member))
    ) then
      raise exception 'Can only add accepted friends';
    end if;
    insert into public.group_chat_members (group_id, user_id) values (p_group_id, v_member);

    select coalesce(p.display_name, p.username, 'Unknown')
      into v_member_name from public.profiles p where p.id = v_member;
    insert into public.group_messages (group_id, author_id, content, mentions)
      values (p_group_id, null, v_adder || ' added ' || v_member_name || ' to the group', '{}');
  end loop;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- 4) Server discovery
alter table public.servers add column if not exists discoverable boolean not null default false;

create or replace function public.list_discoverable_servers()
returns table (
  id uuid, name text, icon_url text, banner_url text, description text,
  owner_id uuid, owner_name text, member_count bigint, created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id, s.name, s.icon_url, s.banner_url, s.description,
    s.owner_id,
    coalesce(p.display_name, p.username, 'Unknown') as owner_name,
    (select count(*) from public.server_members sm where sm.server_id = s.id) as member_count,
    s.created_at
  from public.servers s
  join public.profiles p on p.id = s.owner_id
  where s.discoverable = true
  order by member_count desc, s.created_at asc
  limit 40;
$$;

grant execute on function public.list_discoverable_servers() to authenticated;

create or replace function public.join_server_by_id(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.servers where id = p_server_id and discoverable = true
  ) then
    raise exception 'Server is not discoverable';
  end if;
  if exists (
    select 1 from public.server_members where server_id = p_server_id and user_id = auth.uid()
  ) then
    raise exception 'Already a member';
  end if;
  insert into public.server_members (server_id, user_id, role)
    values (p_server_id, auth.uid(), 'member');
end;
$$;

grant execute on function public.join_server_by_id(uuid) to authenticated;

-- 5) Platform badge icons: OG + bug bounty hunter, protected server-side
alter table public.profiles
  add column if not exists show_og_badge boolean not null default false;

alter table public.profiles
  add column if not exists show_bounty_badge boolean not null default false;

create or replace function public.protect_platform_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if auth.uid() is not null then
      new.show_owner_badge := old.show_owner_badge;
      new.show_staff_badge := old.show_staff_badge;
      new.show_og_badge := old.show_og_badge;
      new.show_bounty_badge := old.show_bounty_badge;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_platform_badges on public.profiles;
create trigger profiles_protect_platform_badges
  before update on public.profiles
  for each row execute function public.protect_platform_badges();
