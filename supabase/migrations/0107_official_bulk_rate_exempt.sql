-- ---------------------------------------------------------------------------
-- 0107: Official broadcasts are exempt from the DM rate trigger
--
-- broadcast_send fans out one DM per recipient in a single statement (10k+
-- rows for an everyone-send). enforce_dm_message_rate (0022) counts rows by
-- the same author in a 5-second / 1-minute window, so it trips on row 8 and
-- aborts the entire broadcast with "You are sending messages too quickly" —
-- which is also the exact text the owner saw in the panel, since the panel
-- maps that message verbatim.
--
-- The exemption is by AUTHOR, not by transaction flag: a
-- set_config('...','on') marker would be settable by any authenticated
-- client (SET needs no privilege), handing every user the same bypass under
-- Supavisor pooling. The official account posts only through broadcast_send
-- (owner-password-gated) or the owner-held @disband session, so exempting
-- its rows weakens nothing a recipient could reach.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_dm_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_burst integer;
  v_minute integer;
begin
  -- Official fanout: thousands of rows, one author, one statement. Everyone
  -- else falls through to the normal windows below.
  if new.author_id = public.official_account_id() then
    return new;
  end if;

  select count(*) into v_burst from public.dm_messages
  where author_id = new.author_id and created_at > now() - interval '5 seconds';
  if v_burst >= 7 then
    raise exception 'You are sending messages too quickly. Slow down.' using errcode = 'P0001';
  end if;

  select count(*) into v_minute from public.dm_messages
  where author_id = new.author_id and created_at > now() - interval '1 minute';
  if v_minute >= 40 then
    raise exception 'Message rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
