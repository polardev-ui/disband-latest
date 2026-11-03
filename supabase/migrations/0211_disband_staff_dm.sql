-- The Disband space doesn't count as a shared space for message requests
-- (everyone is in it, so it would let anyone message anyone). Its owner and
-- moderators are the exception: they need to reach members, so for them it
-- counts. One direction only: members still can't request a moderator just
-- by sharing Disband.

create or replace function public.share_space_for_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members a
    join public.server_members b on b.server_id = a.server_id and b.user_id = p_b
    join public.servers s on s.id = a.server_id
    where a.user_id = p_a
      and s.suspended_at is null
      and (
        lower(coalesce(s.vanity_code, '')) <> 'disband'
        or public.user_has_server_permission(s.id, p_a, 'kick')
        or public.user_has_server_permission(s.id, p_a, 'ban')
        or public.user_has_server_permission(s.id, p_a, 'timeout_members')
      )
  );
$$;

revoke all on function public.share_space_for_dm(uuid, uuid) from public, anon, authenticated;

-- For the profile card: can I send this person a message request because of
-- a space we share? Friends and existing conversations are checked by the
-- client; this answers only the shared-space part, as the server will.
create or replace function public.can_request_dm(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.share_space_for_dm(auth.uid(), p_user_id);
$$;

revoke all on function public.can_request_dm(uuid) from public, anon;
grant execute on function public.can_request_dm(uuid) to authenticated;
