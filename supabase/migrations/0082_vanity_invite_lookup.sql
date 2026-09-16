-- 0082_vanity_invite_lookup.sql
-- Level 1 catalyst perk follow-through: invite previews (`get_server_by_invite`,
-- used by /api/invites/[code] and ServerInviteCard) must resolve a vanity code
-- as well as the generated invite_code. Volatility, signature, and grants are
-- preserved exactly; only the lookup predicate widens.
create or replace function public.get_server_by_invite(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  icon_url text,
  banner_url text,
  invite_code text,
  member_count bigint,
  verified boolean
)
language plpgsql
security definer
set search_path = public
volatile
as $$
begin
  perform public.platform_rate_limit('invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    s.verified
  from public.servers s
  where s.invite_code = p_code
     or (s.vanity_code is not null and lower(s.vanity_code) = lower(p_code));
end;
$$;

revoke execute on function public.get_server_by_invite(text) from anon;
grant execute on function public.get_server_by_invite(text) to authenticated, service_role;
