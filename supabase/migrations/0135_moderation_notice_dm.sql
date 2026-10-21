-- ---------------------------------------------------------------------------
-- 0135: /ban, /kick and /timeout can tell the member why, from @disband
--
-- When a moderator gives a reason with a slash command, the member gets a DM
-- from the official account: "You were banned from **Space**. Reason: …".
-- It lands in the same read-only official thread broadcasts use (0105/0106).
--
-- Why a separate RPC instead of a new parameter on ban/kick/timeout: those
-- are called by every shipped client (web, desktop, iOS, Android) with their
-- current signatures, and replacing them risks an overload or a missed
-- caller. This function is purely additive.
--
-- Why it cannot be used to send arbitrary @disband DMs: it only sends when
-- the CALLER has a matching audit_log row (same space, same target, same
-- action) written in the last five minutes, i.e. the ban/kick/timeout really
-- happened and they did it. Each audit row can carry one notice at most
-- (moderation_notices is keyed on it), so a moderator cannot repeat it to
-- spam the member. The message always names the space, so the reason reads
-- as the space's words, not Disband's.
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_notices (
  audit_id   bigint primary key references public.audit_log(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Written only by the security-definer function below; no client access.
alter table public.moderation_notices enable row level security;
revoke all on public.moderation_notices from anon, authenticated;

create or replace function public.send_moderation_notice(
  p_server_id uuid,
  p_user_id   uuid,
  p_action    text,
  p_reason    text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_official uuid := public.official_account_id();
  v_action   text;
  v_audit    record;
  v_reason   text := left(btrim(coalesce(p_reason, '')), 500);
  v_space    text;
  v_thread   uuid;
  v_secs     integer;
  v_parts    text[] := '{}';
  v_body     text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_reason = '' then return false; end if;
  if v_official is null or p_user_id = v_official or p_user_id = v_uid then return false; end if;

  v_action := case p_action
    when 'ban' then 'member.ban'
    when 'kick' then 'member.kick'
    when 'timeout' then 'member.timeout'
  end;
  if v_action is null then raise exception 'Unknown action %', p_action; end if;

  -- The action must have just happened, by this caller, to this member.
  select a.id, a.details into v_audit
  from public.audit_log a
  where a.server_id = p_server_id
    and a.actor_id = v_uid
    and a.action = v_action
    and a.target_id = p_user_id::text
    and a.created_at > now() - interval '5 minutes'
    and not exists (select 1 from public.moderation_notices n where n.audit_id = a.id)
  order by a.created_at desc
  limit 1;
  if not found then return false; end if;

  if not exists (select 1 from public.profiles where id = p_user_id and not coalesce(is_bot, false)) then
    return false;
  end if;

  insert into public.moderation_notices (audit_id) values (v_audit.id)
  on conflict do nothing;
  if not found then return false; end if;

  select name into v_space from public.servers where id = p_server_id;
  v_space := coalesce(nullif(btrim(v_space), ''), 'a space');

  if p_action = 'timeout' then
    v_secs := coalesce((v_audit.details ->> 'seconds')::integer, 0);
    if v_secs >= 86400 then v_parts := v_parts || ((v_secs / 86400) || case when v_secs / 86400 = 1 then ' day' else ' days' end); end if;
    if v_secs % 86400 >= 3600 then v_parts := v_parts || (((v_secs % 86400) / 3600) || case when (v_secs % 86400) / 3600 = 1 then ' hour' else ' hours' end); end if;
    if v_secs % 3600 >= 60 then v_parts := v_parts || (((v_secs % 3600) / 60) || case when (v_secs % 3600) / 60 = 1 then ' minute' else ' minutes' end); end if;
    if v_secs < 60 then v_parts := v_parts || (v_secs || case when v_secs = 1 then ' second' else ' seconds' end); end if;
    v_body := 'You were timed out in **' || v_space || '** for ' || array_to_string(v_parts, ' ') || '.';
  elsif p_action = 'ban' then
    v_body := 'You were banned from **' || v_space || '**.';
  else
    v_body := 'You were kicked from **' || v_space || '**.';
  end if;
  v_body := v_body || E'\n**Reason:** ' || v_reason;

  -- Same thread shape as broadcast_send (0105): one thread per member with
  -- the official account, reused on later notices. A member who has blocked
  -- @disband trips the block guard; the action itself already happened, so
  -- that is reported as "not sent" rather than an error.
  begin
    insert into public.dm_threads (user_a, user_b)
    values (least(p_user_id, v_official), greatest(p_user_id, v_official))
    on conflict (user_a, user_b) do nothing
    returning id into v_thread;
    if v_thread is null then
      select id into v_thread from public.dm_threads
      where user_a = least(p_user_id, v_official) and user_b = greatest(p_user_id, v_official);
    end if;

    insert into public.dm_messages (thread_id, author_id, content)
    values (v_thread, v_official, v_body);
  exception when others then
    return false;
  end;
  return true;
end;
$$;

revoke all on function public.send_moderation_notice(uuid, uuid, text, text) from public, anon;
grant execute on function public.send_moderation_notice(uuid, uuid, text, text) to authenticated;
