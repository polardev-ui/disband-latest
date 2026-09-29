-- Turn the id a push carries into somewhere the app can navigate to.
--
-- Every push sends `source`, and every source is a bare uuid: `on_dm_message_push`
-- sends a thread id, `on_channel_mention_push` a channel id,
-- `on_group_message_push` a group id, `on_friend_request_push` a requester id.
-- Nothing says which. That was fine for the one job it had — deciding whether
-- the conversation is already on screen, where an id either matches or does
-- not — but it is not enough to open anything, which is why tapping a
-- notification only ever landed on the home screen.
--
-- The obvious fix, prefixing the source with its kind, cannot be done without
-- breaking every app build already installed: those compare the bare id and
-- would start showing banners for the chat you are reading. So the kind is
-- worked out here instead, from the id, at the moment of the tap.
--
-- Returns the kind plus the few fields needed to build the destination, so
-- opening a notification is one round trip rather than three probes.
create or replace function public.resolve_notification_source(p_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_row record;
begin
  if p_id is null or auth.uid() is null then
    return jsonb_build_object('kind', 'unknown');
  end if;

  -- Ordered by how often a notification is about each kind. Every lookup is
  -- a primary-key hit, and RLS still applies because this is SECURITY
  -- INVOKER: a source the caller cannot see resolves to 'unknown' rather
  -- than confirming that the row exists.
  select t.id into v_row from public.dm_threads t where t.id = p_id;
  if found then
    return jsonb_build_object('kind', 'dm', 'id', p_id);
  end if;

  select c.id, c.name, c.server_id into v_row
    from public.channels c where c.id = p_id;
  if found then
    return jsonb_build_object(
      'kind', 'channel',
      'id', v_row.id,
      'name', v_row.name,
      'server_id', v_row.server_id
    );
  end if;

  select g.id, g.name into v_row
    from public.group_chats g where g.id = p_id;
  if found then
    return jsonb_build_object('kind', 'group', 'id', v_row.id, 'name', coalesce(v_row.name, 'Group'));
  end if;

  -- A friend request's source is the requester's profile.
  select pr.id into v_row from public.profiles pr where pr.id = p_id;
  if found then
    return jsonb_build_object('kind', 'friend', 'id', p_id);
  end if;

  return jsonb_build_object('kind', 'unknown');
end;
$$;

grant execute on function public.resolve_notification_source(uuid) to authenticated;
