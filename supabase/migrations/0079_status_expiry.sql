-- 0079_status_expiry.sql
-- Custom-status expiry for the clickable status bubble.
--
-- The status_note on `profiles` is free text (no built-in lifetime). To make
-- a status *expire* like Discord's custom status (10m / 30m / 1h / 3h / 1d /
-- 3d / never), we need a by-when. `status_expires_at` is that column:
--
--   * NULL  -> the status never expires ("until I change it").
--   * set   -> after this instant the status is treated as cleared.
--
-- We store the absolute instant (not a duration) so expiry evaluation is a
-- single `status_expires_at <= now()` comparison with no drift, and so the
-- server can bulk-purge expired statuses headless.
--
-- `add column if not exists` keeps this idempotent and safe on any base,
-- mirroring the live `profiles` definition.

alter table public.profiles
  add column if not exists status_expires_at timestamptz;

-- Cheap headless cleanup sweep: find every profile whose status has lapsed so
-- a scheduled job (or the DM/Settings surface) can null it out in one pass.
create index if not exists profiles_status_expires_at_idx
  on public.profiles (status_expires_at)
  where status_expires_at is not null;
