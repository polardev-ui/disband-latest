-- 0078_identity_rails.sql
-- Identity rails: pronouns + status note, and server-persisted notification
-- read state.
--
-- 1) Pronouns + status note live on `profiles` so they (a) show next to the
--    profile picture (Pronouns pill + small status-note line), (b) are visible
--    in the DM/right-rail profile view and (c) survive reload on iOS/web/desktop
--    because they are data, not ephemeral UI state.
-- 2) Notifications: unread must survive a reload. Today read state is only
--    derived client-side, so an unread notification disappears on reload before
--    anyone opens it. We persist a server-side `seen_at`: the red pill means
--    `seen_at is null`; it flips to `now()` the first time the bell drawer is
--    opened (never on mount). Reload keeps the pill until the user actually
--    opens the drawer. Clicking routes to the right place (DM / group / call /
--    server channel) so notifications stop funneling everyone into the server
--    view.
--
-- `add column if not exists` keeps this idempotent and safe on any base,
-- reflecting the live `profiles`/`notifications` definitions.

alter table public.profiles
  add column if not exists pronouns text,
  add column if not exists status_note text;

alter table public.notifications
  add column if not exists seen_at timestamptz;

create index if not exists notifications_user_seen_idx
  on public.notifications (user_id, seen_at);

-- Publish the new fields on the public rail query used by Settings and the
-- DM/profile rail. The rail reads through `get_profile`-style RPCs; pronouns
-- and status_note are plain columns so they ride along automatically.
-- (No function body change needed: profiles.<col> columns are already exposed
-- to authenticated under the existing read policy.)
