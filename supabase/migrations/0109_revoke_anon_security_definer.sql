-- Stop `anon` being able to call SECURITY DEFINER functions it has no business
-- calling.
--
-- 42 of them were reachable signed-out via `/rest/v1/rpc/...`. Every one was
-- checked before writing this, and none of them actually leaks: the mutating
-- ones raise 'Not authenticated' or write `where id = auth.uid()` (which
-- matches nothing for anon), and the read-only ones intersect their result
-- with the caller's own rows, so an anonymous caller gets an empty set. This
-- is not a fix for a live hole.
--
-- It is worth doing anyway. A SECURITY DEFINER function runs as its owner, so
-- the only thing between an anonymous request and the owner's privileges is
-- the guard written inside that one function. Forty-two chances to get a
-- guard wrong, today and every time one of them is edited, is a bad bet when
-- the alternative is that anon simply cannot reach them. The guards stay —
-- this is a second lock, not a replacement.
--
-- `referral_leaderboard` is deliberately left public: /leaderboards/referrals
-- has no auth gate and is meant to be readable signed-out.
--
-- Trigger functions are skipped. A trigger runs as part of the statement that
-- fired it and never consults the caller's EXECUTE privilege, so revoking
-- there would change nothing and risks confusing a future reader into
-- thinking it does.

do $$
declare
  fn record;
  touched int := 0;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      -- Not trigger functions.
      and p.prorettype <> 'trigger'::regtype
      -- Public by design.
      and p.proname <> 'referral_leaderboard'
  loop
    -- The grant is almost always the implicit one to PUBLIC that CREATE
    -- FUNCTION hands out, and you cannot revoke a PUBLIC grant from one role
    -- — so it has to come off PUBLIC and be handed back explicitly.
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('revoke execute on function %s from anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
    touched := touched + 1;
  end loop;

  raise notice 'Locked % SECURITY DEFINER function(s) to authenticated + service_role', touched;
end $$;
