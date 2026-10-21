-- 0156_one_char_mentions.sql
--
-- Mentions previously required at least two characters in both the client
-- tokenizer and the server-side resolver. Legacy one-character usernames
-- (for example "g") existed but could not be pinged. Username *creation*
-- rules stay at two characters; only mention resolution accepts one.

begin;

create or replace function public.resolve_server_mentions(
  p_server_id uuid,
  p_usernames text[]
)
returns table(user_id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select distinct lower(trim(both '@' from value)) as username
    from unnest(coalesce(p_usernames, '{}'::text[])) as value
    where length(trim(both '@' from value)) between 1 and 32
  )
  select p.id, p.username
  from public.server_members m
  join public.profiles p on p.id = m.user_id
  join wanted w on lower(p.username) = w.username
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
  limit 100;
$$;

revoke all on function public.resolve_server_mentions(uuid, text[]) from public, anon;
grant execute on function public.resolve_server_mentions(uuid, text[]) to authenticated;

-- Webhook messages resolve their own mention arrays in SQL. Match the same
-- one-character allowance so a webhook can ping a legacy account too.
create or replace function public.webhook_execute(
  p_server_key text,
  p_token text,
  p_content text,
  p_username text,
  p_avatar_url text,
  p_embeds jsonb,
  p_parse_users boolean,
  p_parse_everyone boolean
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook public.webhooks%rowtype;
  v_channel public.channels%rowtype;
  v_content text := coalesce(p_content, '');
  v_mentions uuid[] := '{}';
  v_msg public.messages%rowtype;
begin
  select w.* into v_hook
  from public.webhooks w
  join public.servers s on s.id = w.server_id
  where w.token = p_token and s.webhook_key = p_server_key and w.deleted_at is null;
  if not found then raise exception 'Unknown Webhook' using errcode = 'P0002'; end if;

  select * into v_channel from public.channels where id = v_hook.channel_id;
  if not found or v_channel.server_id <> v_hook.server_id then
    raise exception 'Unknown Channel' using errcode = 'P0002';
  end if;

  if not p_parse_everyone then
    v_content := regexp_replace(v_content, '@(everyone|here)', '@' || chr(8203) || '\1', 'gi');
  end if;

  if p_parse_users then
    select coalesce(array_agg(distinct p.id), '{}') into v_mentions
    from regexp_matches(v_content, '@([a-zA-Z0-9_]{1,32})', 'g') m
    join public.profiles p on lower(p.username) = lower(m[1])
    join public.server_members sm on sm.user_id = p.id and sm.server_id = v_hook.server_id;
  end if;

  perform set_config('disband.trusted_write', 'on', true);
  insert into public.messages (channel_id, author_id, content, mentions, embeds, webhook)
  values (
    v_hook.channel_id,
    v_hook.author_id,
    v_content,
    v_mentions,
    case when p_embeds is null or jsonb_array_length(p_embeds) = 0 then null else p_embeds end,
    jsonb_build_object(
      'id', v_hook.id,
      'name', coalesce(nullif(btrim(p_username), ''), v_hook.name),
      'avatar_url', coalesce(nullif(btrim(p_avatar_url), ''), v_hook.avatar_url)
    )
  )
  returning * into v_msg;
  perform set_config('disband.trusted_write', 'off', true);

  update public.webhooks set last_used_at = now() where id = v_hook.id;
  return v_msg;
end;
$$;

revoke all on function public.webhook_execute(text, text, text, text, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.webhook_execute(text, text, text, text, text, jsonb, boolean, boolean) to service_role;

commit;
