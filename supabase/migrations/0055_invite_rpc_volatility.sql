-- 0055: invite lookups must run in a read-write transaction.
--
-- 0053 added a `platform_rate_limit(...)` call to these two functions. That
-- helper records the hit — it writes — but both functions are declared STABLE,
-- and PostgREST chooses the transaction mode from a function's volatility
-- rather than from the HTTP method. A STABLE function therefore runs inside a
-- read-only transaction, so the rate-limit insert failed with
--
--     cannot execute INSERT in a read-only transaction
--
-- and every server-invite preview broke: /api/invites/<code> answered 400, and
-- an invite link showed nothing to join.
--
-- The functions do write, so VOLATILE is simply the truthful declaration. It
-- also stops the planner treating them as side-effect free.
alter function public.get_server_by_invite(text) volatile;
alter function public.bot_invite_info(text) volatile;

-- NOTE: 0056 recreates get_server_by_invite to add the `verified` column, and
-- a CREATE OR REPLACE resets volatility — so the ALTER above is undone by any
-- run that reaches 0056. The declaration in 0056 is the one that has to be
-- correct, and is; this file only covers a database stopped before it.
