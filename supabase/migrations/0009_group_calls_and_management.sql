-- Group call presence + leave / invite / rename

create table if not exists public.group_call_presence (
  group_id    uuid not null references public.group_chats (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_call_presence_group_idx on public.group_call_presence (group_id);

alter table public.group_call_presence enable row level security;

create policy "group_call_presence_select"
  on public.group_call_presence for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_call_presence_insert"
  on public.group_call_presence for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

create policy "group_call_presence_delete_own"
  on public.group_call_presence for delete to authenticated
  using (user_id = auth.uid());

-- Leave a group chat
create or replace function public.leave_group_chat(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Not a member'; end if;

  delete from public.group_call_presence where group_id = p_group_id and user_id = auth.uid();
  delete from public.group_chat_members where group_id = p_group_id and user_id = auth.uid();

  -- Transfer ownership if owner leaves and others remain
  if exists (select 1 from public.group_chats where id = p_group_id and owner_id = auth.uid()) then
    update public.group_chats
    set owner_id = (
      select user_id from public.group_chat_members
      where group_id = p_group_id
      order by joined_at
      limit 1
    )
    where id = p_group_id
      and exists (select 1 from public.group_chat_members where group_id = p_group_id);

    delete from public.group_chats
    where id = p_group_id
      and not exists (select 1 from public.group_chat_members where group_id = p_group_id);
  end if;
end;
$$;

grant execute on function public.leave_group_chat(uuid) to authenticated;

-- Add friends to an existing group (max 10 members total)
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Not a member'; end if;

  select count(*) into v_current from public.group_chat_members where group_id = p_group_id;
  v_count := coalesce(array_length(p_member_ids, 1), 0);
  if v_count < 1 then raise exception 'Select at least one friend'; end if;
  if v_current + v_count > 10 then raise exception 'Group cannot exceed 10 members'; end if;

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
  end loop;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

create or replace function public.rename_group_chat(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.group_chats where id = p_group_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can rename the group';
  end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Name required'; end if;
  update public.group_chats set name = trim(p_name) where id = p_group_id;
end;
$$;

grant execute on function public.rename_group_chat(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.group_call_presence;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_chat_members;
exception when duplicate_object then null;
end $$;
