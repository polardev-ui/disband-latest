-- 0086_pin_permissions.sql
-- Pinning in server channels requires pin_messages (DM/group pins unchanged).

create or replace function public.require_channel_pin_perm(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
begin
  select server_id into v_server from public.channels where id = p_channel_id;
  if v_server is null then return; end if;
  if not public.member_has_server_permission(v_server, auth.uid(), 'pin_messages') then
    raise exception 'Missing pin_messages permission';
  end if;
end;
$$;

drop function if exists public.pin_message(text, uuid, uuid, text, uuid);
drop function if exists public.unpin_message(text, uuid, uuid);

create or replace function public.pin_message(
  p_source_type text, p_source_id uuid, p_message_id uuid,
  p_content text, p_author_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_resolved_author uuid := coalesce(p_author_id, v_uid);
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.pinned_is_participant(p_source_type, p_source_id, v_uid) then
    raise exception 'You are not a member of this conversation';
  end if;

  if p_source_type = 'channel' then
    perform public.require_channel_pin_perm(p_source_id);
  end if;

  if not public.pinned_message_in_source(p_source_type, p_source_id, p_message_id) then
    raise exception 'Message does not belong to this conversation';
  end if;

  insert into public.pinned_messages
    (source_type, source_id, message_id, content, author_id, pinner_id)
  values
    (p_source_type, p_source_id, p_message_id, p_content, v_resolved_author, v_uid)
  on conflict (source_type, source_id, message_id) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id
    from public.pinned_messages
    where source_type = p_source_type and source_id = p_source_id and message_id = p_message_id;
  end if;

  return v_new_id;
end;
$$;

create or replace function public.unpin_message(
  p_source_type text, p_source_id uuid, p_message_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.pinned_is_participant(p_source_type, p_source_id, v_uid) then
    raise exception 'You are not a member of this conversation';
  end if;

  if p_source_type = 'channel' then
    perform public.require_channel_pin_perm(p_source_id);
  end if;

  delete from public.pinned_messages
  where source_type = p_source_type
    and source_id = p_source_id
    and message_id = p_message_id;
end;
$$;
