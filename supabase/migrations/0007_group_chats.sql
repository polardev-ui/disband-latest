-- Group chats (up to 10 members) + GIF attachment type

alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif'));

alter table public.dm_messages drop constraint if exists dm_messages_attachment_type_check;
alter table public.dm_messages add constraint dm_messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video', 'gif'));

create table if not exists public.group_chats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  icon_url    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_chat_members (
  group_id    uuid not null references public.group_chats (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_chat_members_user_idx on public.group_chat_members (user_id);

create table if not exists public.group_messages (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.group_chats (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '',
  attachment_url  text,
  attachment_type text check (attachment_type is null or attachment_type in ('image', 'video', 'gif')),
  attachment_key  text,
  mentions        uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at);

alter table public.group_chats         enable row level security;
alter table public.group_chat_members  enable row level security;
alter table public.group_messages      enable row level security;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_chat_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;

create policy "group_chats_select" on public.group_chats for select to authenticated
  using (public.is_group_member(id));

create policy "group_chat_members_select" on public.group_chat_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_messages_select" on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_messages_insert" on public.group_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_group_member(group_id)
  );

create policy "group_messages_delete_own" on public.group_messages for delete to authenticated
  using (author_id = auth.uid());

-- Create a group with friends (owner + up to 9 friends = 10 total)
create or replace function public.create_group_chat(
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_user_profile();

  if p_name is null or trim(p_name) = '' then
    raise exception 'Group name required';
  end if;

  v_count := coalesce(array_length(p_member_ids, 1), 0);
  if v_count < 1 or v_count > 9 then
    raise exception 'Add 1–9 friends (10 members max including you)';
  end if;

  foreach v_member in array p_member_ids loop
    if v_member = auth.uid() then
      raise exception 'Cannot add yourself';
    end if;
    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = v_member)
          or (f.addressee_id = auth.uid() and f.requester_id = v_member))
    ) then
      raise exception 'Can only add accepted friends';
    end if;
  end loop;

  insert into public.group_chats (name, owner_id)
  values (trim(p_name), auth.uid())
  returning id into v_id;

  insert into public.group_chat_members (group_id, user_id) values (v_id, auth.uid());
  foreach v_member in array p_member_ids loop
    insert into public.group_chat_members (group_id, user_id) values (v_id, v_member)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
