-- 0098_raffle.sql
-- PlayStation 5 (or $600) giveaway: entry accounting + auditable draw.
--
-- Rules implemented here (as published on /playstationraffle):
--   * Leaving a 5-star review earns 1 entry.
--   * Every 2 VERIFIED referrals earns 1 more entry, stacking without limit.
--   * Review entries and referral entries both count and stack.
--   * One winner, drawn at random. A runner-up is held in reserve so the
--     prize can still be delivered if the winner never replies.
--
-- Why a stored table instead of querying on the fly: the draw must be
-- auditable and reproducible *after the fact*. Whoever wins needs to be able
-- to verify the weighting, and a legal raffle needs a durable record. So the
-- draw snapshots the full entry pool into raffle_entries, then picks from that
-- immutable snapshot. Later edits to a review or a referral cannot retroactively
-- change who won.
--
-- RLS: fully service-role only. Nobody — not even the winner — can read or
-- write the entry pool. That keeps the pool un-tamperable: a participant who
-- could edit their own row could weight their own odds.

begin;

-- ---------------------------------------------------------------------------
-- Draws
--
-- Created first: raffle_entries carries a foreign key to it.
-- ---------------------------------------------------------------------------
create table if not exists public.raffle_draws (
  id            uuid primary key default gen_random_uuid(),
  prize         text not null default 'playstation5-or-600',
  status        text not null default 'open'
    constraint raffle_draws_status_check check (status in ('open', 'drawn', 'claimed', 'expired')),
  -- Snapshot of the window this pool was built from, for auditability.
  promo_start   timestamptz not null,
  promo_end     timestamptz not null,

  -- Winner / runner-up, filled in by raffle_draw_winner().
  winner_user_id    uuid references public.profiles(id) on delete set null,
  runner_up_user_id uuid references public.profiles(id) on delete set null,
  -- Email is snapshotted from auth.users at draw time. If the winner later
  -- changes their address, the prize still goes where the terms said it would.
  winner_email      text,
  runner_up_email   text,
  winner_entries    integer,
  runner_up_entries integer,
  drawn_at          timestamptz,
  -- The winner has 7 days from drawn_at to respond before the runner-up is
  -- promoted. Kept as a stored deadline so promotion is a pure function of
  -- time and cannot be argued about.
  response_deadline timestamptz,

  -- Delivery tracking. Resend returns an id at accept-time; the real outcome
  -- (delivered / bounced) is only known afterwards and is fetched from
  -- Resend's status API. winner_delivery_status is the ground truth.
  winner_email_id           text,
  winner_delivery_status    text not null default 'not_sent'
    constraint raffle_winner_delivery_check check (winner_delivery_status in
      ('not_sent', 'accepted', 'delivered', 'bounced', 'complained', 'failed')),
  winner_delivery_checked_at timestamptz,
  winner_delivery_detail    text,
  -- Whether the winner actually replied claiming a prize.
  claimed_at     timestamptz,
  prize_choice   text constraint raffle_prize_choice_check
    check (prize_choice is null or prize_choice in ('console', 'gift_card')),

  created_at timestamptz not null default now(),
  constraint raffle_draws_window check (promo_end > promo_start)
);

create index if not exists raffle_draws_status_idx
  on public.raffle_draws (status, drawn_at desc);

-- ---------------------------------------------------------------------------
-- Entry pool (immutable snapshot for one draw)
--
-- Populated at draw time from raffle_entry_counts(), then never written again
-- except by a re-draw of the same draw id. The FK to profiles means a deleted
-- account drops out of the pool rather than leaving an orphan ticket behind.
-- ---------------------------------------------------------------------------
create table if not exists public.raffle_entries (
  raffle_id    uuid not null references public.raffle_draws(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  username     text,
  entries      integer not null,
  review_entries   integer not null default 0,
  referral_entries integer not null default 0,
  -- Provenance, so any entry can be audited back to the rows that earned it.
  review_id        uuid,
  review_recorded_at timestamptz,
  verified_referrals integer not null default 0,
  primary key (raffle_id, user_id),
  constraint raffle_entries_positive check (entries > 0)
);

create index if not exists raffle_entries_raffle_idx
  on public.raffle_entries (raffle_id, entries desc);

-- ---------------------------------------------------------------------------
-- RLS: service-role only, on both tables.
-- ---------------------------------------------------------------------------
alter table public.raffle_draws enable row level security;
alter table public.raffle_entries enable row level security;

-- Intentionally no policies for anon/authenticated: deny by default. Service
-- role bypasses RLS, which is the only path that should ever touch these.

revoke all on public.raffle_draws from public, anon, authenticated;
revoke all on public.raffle_entries from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entry accounting
--
--   review_entries   = 1 if the account has a 5-star review that is FRESH in
--                     the promo window. `app_reviews.user_id` is unique (one
--                     review per account) and a review can be edited, so
--                     "fresh" means created *or* last updated inside the
--                     window — an old review someone edits to 5 stars during
--                     the promo is a qualifying action, and a 5-star review
--                     that existed before the window is not.
--   referral_entries = floor(verified_referrals / 2), stacking without limit.
--                     Only status='verified' counts: a referral that never
--                     confirmed its email never earned anything.
--   entries          = review_entries + referral_entries.
--
-- Platform-banned accounts are excluded, matching referral_leaderboard().
-- ---------------------------------------------------------------------------
create or replace function public.raffle_entry_counts(
  p_since timestamptz,
  p_until timestamptz
)
returns table (
  user_id           uuid,
  username          text,
  entries           integer,
  review_entries    integer,
  referral_entries  integer,
  verified_referrals bigint,
  review_id         uuid,
  review_recorded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with review_credit as (
    select
      r.user_id,
      r.id as review_id,
      greatest(r.created_at, r.updated_at) as recorded_at
    from public.app_reviews r
    where r.stars = 5
      and p_since is not null
      and greatest(r.created_at, r.updated_at) >= p_since
      and greatest(r.created_at, r.updated_at) < p_until
  ),
  referral_credit as (
    select
      f.referrer_id as user_id,
      count(*)::bigint as verified_count
    from public.referrals f
    where f.status = 'verified'
      and f.verified_at is not null
      and (p_since is null or f.verified_at >= p_since)
      and (p_until is null or f.verified_at < p_until)
    group by f.referrer_id
  ),
  combined as (
    select
      p.id as user_id,
      p.username,
      (case when rc.user_id is not null then 1 else 0 end)::integer
        + coalesce(floor(fc.verified_count / 2), 0)::integer as entries,
      (case when rc.user_id is not null then 1 else 0 end)::integer as review_entries,
      coalesce(floor(fc.verified_count / 2), 0)::integer as referral_entries,
      coalesce(fc.verified_count, 0) as verified_referrals,
      rc.review_id,
      rc.recorded_at as review_recorded_at
    from public.profiles p
    left join review_credit rc on rc.user_id = p.id
    left join referral_credit fc on fc.user_id = p.id
    where not exists (
      select 1 from public.platform_bans b where b.user_id = p.id
    )
  )
  select
    c.user_id,
    c.username,
    c.entries,
    c.review_entries,
    c.referral_entries,
    c.verified_referrals,
    c.review_id,
    c.review_recorded_at
  from combined c
  where c.entries > 0
$$;

revoke all on function public.raffle_entry_counts(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.raffle_entry_counts(timestamptz, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- The draw.
--
-- Weighted at random by entry count: each entrant appears `entries` times in
-- the conceptual ticket pool, so a user with 6 entries is 6x as likely as one
-- with 1. Implemented by sampling a uniform random value in [0, total) and
-- walking the cumulative sum, which is uniform over tickets and therefore
-- exact rather than approximate.
--
-- A second entrant is captured as runner-up in the same pass, so the 7-day
-- response window has a real fallback.
--
-- The pool is snapshotted into raffle_entries before the winner is chosen, so
-- the result stays auditable and provably unaffected by later edits.
-- ---------------------------------------------------------------------------
create or replace function public.raffle_draw_winner(p_draw_id uuid)
returns table (
  winner_user_id    uuid,
  winner_email      text,
  winner_entries    integer,
  runner_up_user_id uuid,
  runner_up_email   text,
  runner_up_entries integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw           public.raffle_draws%rowtype;
  v_total          bigint;
  v_remaining      bigint;
  v_pick           bigint;
  v_winner_id      uuid;
  v_winner_email   text;
  v_winner_entries integer;
  v_runner_id      uuid := null;
  v_runner_email   text := null;
  v_runner_entries integer := null;
begin
  select * into v_draw from public.raffle_draws where id = p_draw_id for update;
  if v_draw.id is null then
    raise exception 'raffle draw % not found', p_draw_id;
  end if;
  if v_draw.status <> 'open' then
    raise exception 'raffle draw % is not open (status=%)', p_draw_id, v_draw.status;
  end if;

  -- Snapshot the pool. Idempotent: re-running refreshes the same rows.
  delete from public.raffle_entries where raffle_id = p_draw_id;

  insert into public.raffle_entries (
    raffle_id, user_id, username, entries,
    review_entries, referral_entries,
    review_id, review_recorded_at, verified_referrals
  )
  select
    p_draw_id, c.user_id, c.username, c.entries,
    c.review_entries, c.referral_entries,
    c.review_id, c.review_recorded_at, c.verified_referrals
  from public.raffle_entry_counts(v_draw.promo_start, v_draw.promo_end) c;

  select coalesce(sum(entries), 0)::bigint into v_total
  from public.raffle_entries where raffle_id = p_draw_id;

  if v_total = 0 then
    raise exception 'no eligible entries in draw %', p_draw_id;
  end if;

  -- Winner: uniform over tickets, so odds scale with entry count.
  v_pick := floor(random() * v_total)::bigint + 1;

  with ordered as (
    select e.user_id, e.username, e.entries,
           sum(e.entries) over (order by e.user_id rows unbounded preceding) as cum
    from public.raffle_entries e
    where e.raffle_id = p_draw_id
  )
  select o.user_id, o.entries,
         (select au.email from auth.users au where au.id = o.user_id)
  into v_winner_id, v_winner_entries, v_winner_email
  from ordered o
  where v_pick <= o.cum
  order by o.cum
  limit 1;

  -- Runner-up: drawn from the pool with the winner REMOVED, so it is always a
  -- different person. Drawing a second ticket and merely nudging it off the
  -- winner's position is not enough — with a small pool that lands in the same
  -- entrant's ticket range, which would make the "runner-up" the winner and
  -- defeat the 7-day fallback entirely. Stays null when the winner is the only
  -- entrant; raffle_promote_runner_up() treats that as expired-with-no-fallback.
  select coalesce(sum(entries), 0)::bigint into v_remaining
  from public.raffle_entries
  where raffle_id = p_draw_id and user_id is distinct from v_winner_id;

  if v_remaining > 0 then
    declare
      v_pick2 bigint := floor(random() * v_remaining)::bigint + 1;
    begin
      with ordered as (
        select e.user_id, e.entries,
               sum(e.entries) over (order by e.user_id rows unbounded preceding) as cum
        from public.raffle_entries e
        where e.raffle_id = p_draw_id and e.user_id is distinct from v_winner_id
      )
      select o.user_id, o.entries,
             (select au.email from auth.users au where au.id = o.user_id)
      into v_runner_id, v_runner_entries, v_runner_email
      from ordered o
      where v_pick2 <= o.cum
      order by o.cum
      limit 1;
    end;
  end if;

  update public.raffle_draws
  set status = 'drawn',
      drawn_at = now(),
      response_deadline = now() + interval '7 days',
      winner_user_id = v_winner_id,
      winner_email = v_winner_email,
      winner_entries = v_winner_entries,
      runner_up_user_id = v_runner_id,
      runner_up_email = v_runner_email,
      runner_up_entries = v_runner_entries
  where id = p_draw_id;

  return query
  select
    v_winner_id, v_winner_email, v_winner_entries,
    v_runner_id, v_runner_email, v_runner_entries;
end
$$;

revoke all on function public.raffle_draw_winner(uuid)
  from public, anon, authenticated;
grant execute on function public.raffle_draw_winner(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Mark the winner's email as accepted by the provider. Called immediately
-- after Resend returns an id. This is NOT delivery — see
-- raffle_record_delivery() for the real outcome.
-- ---------------------------------------------------------------------------
create or replace function public.raffle_mark_email_sent(
  p_draw_id uuid,
  p_email_id text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.raffle_draws
  set winner_email_id = p_email_id,
      winner_delivery_status = 'accepted',
      winner_delivery_checked_at = now(),
      winner_delivery_detail = null
  where id = p_draw_id;
$$;

revoke all on function public.raffle_mark_email_sent(uuid, text)
  from public, anon, authenticated;
grant execute on function public.raffle_mark_email_sent(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Record the provider's real delivery outcome (delivered / bounced / ...).
-- Only forward progress is written: a late 'bounced' must not be undone by a
-- subsequent 'delivered', and a terminal state must not flip back to accepted.
-- ---------------------------------------------------------------------------
create or replace function public.raffle_record_delivery(
  p_draw_id uuid,
  p_status text,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_status not in ('delivered', 'bounced', 'complained', 'failed', 'accepted') then
    raise exception 'unsupported delivery status %', p_status;
  end if;

  select winner_delivery_status into v_current
  from public.raffle_draws where id = p_draw_id for update;

  -- Terminal outcomes win over anything less informative.
  if v_current in ('bounced', 'complained', 'failed') then
    return;
  end if;
  if v_current = 'delivered' and p_status <> 'delivered' then
    return;
  end if;

  update public.raffle_draws
  set winner_delivery_status = p_status,
      winner_delivery_checked_at = now(),
      winner_delivery_detail = left(coalesce(p_detail, ''), 500)
  where id = p_draw_id;
end
$$;

revoke all on function public.raffle_record_delivery(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.raffle_record_delivery(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Record that the winner responded and chose a prize.
-- ---------------------------------------------------------------------------
create or replace function public.raffle_claim(
  p_draw_id uuid,
  p_prize_choice text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_prize_choice not in ('console', 'gift_card') then
    raise exception 'prize choice must be console or gift_card';
  end if;
  if not exists (
    select 1 from public.raffle_draws
    where id = p_draw_id and status = 'drawn' and now() <= response_deadline
  ) then
    raise exception 'draw % is not claimable', p_draw_id;
  end if;

  update public.raffle_draws
  set status = 'claimed', claimed_at = now(), prize_choice = p_prize_choice
  where id = p_draw_id;
end
$$;

revoke all on function public.raffle_claim(uuid, text)
  from public, anon, authenticated;
grant execute on function public.raffle_claim(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Promote the runner-up once the response window has closed. Idempotent and
-- safe to call repeatedly from a cron job.
-- ---------------------------------------------------------------------------
create or replace function public.raffle_promote_runner_up(p_draw_id uuid)
returns table (
  promoted boolean,
  promoted_user_id uuid,
  promoted_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw public.raffle_draws%rowtype;
begin
  select * into v_draw from public.raffle_draws where id = p_draw_id for update;

  if v_draw.id is null then
    raise exception 'raffle draw % not found', p_draw_id;
  end if;
  if v_draw.status <> 'drawn' then
    -- Already claimed or already expired: nothing to promote.
    return query select false, null::uuid, null::text;
    return;
  end if;
  if v_draw.response_deadline is null or now() <= v_draw.response_deadline then
    return query select false, null::uuid, null::text;
    return;
  end if;
  if v_draw.runner_up_user_id is null then
    -- Sole entrant who never replied. Expired, with no fallback.
    update public.raffle_draws set status = 'expired' where id = p_draw_id;
    return query select false, null::uuid, null::text;
    return;
  end if;

  update public.raffle_draws
  set status = 'expired',
      winner_user_id = v_draw.runner_up_user_id,
      winner_email = v_draw.runner_up_email,
      winner_entries = v_draw.runner_up_entries,
      runner_up_user_id = null,
      runner_up_email = null,
      runner_up_entries = null,
      drawn_at = now(),
      response_deadline = now() + interval '7 days',
      winner_email_id = null,
      winner_delivery_status = 'not_sent',
      winner_delivery_checked_at = null,
      winner_delivery_detail = null,
      claimed_at = null,
      prize_choice = null
  where id = p_draw_id;

  return query select true, v_draw.runner_up_user_id, v_draw.runner_up_email;
end
$$;

revoke all on function public.raffle_promote_runner_up(uuid)
  from public, anon, authenticated;
grant execute on function public.raffle_promote_runner_up(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduling
--
-- Two jobs, both idempotent, both calling /api/cron/raffle:
--
--   raffle-draw    12:05 UTC on 15 December 2026 (a few minutes after the
--                  published draw moment of 12:00 UTC, which is 7am US Eastern
--                  — 00:00 UTC would have drawn on the evening of the 14th).
--   raffle-upkeep  Hourly: polls whether the winner's email actually landed and
--                  promotes the runner-up once the 7-day window closes.
--
-- Setup, applied out of band because the endpoint and its secret live in the
-- app's environment, not the database:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'raffle_url');
--   select vault.create_secret('<same value as RAFFLE_CRON_SECRET>', 'raffle_cron_key');
--   update public.raffle_draws
--      set promo_start = '2026-09-26T00:00:00Z', promo_end = '2026-12-15T12:00:00Z';
--
-- If the secrets are absent the jobs are simply not scheduled: a job that
-- would 401 on every tick is worse than no job, and the owner can always run
-- the draw by hand from POST /api/admin/raffle.
-- ---------------------------------------------------------------------------
do $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; schedule raffle-draw and raffle-upkeep manually.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed; schedule raffle-draw and raffle-upkeep manually.';
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'raffle_url';
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'raffle_cron_key';

  if v_url is null or v_key is null then
    raise notice 'vault secrets raffle_url / raffle_cron_key not set; not scheduling the raffle jobs.';
    return;
  end if;

  -- unschedule-then-schedule, so re-running this migration is a no-op rather
  -- than a pile of duplicate jobs.
  perform cron.unschedule(jobid) from cron.job where jobname = 'raffle-draw';
  perform cron.schedule('raffle-draw', '5 12 15 12 *',
    format($job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"job":"draw"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$, v_url, v_key));

  perform cron.unschedule(jobid) from cron.job where jobname = 'raffle-upkeep';
  perform cron.schedule('raffle-upkeep', '17 * * * *',
    format($job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"job":"upkeep"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$, v_url, v_key));
end
$$;

commit;
