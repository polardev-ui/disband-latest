-- Read-only ("announcement") channels.
--
-- Everyone in the server can read the channel, but only members with
-- `manage_channels` (and the owner, who short-circuits every permission check)
-- may post. Enforced in RLS rather than the client, so hiding the composer is
-- a convenience, not the control.

alter table public.channels
  add column if not exists read_only boolean not null default false;

comment on column public.channels.read_only is
  'When true only members with manage_channels may post. Reading is unaffected.';

-- ---------------------------------------------------------------------------
-- Message insert policy, extended with the read-only check
--
-- Rewritten in full rather than layered, because a second permissive policy
-- would be OR-ed with the existing one and would not restrict anything.
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
        and public.is_server_member(c.server_id)
        and (
          lower(messages.content) !~ '@(everyone|here)'
          or public.member_has_server_permission(c.server_id, auth.uid(), 'mention_everyone')
        )
        and (
          c.read_only = false
          or public.member_has_server_permission(c.server_id, auth.uid(), 'manage_channels')
        )
    )
  );
