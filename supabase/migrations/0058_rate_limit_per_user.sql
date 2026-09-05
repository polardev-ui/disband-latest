-- 0058: stop invite lookups sharing one global rate-limit bucket.
--
-- 0053 added `platform_rate_limit('invite:' || coalesce(auth.uid()::text,
-- 'anon'), 15, 60)` to these functions. Both are reached through API routes
-- that run as the service role, where auth.uid() is null — so the key
-- collapsed to the literal 'invite:anon' (and 'bot-invite:anon'), giving every
-- invite preview on the platform a single shared allowance of 15 per minute.
-- A handful of people viewing invites at once returned 429 to everyone, which
-- is what took invite embeds down on the web.
--
-- The routes already limit per IP, which is the right control for a
-- service-role caller, and 0054 revoked anon EXECUTE so no unauthenticated
-- caller reaches these directly. The limit now applies only when there is a
-- real user, keyed by that user, at a ceiling that a page full of invite cards
-- does not trip.
create or replace function public.get_server_by_invite(p_code text)
returns table (
  id uuid, name text, description text, icon_url text, banner_url text,
  invite_code text, member_count bigint, verified boolean
)
language plpgsql
security definer
set search_path = public
volatile
as $$
begin
  if auth.uid() is not null then
    perform public.platform_rate_limit('invite:' || auth.uid()::text, 60, 60);
  end if;

  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    s.verified
  from public.servers s
  where s.invite_code = p_code;
end;
$$;

revoke execute on function public.get_server_by_invite(text) from anon;
grant execute on function public.get_server_by_invite(text) to authenticated, service_role;

create or replace function public.bot_invite_info(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v jsonb;
begin
  if auth.uid() is not null then
    perform public.platform_rate_limit('bot-invite:' || auth.uid()::text, 60, 60);
  end if;

  select jsonb_build_object(
    'code', i.code,
    'status', i.status,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'scopes', i.scopes,
    'bot', jsonb_build_object('id', b.id, 'user_id', b.user_id, 'name', b.name, 'avatar_url', b.avatar_url),
    'server', jsonb_build_object('id', s.id, 'name', s.name, 'icon_url', s.icon_url, 'owner_id', s.owner_id)
  ) into v
  from public.bot_invites i
  join public.bots b on b.id = i.bot_id
  join public.servers s on s.id = i.server_id
  where i.code = p_code;

  return v;
end;
$$;

-- Release the jammed shared buckets.
delete from public.platform_rate_limits where key in ('invite:anon', 'bot-invite:anon');
