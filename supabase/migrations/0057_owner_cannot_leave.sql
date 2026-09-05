-- An owner leaving their own server stranded it: the server had no member who
-- could administer it, it vanished from the owner's list, and they could not
-- rejoin. Three servers were already in that state.
--
-- Enforced in the delete policy rather than the client, so no client can
-- produce it. Cascade deletes bypass RLS, so deleting a server still removes
-- the owner's membership as part of the cascade. Ownership transfer and server
-- deletion remain the two ways out.
drop policy if exists "server_members_delete" on public.server_members;
create policy "server_members_delete" on public.server_members for delete to authenticated
  using (
    (
      auth.uid() = user_id
      or public.is_server_owner(server_id)
      or public.is_server_admin(server_id)
    )
    and not exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = server_members.user_id
    )
  );

-- Put owners back into servers they had already left.
insert into public.server_members (server_id, user_id)
select s.id, s.owner_id
from public.servers s
where not exists (
  select 1 from public.server_members m
  where m.server_id = s.id and m.user_id = s.owner_id
)
on conflict do nothing;
