-- 0157: remember a scheduled cancellation separately from the subscription
-- status. A Stripe subscription that is set to cancel at the end of its
-- period stays "active" until that date, so status alone cannot tell the
-- billing UI whether renewal has already been stopped.

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.cancel_at_period_end is
  'True when renewal is stopped but the current paid period has not ended yet.';
