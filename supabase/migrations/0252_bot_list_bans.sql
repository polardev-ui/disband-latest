-- Bot-readable ban list (extended API).

create or replace function public.bot_list_bans(
  p_bot_id    uuid,
  p_server_id uuid
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
    where bot_id = p_bot_id and server_id = p_server_id and 'members:moderate' = any (scopes)
  );
  v_has_role := public.bot_has_server_permission(p_server_id, v_bot.user_id, 'ban');

  if not (v_has_scope or v_has_role) then
    raise exception 'This bot does not have members:moderate in that server';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', b.user_id,
        'banned_by', b.banned_by,
        'reason', b.reason,
        'created_at', b.created_at
      ) order by b.created_at desc
    )
    from public.server_bans b
    where b.server_id = p_server_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.bot_list_bans(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bot_list_bans(uuid, uuid) to service_role;