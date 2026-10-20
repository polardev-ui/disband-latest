-- ---------------------------------------------------------------------------
-- 0150: passkeys as a second factor
--
-- Supabase hosted projects do not support WebAuthn MFA factors, but they do
-- support passkey sign-in. A passkey session is only AAL1, so it cannot be used
-- as a second factor by itself. This table stores the encrypted secret of a
-- verified, hidden TOTP factor that the server uses to elevate a passkey
-- session to AAL2 after both the password session and the passkey session have
-- been proven.
--
-- The secret is a server-side implementation detail: it is never shown to the
-- user and the factor is filtered out of every factor list. RLS is on with no
-- policies, and anon/authenticated have no table privileges; only service-role
-- API routes can read it.
-- ---------------------------------------------------------------------------

create table if not exists public.passkey_mfa (
  user_id uuid primary key references auth.users (id) on delete cascade,
  factor_id uuid not null,
  secret_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.passkey_mfa enable row level security;
revoke all on public.passkey_mfa from public, anon, authenticated;
grant all on public.passkey_mfa to service_role;
