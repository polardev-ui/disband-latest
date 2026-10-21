-- 0144: complete status-page coverage
--
-- The first five monitors seeded by 0137 cover the public surface. These add
-- the services that sit behind it: media, status data (which reads Supabase),
-- voice, auth, storage and the bot gateway. Inserts are by name so applying
-- this to a database that already has the original monitors is safe.

insert into public.status_monitors (name, url, method, expected_status, keyword, group_name, position)
select seed.name, seed.url, seed.method, seed.expected_status, seed.keyword, seed.group_name, seed.position
from (values
  ('Media CDN', 'https://cdn.disband.dev/health', 'GET', 200, null, 'Disband', 60),
  ('Status data', 'https://www.disband.dev/api/status-page', 'GET', 200, '"monitors"', 'Disband', 70),
  ('Voice gateway', 'https://www.disband.dev/api/health/voice', 'GET', 200, '"status":"ok"', 'Platform', 10),
  ('Authentication', 'https://mjqbrcabargylrimlafw.supabase.co/auth/v1/health', 'GET', 200, null, 'Platform', 20),
  ('Storage', 'https://mjqbrcabargylrimlafw.supabase.co/storage/v1/version', 'GET', 200, null, 'Platform', 30),
  ('Bot gateway', 'https://www.disband.dev/api/v1/gateway', 'GET', 401, null, 'Platform', 40)
) as seed(name, url, method, expected_status, keyword, group_name, position)
where not exists (
  select 1 from public.status_monitors m where m.name = seed.name
);
