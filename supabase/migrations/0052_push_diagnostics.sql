-- Temporary diagnostics for the VoIP push → PushKit → CallKit chain.
-- Rows are written by the iOS app (own-user only) and read via the Supabase
-- dashboard SQL editor while debugging lock-screen ringing. Drop after use.

create table if not exists public.push_diagnostics (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event text not null,
    detail text
);

alter table public.push_diagnostics enable row level security;

create policy "insert own push diagnostics"
    on public.push_diagnostics for insert
    with check (auth.uid() = user_id);

create policy "read own push diagnostics"
    on public.push_diagnostics for select
    using (auth.uid() = user_id);