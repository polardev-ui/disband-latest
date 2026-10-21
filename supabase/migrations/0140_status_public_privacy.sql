-- ---------------------------------------------------------------------------
-- 0140: keep incident author ids out of the public status read model
--
-- status_public_snapshot() and status_public_incident() exposed the UUID of
-- the owner who posted each incident update. The public page does not use it,
-- and it is not needed to understand an outage. Replace both functions
-- without created_by; the admin API still reads the base table directly.
-- ---------------------------------------------------------------------------

create or replace function public.status_public_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with visible_monitors as (
  select
    m.*,
    last.ok as current_ok,
    last.status_code as current_status_code,
    last.latency_ms as current_latency_ms,
    last.checked_at as last_checked_at
  from public.status_monitors m
  left join lateral (
    select c.ok, c.status_code, c.latency_ms, c.checked_at
    from public.status_checks c
    where c.monitor_id = m.id
    order by c.checked_at desc
    limit 1
  ) last on true
  where m.enabled and m.public
),
monitor_json as (
  select
    vm.id,
    vm.name,
    vm.group_name,
    vm.position,
    vm.current_ok,
    vm.current_status_code,
    vm.current_latency_ms,
    vm.last_checked_at,
    (
      select round(100.0 * sum(d.ok_checks) / nullif(sum(d.checks), 0))::integer
      from public.status_daily d
      where d.monitor_id = vm.id and d.day >= current_date - 89
    ) as uptime_90,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('day', d.day, 'checks', d.checks, 'ok', d.ok_checks, 'latency', d.avg_latency_ms)
        order by d.day
      )
      from public.status_daily d
      where d.monitor_id = vm.id and d.day >= current_date - 89
    ), '[]'::jsonb) as days,
    coalesce((
      select jsonb_agg(jsonb_build_object('at', x.checked_at, 'latency', x.latency_ms) order by x.checked_at)
      from (
        select c.checked_at, c.latency_ms
        from public.status_checks c
        where c.monitor_id = vm.id and c.checked_at >= now() - interval '24 hours'
        order by c.checked_at desc
        limit 120
      ) x
    ), '[]'::jsonb) as latency_24h
  from visible_monitors vm
),
incident_json as (
  select
    i.*,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'status', u.status,
          'body', u.body,
          'created_at', u.created_at
        ) order by u.created_at
      )
      from public.status_incident_updates u
      where u.incident_id = i.id
    ), '[]'::jsonb) as updates
  from public.status_incidents i
  where i.created_at >= now() - interval '90 days' or i.resolved_at is null
  order by i.created_at desc
  limit 100
)
select jsonb_build_object(
  'generated_at', now(),
  'monitors', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', mj.id,
        'name', mj.name,
        'group_name', mj.group_name,
        'position', mj.position,
        'current_ok', mj.current_ok,
        'status_code', mj.current_status_code,
        'latency_ms', mj.current_latency_ms,
        'last_checked_at', mj.last_checked_at,
        'uptime_90', mj.uptime_90,
        'days', mj.days,
        'latency_24h', mj.latency_24h
      ) order by mj.position, mj.name
    )
    from monitor_json mj
  ), '[]'::jsonb),
  'incidents', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', ij.id,
        'title', ij.title,
        'kind', ij.kind,
        'impact', ij.impact,
        'status', ij.status,
        'monitor_ids', ij.monitor_ids,
        'auto', ij.auto,
        'scheduled_for', ij.scheduled_for,
        'scheduled_until', ij.scheduled_until,
        'created_at', ij.created_at,
        'resolved_at', ij.resolved_at,
        'updates', ij.updates
      ) order by ij.created_at desc
    )
    from incident_json ij
  ), '[]'::jsonb)
);
$$;

create or replace function public.status_public_incident(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id,
    'title', i.title,
    'kind', i.kind,
    'impact', i.impact,
    'status', i.status,
    'monitor_ids', i.monitor_ids,
    'auto', i.auto,
    'scheduled_for', i.scheduled_for,
    'scheduled_until', i.scheduled_until,
    'created_at', i.created_at,
    'resolved_at', i.resolved_at,
    'updates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'status', u.status,
          'body', u.body,
          'created_at', u.created_at
        ) order by u.created_at
      )
      from public.status_incident_updates u
      where u.incident_id = i.id
    ), '[]'::jsonb)
  )
  from public.status_incidents i
  where i.id = p_id
    and (i.created_at >= now() - interval '90 days' or i.resolved_at is null);
$$;

revoke all on function public.status_public_snapshot() from public, anon, authenticated;
revoke all on function public.status_public_incident(uuid) from public, anon, authenticated;
grant execute on function public.status_public_snapshot() to anon, authenticated;
grant execute on function public.status_public_incident(uuid) to anon, authenticated;
