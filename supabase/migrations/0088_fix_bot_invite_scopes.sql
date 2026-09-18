-- 0088_fix_bot_invite_scopes.sql
-- bot_create_invite compared a text value against a text[] column
-- (operator does not exist: text = text[]). Unnest first.

create or replace function public.bot_create_invite(
  p_bot_id    uuid,
  p_actor_id  uuid,
  p_server_id uuid,
  p_scopes    text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_code  text;
begin
  if not public.is_valid_bot_scopes(p_scopes) then
    raise exception 'Invalid bot scopes';
  end if;

  select owner_id into v_owner from public.bots where id = p_bot_id;
  if v_owner is null then
    raise exception 'Bot not found';
  end if;

  if v_owner <> p_actor_id and not exists (
    select 1 from public.bots where id = p_bot_id and user_id = p_actor_id
  ) then
    raise exception 'Only the bot owner can generate invites';
  end if;

  select coalesce(array_agg(x), array[]::text[]) into p_scopes
  from unnest(p_scopes) x
  where x = any((
    select coalesce(array_agg(s), array[]::text[])
    from public.bots, unnest(public.bots.scopes) s
    where id = p_bot_id
  ));

  if array_length(p_scopes, 1) is null then
    raise exception 'No valid scopes requested';
  end if;

  v_code := encode(gen_random_bytes(16), 'hex');

  insert into public.bot_invites (bot_id, server_id, code, scopes, created_by)
  values (p_bot_id, p_server_id, v_code, p_scopes, p_actor_id);

  return v_code;
end;
$$;
