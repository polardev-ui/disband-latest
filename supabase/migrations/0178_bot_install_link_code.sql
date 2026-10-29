-- gen_random_bytes lives in the extensions schema, outside these functions' search_path; build the code from gen_random_uuid instead.
create or replace function public.bot_install_link(p_bot_id uuid, p_actor_id uuid, p_scopes text[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_valid_bot_scopes(p_scopes) then raise exception 'Invalid bot scopes'; end if;
  if not exists (select 1 from public.bots where id = p_bot_id and owner_id = p_actor_id and revoked_at is null) then
    raise exception 'Only the bot owner can make an install link';
  end if;
  select coalesce(array_agg(x), array[]::text[]) into p_scopes
  from unnest(p_scopes) x where x in (select unnest(scopes) from public.bots where id = p_bot_id);
  if array_length(p_scopes, 1) is null then raise exception 'No valid scopes requested'; end if;
  -- Reuse the bot's link if it has one with the same permissions.
  select code into v_code from public.bot_invites
   where bot_id = p_bot_id and reusable and status = 'pending' and scopes @> p_scopes and scopes <@ p_scopes
   limit 1;
  if v_code is not null then return v_code; end if;
  update public.bot_invites set status = 'expired' where bot_id = p_bot_id and reusable and status = 'pending';
  v_code := replace(gen_random_uuid()::text, '-', '');
  insert into public.bot_invites (bot_id, server_id, code, scopes, created_by, reusable, expires_at)
  values (p_bot_id, null, v_code, p_scopes, p_actor_id, true, now() + interval '100 years');
  return v_code;
end;
$$;
revoke all on function public.bot_install_link(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.bot_install_link(uuid, uuid, text[]) to service_role;
