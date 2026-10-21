-- 0145: point the new status monitors at endpoints that are live today
--
-- 0144 was seeded against the health routes and the status JSON API, but
-- those only exist after this branch is deployed. Monitoring them from the
-- live probe would open a false incident before then. These are equivalent
-- live checks:
--   - /status server-renders from Supabase, so it covers status data + DB
--   - /api/turn is the voice relay route and returns 401 without auth
--   - the Supabase auth health endpoint also returns 401, which is healthy
-- Once /api/health/voice ships, its deeper TURN check can replace /api/turn
-- from /status/admin without a migration.

update public.status_monitors
set url = 'https://www.disband.dev/status',
    expected_status = 200,
    keyword = null,
    updated_at = now()
where name = 'Status data';

update public.status_monitors
set url = 'https://www.disband.dev/api/turn',
    expected_status = 401,
    keyword = null,
    updated_at = now()
where name = 'Voice gateway';

update public.status_monitors
set expected_status = 401,
    updated_at = now()
where name = 'Authentication';
