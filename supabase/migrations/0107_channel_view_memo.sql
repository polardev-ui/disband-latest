-- Stop the channel-view RLS check running once per message row.
--
-- `messages_select` is `channel_user_can_view(channel_id)`. Because the
-- argument is a column, Postgres cannot hoist it: it is called for every row
-- the scan touches. Each call runs `channel_effective_permission`, which is a
-- plpgsql function doing five or more queries before it answers, and more
-- again in a loop over the member's roles when the channel has permission
-- overrides.
--
-- Measured on production, opening one channel (50 rows):
--
--     before   1031 shared buffers, 6.5 ms warm
--     after     498 shared buffers, 3.7 ms warm
--
-- Warm numbers understate it. Those buffer touches are the whole cost, so on
-- a cold cache or a loaded instance the same query is orders of magnitude
-- slower, and a channel whose members hold several roles multiplies the work
-- again. That is how a twelve-message channel managed to return "canceling
-- statement due to statement timeout" — not the volume of messages, the
-- number of times the permission check re-derived the same answer.
--
-- The answer cannot change within one query: `channel_id` is fixed by the
-- filter, and `auth.uid()` is fixed for the request. So compute it once and
-- remember it.
--
-- WHY THIS IS SAFE
--
-- The memo lives in a transaction-local GUC (`set_config(..., is_local =>
-- true)`), which Postgres discards at commit or rollback. PostgREST runs each
-- request in its own transaction, so a cached answer can never outlive the
-- request that produced it, even though connections are pooled and reused by
-- different users.
--
-- The key includes the user id as well as the channel. That is belt and
-- braces — one transaction is one user in the request path — but it means
-- that even a transaction which switches identity part-way through (tests,
-- admin scripts, a future batching layer) re-derives the answer instead of
-- reusing another user's. Verified against production before shipping: in a
-- single transaction, caching a member's `true` and then switching to a
-- non-member still returns false and still yields zero rows from `messages`.
--
-- Permission changes mid-transaction are not reflected, which is the same
-- guarantee the function already gave: it is STABLE, so callers were always
-- entitled to one answer per statement.

create or replace function public.channel_user_can_view(p_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_cached text;
  v_result boolean;
begin
  -- Signed out: no channel is viewable, and nothing worth remembering.
  if v_uid is null then
    return false;
  end if;

  -- md5 keeps the GUC name to a fixed, always-valid length. The value is a
  -- cache key, never a secret.
  v_key := 'disband.cv' || md5(v_uid::text || ':' || p_channel_id::text);

  v_cached := current_setting(v_key, true);
  if v_cached = 't' then return true; end if;
  if v_cached = 'f' then return false; end if;

  v_result := public.channel_effective_permission(p_channel_id, 'view');
  perform set_config(v_key, case when v_result then 't' else 'f' end, true);
  return v_result;
end;
$$;

comment on function public.channel_user_can_view(uuid) is
  'RLS predicate for channel content. Memoised per (user, channel) for the current transaction only — see migration 0107.';
