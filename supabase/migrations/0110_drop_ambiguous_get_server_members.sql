-- Drop the one-argument `get_server_members`, which made every one-argument
-- call ambiguous.
--
-- There were two overloads with identical return types and identical bodies:
--
--   get_server_members(p_server_id uuid)
--   get_server_members(p_server_id uuid, p_page int DEFAULT 1, p_page_size int DEFAULT 1000)
--
-- Because the second one's extra parameters have defaults, it is also a
-- candidate for a one-argument call, and Postgres refuses to choose:
--
--   ERROR: function public.get_server_members(uuid) is not unique
--
-- The web passes all three arguments and resolves cleanly, so it has always
-- worked. **iOS and Android pass only `p_server_id`**, so on both of them
-- every members lookup errored — and both wrap it in a catch that falls back
-- to an empty list, so the members sheet said "0 members" for a space with
-- 4,796 people in it and logged nothing.
--
-- Dropping the redundant overload makes the one-argument call resolve to the
-- paginated version using its defaults. That fixes the already-shipped
-- clients without waiting for an app release, which matters: there is a
-- TestFlight build in people's hands right now.
--
-- The only behaviour change is that an unpaginated call now returns the first
-- page (1,000 members) instead of all of them. That is the documented default
-- of the surviving function, and 1,000 rows beats the 0 it returns today.

drop function if exists public.get_server_members(uuid);

comment on function public.get_server_members(uuid, integer, integer) is
  'Members of a space with their profiles embedded. The single-argument '
  'overload was dropped in 0110: its mere existence made every one-argument '
  'call ambiguous, which is what broke the members list on iOS and Android.';
