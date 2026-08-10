-- 0039: Bug reports + bug bounty
--
-- Users submit reports from /bug-report (the API route writes with the service
-- role). Staff triage them here; when a report is resolved, the reporter is
-- granted the Bug Bounty Hunter badge automatically via resolve_bug_report.

create table if not exists public.bug_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.profiles (id) on delete set null,
  reporter_email   text not null,
  reporter_name    text,
  title            text not null,
  description      text not null,
  steps            text not null default '',
  attachments      jsonb not null default '[]'::jsonb, -- [{ url, name, type }]
  status           text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists bug_reports_status_idx on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_reporter_idx on public.bug_reports (reporter_user_id);

alter table public.bug_reports enable row level security;

-- Anyone logged in can file a report for themselves; anonymous reports (no
-- account) go through the API route with the service role.
drop policy if exists "bug_reports_insert" on public.bug_reports;
create policy "bug_reports_insert" on public.bug_reports for insert to authenticated
  with check (
    reporter_user_id is null
    or reporter_user_id = auth.uid()
  );

-- Users can see their own reports; staff/owner can see everything.
drop policy if exists "bug_reports_select" on public.bug_reports;
create policy "bug_reports_select" on public.bug_reports for select to authenticated
  using (
    reporter_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.show_owner_badge or p.show_staff_badge)
    )
  );

-- ---------------------------------------------------------------------------
-- Staff/owner resolution: marks the report fixed and grants the bounty badge.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_bug_report(
  p_report_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid;
  v_exists  boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Only owner/staff may resolve reports.
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.show_owner_badge or p.show_staff_badge)
  ) into v_exists;
  if not v_exists then
    raise exception 'Only Disband staff can resolve bug reports.';
  end if;

  select reporter_user_id into v_reporter
  from public.bug_reports
  where id = p_report_id;

  if not found then
    raise exception 'Bug report not found.';
  end if;

  update public.bug_reports
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid(),
      description = coalesce(p_notes, description)
  where id = p_report_id;

  -- The reporter earned the Bug Bounty Hunter badge.
  if v_reporter is not null then
    update public.profiles
    set show_bounty_badge = true
    where id = v_reporter;
  end if;
end;
$$;

revoke all on function public.resolve_bug_report(uuid, text) from public;
grant execute on function public.resolve_bug_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sample (for reference only — delete before deploy):
--   select public.resolve_bug_report('00000000-0000-0000-0000-000000000000');
-- To mark a report dismissed instead:
--   update public.bug_reports set status = 'dismissed' where id = '...';
-- ---------------------------------------------------------------------------
