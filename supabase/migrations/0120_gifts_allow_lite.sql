-- ---------------------------------------------------------------------------
-- 0120: Allow Lite gifts
--
-- 0118 taught claim_gift and the badges about Lite, but the gifts table kept
-- the original CHECK (plan = 'aero'). Every attempt to gift Lite failed at the
-- insert in /api/gifts/create, which the buyer saw as "Could not start the
-- gift." Widen the check to the two plans that can be gifted.
-- ---------------------------------------------------------------------------

alter table public.gifts drop constraint if exists gifts_plan_check;
alter table public.gifts
  add constraint gifts_plan_check check (plan in ('aero', 'lite'));
