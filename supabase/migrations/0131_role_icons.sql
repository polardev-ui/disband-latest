-- 0131_role_icons.sql
-- Role icons: a small emoji or uploaded image shown beside a role's name, on
-- members wearing it in chat, the member list and profiles.
--
-- `icon` holds either a short emoji string or an https URL to an uploaded
-- image. Unlocked at Catalyst Level 2; the level is enforced by
-- 0132_catalyst_perk_guard.sql.
--
-- (Applied to the live project on 2026-10-16 before this file was written;
-- kept here so a fresh database matches.)

alter table if exists public.server_roles add column if not exists icon text;
