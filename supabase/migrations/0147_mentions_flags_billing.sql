-- ---------------------------------------------------------------------------
-- 0147: whole-roster mentions, server-side member search, daily flag review
--       bookkeeping, and payment-failure email de-duplication.
--
-- Large spaces only keep a window of members on the client. Resolving an
-- @mention against that window silently failed for everyone outside it, and
-- the member search had to join through the whole roster in PostgREST. Both
-- now happen in one indexed database call scoped to the caller's space.
-- ---------------------------------------------------------------------------

-- Resolve every @username in a message against the whole roster, not just the
-- few hundred members the composer happens to have loaded.
create or replace function public.resolve_server_mentions(
  p_server_id uuid,
  p_usernames text[]
)
returns table(user_id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select distinct lower(trim(both '@' from value)) as username
    from unnest(coalesce(p_usernames, '{}'::text[])) as value
    where length(trim(both '@' from value)) between 2 and 32
  )
  select p.id, p.username
  from public.server_members m
  join public.profiles p on p.id = m.user_id
  join wanted w on lower(p.username) = w.username
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
  limit 100;
$$;

revoke all on function public.resolve_server_mentions(uuid, text[]) from public, anon;
grant execute on function public.resolve_server_mentions(uuid, text[]) to authenticated;

-- One round trip for the composer's member search, with a stable ranking:
-- exact username, username prefix, then display-name/username contains.
create or replace function public.search_server_members(
  p_server_id uuid,
  p_query text,
  p_limit integer default 25
)
returns table(profile jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(trim(both '@' from coalesce(p_query, ''))) as needle
  )
  select to_jsonb(p)
  from public.server_members m
  join public.profiles p on p.id = m.user_id
  cross join q
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
    and (
      q.needle = ''
      or position(q.needle in lower(p.username)) > 0
      or position(q.needle in lower(coalesce(p.display_name, ''))) > 0
    )
  order by
    case
      when lower(p.username) = q.needle then 0
      when position(q.needle in lower(p.username)) = 1 then 1
      else 2
    end,
    lower(coalesce(nullif(p.display_name, ''), p.username, '')),
    m.user_id
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

revoke all on function public.search_server_members(uuid, text, integer) from public, anon;
grant execute on function public.search_server_members(uuid, text, integer) to authenticated;

-- Report decisions use moderation categories (`sexual_content`,
-- `violence_gore`, …) while the original hash table only accepted the scanner's
-- provider categories. Quarantining a confirmed image wrote the report
-- category straight into this table, so the insert could fail the check.
alter table public.banned_media_hashes
  drop constraint if exists banned_media_hashes_category_check;
alter table public.banned_media_hashes
  add constraint banned_media_hashes_category_check
  check (category in (
    'csam', 'gore', 'bestiality', 'other',
    'adult', 'sexual_content', 'violence', 'violence_gore',
    'illegal_content', 'hate_speech', 'harassment'
  ));

-- A flag sent to a human at the end-of-day review is still closed: the
-- automation has finished with it, but the row stays visible for audit and
-- manual follow-up. `resolution` records why that happened.
alter table public.content_flags
  drop constraint if exists content_flags_state_check;
alter table public.content_flags
  add constraint content_flags_state_check
  check (state in ('open', 'actioned', 'dismissed', 'escalated'));

alter table public.content_flags
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution text;

create index if not exists content_flags_open_idx
  on public.content_flags (created_at)
  where state = 'open';

-- Counts for the end-of-day review on the status page and in safety_runs.
alter table public.safety_runs
  add column if not exists flags_reviewed integer not null default 0,
  add column if not exists flags_escalated integer not null default 0;

-- One row per invoice reminder. The unique invoice id is what makes a Stripe
-- webhook retry safe: the email is sent once, even if the event is delivered
-- several times.
create table if not exists public.billing_notification_log (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  text not null unique,
  user_id     uuid references public.profiles (id) on delete set null,
  email       text not null,
  kind        text not null,
  status      text not null default 'sending'
    constraint billing_notification_log_status_check
    check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

alter table public.billing_notification_log enable row level security;
revoke all on public.billing_notification_log from public, anon, authenticated;
