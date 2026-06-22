-- Prevent rapid group chat creation (20 second cooldown per owner).

create index if not exists group_chats_owner_created_idx
  on public.group_chats (owner_id, created_at desc);

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

  if exists (
    select 1
    from public.group_chats
    where owner_id = auth.uid()
      and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'Wait 20 seconds before creating another group chat.'
      using errcode = 'P0001';
  end if;

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
