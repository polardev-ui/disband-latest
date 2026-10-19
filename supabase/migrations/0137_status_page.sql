-- 0137: self-hosted status page
--
-- Monitors, recent checks and daily roll-ups are service-only. The public
-- page reads a snapshot through status_public_snapshot(), which deliberately
-- omits monitor URLs and request headers. A Supabase Edge Function probes the
-- URLs every minute, so an outage at the web host is still recorded.

create table if not exists public.status_monitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  method text not null default 'GET' check (method in ('GET', 'HEAD')),
  expected_status integer not null default 200 check (expected_status between 100 and 599),
  keyword text,
  timeout_ms integer not null default 10000 check (timeout_ms between 1000 and 30000),
  headers jsonb not null default '{}'::jsonb,
  group_name text not null default 'Disband',
  position integer not null default 0,
  enabled boolean not null default true,
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.status_checks (
  id bigserial primary key,
  monitor_id uuid not null references public.status_monitors(id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status_code integer,
  latency_ms integer,
  error text
);

create index if not exists status_checks_monitor_time_idx
  on public.status_checks (monitor_id, checked_at desc);

create table if not exists public.status_daily (
  monitor_id uuid not null references public.status_monitors(id) on delete cascade,
  day date not null,
  checks integer not null default 0,
  ok_checks integer not null default 0,
  avg_latency_ms integer,
  primary key (monitor_id, day)
);

-- Daily roll-ups are maintained by the database, so a probe only has to insert
-- one check row and cannot forget to update the 90-day history.
create or replace function public.status_record_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.status_daily (monitor_id, day, checks, ok_checks, avg_latency_ms)
  values (
    new.monitor_id,
    new.checked_at::date,
    1,
    case when new.ok then 1 else 0 end,
    new.latency_ms
  )
  on conflict (monitor_id, day) do update set
    checks = public.status_daily.checks + 1,
    ok_checks = public.status_daily.ok_checks + case when new.ok then 1 else 0 end,
    avg_latency_ms = case
      when new.latency_ms is null then public.status_daily.avg_latency_ms
      when public.status_daily.avg_latency_ms is null then new.latency_ms
      else (
        (public.status_daily.avg_latency_ms::numeric * public.status_daily.checks + new.latency_ms)
        / (public.status_daily.checks + 1)
      )::integer
    end;
  return new;
end;
$$;

drop trigger if exists status_checks_daily on public.status_checks;
create trigger status_checks_daily
  after insert on public.status_checks
  for each row execute function public.status_record_check();

create table if not exists public.status_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'incident' check (kind in ('incident', 'maintenance', 'announcement')),
  impact text not null default 'minor' check (impact in ('none', 'minor', 'major', 'critical')),
  status text not null default 'investigating'
    check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'completed', 'published')),
  monitor_ids uuid[] not null default '{}'::uuid[],
  auto boolean not null default false,
  scheduled_for timestamptz,
  scheduled_until timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists status_incidents_recent_idx
  on public.status_incidents (created_at desc);

create table if not exists public.status_incident_updates (
  id bigserial primary key,
  incident_id uuid not null references public.status_incidents(id) on delete cascade,
  status text not null
    check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'completed', 'published')),
  body text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists status_incident_updates_incident_idx
  on public.status_incident_updates (incident_id, created_at);

alter table public.status_monitors enable row level security;
alter table public.status_checks enable row level security;
alter table public.status_daily enable row level security;
alter table public.status_incidents enable row level security;
alter table public.status_incident_updates enable row level security;

revoke all on public.status_monitors from anon, authenticated;
revoke all on public.status_checks from anon, authenticated;
revoke all on public.status_daily from anon, authenticated;
revoke all on public.status_incidents from anon, authenticated;
revoke all on public.status_incident_updates from anon, authenticated;
revoke all on sequence public.status_checks_id_seq from anon, authenticated;
revoke all on sequence public.status_incident_updates_id_seq from anon, authenticated;

-- Public read model. It never exposes monitor URLs or request headers.
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
          'created_at', u.created_at,
          'created_by', u.created_by
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
          'created_at', u.created_at,
          'created_by', u.created_by
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

-- The probe authenticates with a per-project secret kept in Vault. It is
-- compared in SQL so the Edge Function never returns or logs the value.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'status_probe_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'status_probe_key',
      'Bearer secret for the status-probe Edge Function'
    );
  end if;
end $$;

create or replace function public.status_probe_check_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'status_probe_key' and decrypted_secret = p_key
  );
$$;

revoke all on function public.status_probe_check_key(text) from public, anon, authenticated;
grant execute on function public.status_probe_check_key(text) to service_role;

-- One probe a minute. The function checks Vault each run, so rotating the
-- secret does not require editing the job.
create or replace function public.status_probe_schedule()
returns void
language plpgsql
security definer
set search_path = public, cron, vault
as $$
begin
  if exists (select 1 from cron.job where jobname = 'status-probe') then
    perform cron.unschedule('status-probe');
  end if;
  perform cron.schedule(
    'status-probe',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/status-probe',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'status_probe_key')
        ),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 50000
      );
    $job$
  );
end;
$$;

revoke all on function public.status_probe_schedule() from public, anon, authenticated;
grant execute on function public.status_probe_schedule() to service_role;

select public.status_probe_schedule();

-- Seed the services the public page should watch. Existing rows are left
-- alone; add or edit monitors in /status/admin.
insert into public.status_monitors (name, url, method, expected_status, keyword, group_name, position)
select * from (values
  ('Website', 'https://www.disband.dev/', 'GET', 200, null, 'Disband', 10),
  ('API', 'https://www.disband.dev/api/status', 'GET', 200, '"status":"ok"', 'Disband', 20),
  ('Web app', 'https://www.disband.dev/app', 'GET', 200, null, 'Disband', 30),
  ('Docs', 'https://docs.disband.dev/', 'GET', 200, null, 'Disband', 40),
  ('Static assets', 'https://www.disband.dev/logo.png', 'GET', 200, null, 'Disband', 50)
) as seed(name, url, method, expected_status, keyword, group_name, position)
where not exists (select 1 from public.status_monitors);
