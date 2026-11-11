-- Bot-readable audit log (extended API).
--
-- Bots with the audit:read scope (or a role carrying view_audit_log) can read
-- a server's recent audit entries. Rows are filtered to the server and capped
-- to the most recent 100, matching the dashboard's page size.

create or replace function public.bot_list_audit_log(
  p_bot_id   uuid,
  p_server_id uuid,
  p_limit     int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots%rowtype;
  v_has_scope boolean;
  v_has_role boolean;
  v_limit int;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then
    raise exception 'Bot not found';
  end if;
  if v_bot.revoked_at is not null then
    raise exception 'This bot has been revoked';
  end if;
  if public.is_bot_platform_banned(p_bot_id) then
    raise exception 'This bot has been restricted';
  end if;

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_bot.user_id
  ) then
    raise exception 'This bot is not a member of that server';
  end if;

  v_has_scope := exists (
    select 1 from public.bot_grants
    where bot_id = p_bot_id and server_id = p_server_id and 'audit:read' = any (scopes)
  );
  v_has_role := public.bot_has_server_permission(p_server_id, v_bot.user_id, 'view_audit_log');

  if not (v_has_scope or v_has_role) then
    raise exception 'This bot does not have audit:read in that server';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 100);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'server_id', a.server_id,
        'actor_id', a.actor_id,
        'action', a.action,
        'target_type', a.target_type,
        'target_id', a.target_id,
        'details', a.details,
        'created_at', a.created_at
      ) order by a.created_at desc
    )
    from (
      select * from public.audit_log
      where server_id = p_server_id
      order by created_at desc
      limit v_limit
    ) a
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.bot_list_audit_log(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.bot_list_audit_log(uuid, uuid, int) to service_role;