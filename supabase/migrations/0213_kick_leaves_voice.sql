-- Kicked, banned or gone: out of the space's voice too. Removing a member
-- left their voice_presence row behind, and the voice server only checks
-- that row, so someone kicked mid-call stayed in the call (and looked like
-- they were still there). Their app sees the row go and hangs up.

create or replace function public.leave_voice_on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.voice_presence vp
  using public.channels c
  where c.id = vp.channel_id
    and c.server_id = old.server_id
    and vp.user_id = old.user_id;
  return null;
end;
$$;

revoke all on function public.leave_voice_on_member_removed() from public, anon, authenticated;

drop trigger if exists trg_leave_voice_on_member_removed on public.server_members;
create trigger trg_leave_voice_on_member_removed
  after delete on public.server_members
  for each row execute function public.leave_voice_on_member_removed();
