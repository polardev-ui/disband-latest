-- 0121: Support tickets (account help desk).
--
-- Two ways in, one identity rule: a ticket belongs to exactly one Disband
-- account — the authenticated user who filed it (user_id = auth.uid()).
-- Logged-out visitors verify their Disband email first (OTP sign-in), so by
-- the time a row exists the session IS the account holder. There is no
-- "target user" column on purpose: support Tether resolves the account
-- from the caller's session server-side and can never be aimed elsewhere.
--
-- Applied to the live database via the Supabase CLI; kept here as the record.

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  subject      text not null check (char_length(subject) between 1 and 120),
  status       text not null default 'open' check (status in ('open', 'pending', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.support_tickets (id) on delete cascade,
  role         text not null check (role in ('user', 'tether')),
  content      text not null check (char_length(content) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, created_at desc);
create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Own tickets only, both directions. No service bypass needed client-side:
-- the API routes use the service role and re-check ownership explicitly.
drop policy if exists support_tickets_own on public.support_tickets;
create policy support_tickets_own on public.support_tickets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists support_messages_own_ticket on public.support_messages;
create policy support_messages_own_ticket on public.support_messages
  for all to authenticated
  using (exists (
    select 1 from public.support_tickets t
    where t.id = support_messages.ticket_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.support_tickets t
    where t.id = support_messages.ticket_id and t.user_id = auth.uid()
  ));
