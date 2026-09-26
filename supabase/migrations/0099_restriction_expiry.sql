-- 0099_restriction_expiry.sql
-- Expiring account restrictions, and a "cannot react" capability to go with
-- them, so a restriction can be a week long instead of permanent.
--
-- WHY THIS IS ITS OWN MIGRATION
-- Postgres refuses to let a transaction *use* an enum value in the same
-- transaction that adds it ("unsafe use of new value ... of enum type"). The
-- enforcement policies in 0100 compare against 'send_reactions', so the value
-- has to be committed here first. Do not fold these two files together.
--
-- WHAT CHANGES
--   * new capability 'send_reactions' — the "like" half of "you cannot like or
--     type for a week". The "type" half is the existing 'send_messages'.
--   * account_restrictions.expires_at — NULL keeps the existing permanent
--     behaviour, so nothing that relies on a restriction lasting forever
--     changes meaning. Every pre-existing row is NULL and therefore permanent,
--     exactly as it was.
--
-- Expiry is enforced by *reading* expires_at at enforcement time rather than by
-- a sweeper that deletes rows: there is no window in which an expired
-- restriction still applies, and no scheduled job that has to be healthy for
-- the restriction to lapse. 0100 adds the sweeper purely so the user is told
-- when it lapsed.

alter type public.account_restriction add value if not exists 'send_reactions';

alter table public.account_restrictions
  add column if not exists expires_at timestamptz;

comment on column public.account_restrictions.expires_at is
  'When this restriction lapses. NULL means permanent, which is how every row '
  'existed before this column was added. Enforced by comparison at write time, '
  'so an expired restriction stops applying the instant it expires without '
  'needing a sweeper to clean it up.';

-- Partial index: enforcement asks "does this user have a LIVE restriction",
-- which is a small, hot question on every message and reaction insert. Only
-- permanent rows are in this index, because a permanent row is the only kind
-- that stays live forever.
create index if not exists account_restrictions_live_idx
  on public.account_restrictions (user_id, restriction)
  where expires_at is null;

-- Sweeper support: "what lapsed since we last looked".
create index if not exists account_restrictions_expiry_idx
  on public.account_restrictions (expires_at)
  where expires_at is not null;
