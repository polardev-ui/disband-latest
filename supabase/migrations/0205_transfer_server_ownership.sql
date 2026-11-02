-- Transfer a space to another member.
--
-- Owners couldn't leave a space they made (leaveServer says to transfer it
-- first) but there was no way to transfer it. servers_update_owner's check
-- keeps owner_id pinned to the caller, so this has to be a function.
--
-- The new owner must already be a member and must not be a bot. The old
-- owner stays in the space as an ordinary member and keeps their custom
-- roles, like Discord. Recorded in the audit log as space.owner_transfer.
--
-- The role changes run before owner_id moves: guard_server_member_role only
-- lets the current owner change roles, and the caller stops being the owner
-- once owner_id changes.
create or replace function public.transfer_server_ownership(
  p_server_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;
  if not public.auth_aal_allows_access() then
    raise exception 'Confirm your two-factor code first.' using errcode = 'P0001';
  end if;

  perform 1 from public.servers where id = p_server_id and owner_id = v_uid for update;
  if not found then
    raise exception 'Only the owner can transfer this space.' using errcode = 'P0001';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this space.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_new_owner_id
  ) then
    raise exception 'They need to be a member of the space first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = p_new_owner_id and is_bot) then
    raise exception 'A bot can''t own a space.' using errcode = 'P0001';
  end if;

  update public.server_members set role = 'owner'
  where server_id = p_server_id and user_id = p_new_owner_id;
  update public.server_members set role = 'member'
  where server_id = p_server_id and user_id = v_uid;

  update public.servers set owner_id = p_new_owner_id where id = p_server_id;

  perform public.write_audit_log(
    p_server_id, 'space.owner_transfer', 'user', p_new_owner_id::text,
    jsonb_build_object('previous_owner_id', v_uid)
  );
end;
$$;

revoke all on function public.transfer_server_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_server_ownership(uuid, uuid) to authenticated;
