-- 0054: revoke default PUBLIC EXECUTE on functions.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and this
-- schema never revoked it. The result: every RPC in the public schema was
-- callable by `anon` (the public, key-only "guest" role) — including staff
-- tools, audit writers, and the push triggers. That is the unauthenticated
-- abuse surface behind the request spam and an anonymously-stitched data dump.
--
-- This kills the whole anonymous surface, then explicitly re-grants exactly
-- the roles the apps run as (authenticated + service_role). Staff/admin
-- functions keep their internal auth.uid()/flag guards for authenticated
-- callers; unauthenticated callers get nothing.

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from authenticated;

grant execute on all functions in schema public to authenticated, service_role;

-- Functions exposed through server-side API routes (which use the service
-- role) already covered by the grant above. Nothing is re-granted to anon:
-- anonymous invite previews and username checks now go through rate-limited
-- API routes, not direct RPCs.