-- 0046: bots.last_seen_at
--
-- The bot code has always written and read a `last_seen_at` timestamp on the
-- bots row (presence in `/api/bot/list`, the Bots settings panel, and a
-- fire-and-forget update in lib/bot-auth.ts), but 0044_bots.sql never created
-- the column — so any bot-authenticated request blew up with
-- "column bots.last_seen_at does not exist". Add the missing column so the
-- schema matches what the application already expects.

alter table public.bots
  add column if not exists last_seen_at timestamptz;

create index if not exists bots_last_seen_idx
  on public.bots (last_seen_at desc) where last_seen_at is not null;
