-- Offline member pages: pick the page first, then build its rows.
--
-- Both functions built the role array and the full profile JSON for every
-- member of the space before sorting and cutting the page, so a 100-row page
-- of the 14,000-member Disband space did 14,000 of each. Called on every
-- presence change by everyone looking at that space, the channel version was
-- the largest load on the database (about 1.6 s a call, ~20,000 calls a day)
-- and pushed ordinary message loads into statement timeouts.
--
-- Same arguments, columns, ordering and grants (CREATE OR REPLACE keeps the
-- ACL). Measured on #general: 1,309 ms -> 111 ms.

create or replace function public.get_channel_offline_members(
  p_channel_id uuid, p_exclude uuid[], p_offset integer, p_limit integer
)
returns table(server_id uuid, user_id uuid, role text, joined_at timestamptz,
              role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
  with page as (
    select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
           lower(coalesce(nullif(p.display_name, ''), p.username, '')) as sort_name
    from public.channels c
    join public.server_members m on m.server_id = c.server_id
    left join public.profiles p on p.id = m.user_id
    where c.id = p_channel_id
      and public.channel_user_can_view(p_channel_id)
      and not (m.user_id = any(coalesce(p_exclude, '{}'::uuid[])))
      and m.user_id in (select v.user_id from public.channel_viewers(p_channel_id) v)
    order by sort_name, m.user_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  )
  select pg.server_id, pg.user_id, pg.role, pg.joined_at, pg.role_id,
         array(select mr.role_id from public.member_roles mr
               where mr.server_id = pg.server_id and mr.user_id = pg.user_id),
         to_jsonb(p)
  from page pg
  left join public.profiles p on p.id = pg.user_id
  order by pg.sort_name, pg.user_id;
$function$;

create or replace function public.get_server_offline_members(
  p_server_id uuid, p_exclude uuid[], p_offset integer, p_limit integer
)
returns table(server_id uuid, user_id uuid, role text, joined_at timestamptz,
              role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
  with page as (
    select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
           lower(coalesce(nullif(p.display_name, ''), p.username, '')) as sort_name
    from public.server_members m
    left join public.profiles p on p.id = m.user_id
    where m.server_id = p_server_id
      and public.is_server_member(p_server_id)
      and not (m.user_id = any(coalesce(p_exclude, '{}'::uuid[])))
    order by sort_name, m.user_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  )
  select pg.server_id, pg.user_id, pg.role, pg.joined_at, pg.role_id,
         array(select mr.role_id from public.member_roles mr
               where mr.server_id = pg.server_id and mr.user_id = pg.user_id),
         to_jsonb(p)
  from page pg
  left join public.profiles p on p.id = pg.user_id
  order by pg.sort_name, pg.user_id;
$function$;
