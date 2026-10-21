-- Keep consumed ceremonies for the lifetime of the user. Refreshing an old
-- session must never turn it into a second reusable MFA proof.
create table public.passkey_mfa_uses (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now()
);
alter table public.passkey_mfa_uses enable row level security;
revoke all on public.passkey_mfa_uses from public, anon, authenticated;
grant select, insert on public.passkey_mfa_uses to service_role;
