-- Fix group chat 500 errors: RLS infinite recursion on group_chat_members

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

drop policy if exists "group_chats_select" on public.group_chats;
create policy "group_chats_select"
  on public.group_chats for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "group_chat_members_select" on public.group_chat_members;
create policy "group_chat_members_select"
  on public.group_chat_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_messages_select" on public.group_messages;
create policy "group_messages_select"
  on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_messages_insert" on public.group_messages;
create policy "group_messages_insert"
  on public.group_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_group_member(group_id)
  );
