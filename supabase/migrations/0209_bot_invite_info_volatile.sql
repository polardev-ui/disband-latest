-- 0209: bot invite links broke again — the lookup was STABLE.
--
-- bot_invite_info records a rate-limit hit (platform_rate_limit writes and
-- prunes), and PostgREST runs a STABLE function in a read-only transaction,
-- so every lookup failed with "cannot execute DELETE in a read-only
-- transaction" and every bot invite page said "Invite not found". 0055 fixed
-- this once; the general-invite change applied on 2026-10-26
-- ("general_bot_invite_info", never saved to this repo) recreated the
-- function as STABLE again.
--
-- This is that function as it stands in production, declared VOLATILE, so
-- the repo has it and the next CREATE OR REPLACE starts from a correct copy.

create or replace function public.bot_invite_info(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  perform public.platform_rate_limit('bot-invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  select jsonb_build_object(
    'code', i.code,
    'status', i.status,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'scopes', i.scopes,
    'bot', jsonb_build_object(
      'id', b.id,
      'user_id', b.user_id,
      'name', b.name,
      'avatar_url', b.avatar_url
    ),
    'server', case when s.id is null then null else jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'icon_url', s.icon_url,
      'owner_id', s.owner_id
    ) end
  ) into v
  from public.bot_invites i
  join public.bots b on b.id = i.bot_id
  left join public.servers s on s.id = i.server_id
  where i.code = p_code;

  return v;
end;
$function$;
