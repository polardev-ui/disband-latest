-- ---------------------------------------------------------------------------
-- 0188: clients can read when a Catalyst was placed and when it expires.
--
-- 0155 limited authenticated reads to five safe columns. 0181 added monthly
-- expiry and the app started selecting placed_at and expires_at, which those
-- grants don't cover: every load failed with "permission denied for table
-- server_catalysts" (about 1,600 a day) and fell back to a second query
-- without the dates. Payment identifiers stay service-role only.
-- ---------------------------------------------------------------------------

grant select (placed_at, expires_at) on public.server_catalysts to authenticated;
