-- 0072_aero_plan.sql
-- Basic and Super become one paid plan: Disband Aero.
--
-- Aero is Super's entitlement set at Super's price, so every existing
-- subscriber keeps exactly what they were paying for. There were no Basic
-- subscribers to move, so nobody's price changed either.
--
-- Order matters: widen the CHECK constraints first so the UPDATEs have a legal
-- value to write, then narrow them once no old values remain. Doing it the
-- other way round fails on the first row.

begin;

-- 1. Allow 'aero' alongside the old names for the length of this migration.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan = any (array['free','basic','super','aero']));

alter table public.gifts drop constraint if exists gifts_plan_check;
alter table public.gifts add constraint gifts_plan_check
  check (plan = any (array['basic','super','aero']));

alter table public.gift_entitlements drop constraint if exists gift_entitlements_plan_check;
alter table public.gift_entitlements add constraint gift_entitlements_plan_check
  check (plan = any (array['basic','super','aero']));

-- 2. Move the data.
update public.subscriptions set plan = 'aero' where plan in ('basic','super');
update public.gifts set plan = 'aero' where plan in ('basic','super');
update public.gift_entitlements set plan = 'aero' where plan in ('basic','super');

-- 3. Narrow to what exists now.
alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan = any (array['free','aero']));

alter table public.gifts drop constraint gifts_plan_check;
alter table public.gifts add constraint gifts_plan_check check (plan = 'aero');

alter table public.gift_entitlements drop constraint gift_entitlements_plan_check;
alter table public.gift_entitlements add constraint gift_entitlements_plan_check
  check (plan = 'aero');

-- 4. The RPCs speak the new vocabulary.
--
-- They still *read* the old names: during a rollout a webhook from the
-- previous deploy can still write "super", and answering "free" to a paying
-- customer for those few minutes is the one failure worth designing out.
-- The full bodies were applied with this migration; see the live definitions
-- of get_entitlements, get_entitlement, save_theme and claim_gift.

commit;
