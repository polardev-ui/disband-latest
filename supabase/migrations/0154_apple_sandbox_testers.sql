-- 0154: App Store sandbox purchases are only entitlements for test accounts.
--
-- App Review has to be able to buy Aero and Catalysts with a sandbox Apple ID
-- against the production backend, and those purchases do not move money. The
-- verify function used to accept a sandbox transaction for any account, which
-- meant a normal account signed into a sandbox Apple ID could mint permanent
-- Catalysts and a free Aero subscription. This table is the explicit allowlist
-- for App Review and developer QA accounts. The Edge Function fails closed:
-- a sandbox receipt for an account not listed here grants nothing.
--
-- A development Supabase project can skip the allowlist with
-- APPSTORE_ALLOW_SANDBOX=true; production must not set that.

create table if not exists public.apple_sandbox_testers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  -- Set this for App Review so test access expires after the review window.
  -- Null means the account stays allowlisted until the row is deleted.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.apple_sandbox_testers is
  'Disband accounts allowed to turn App Store sandbox purchases into entitlements. Service-role only.';

alter table public.apple_sandbox_testers enable row level security;

-- No policies: the iOS client never reads this, and the Edge Function uses
-- the service role. An authenticated user must not be able to add themselves.
revoke all on public.apple_sandbox_testers from anon, authenticated;

-- Remove entitlements already minted from sandbox purchases. At the time this
-- migration was written the only sandbox rows were developer test purchases,
-- but the cleanup is deliberately general: a production account must not keep
-- anything a sandbox receipt granted.
delete from public.server_catalysts sc
using public.apple_transactions t
where sc.apple_transaction_id = t.transaction_id
  and t.environment = 'Sandbox'
  and not exists (
    select 1
    from public.apple_sandbox_testers s
    where s.user_id = sc.user_id
      and (s.expires_at is null or s.expires_at > now())
  );

update public.subscriptions s
set
  plan = 'free',
  status = 'canceled',
  canceled_at = coalesce(s.canceled_at, now()),
  updated_at = now()
where s.provider = 'apple'
  and exists (
    select 1
    from public.apple_transactions t
    where t.original_transaction_id = s.apple_original_transaction_id
      and t.environment = 'Sandbox'
  )
  and not exists (
    select 1
    from public.apple_sandbox_testers st
    where st.user_id = s.user_id
      and (st.expires_at is null or st.expires_at > now())
  );
