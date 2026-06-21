-- Mobile web waitlist (synced to Resend audience via API route)

create table if not exists public.mobile_waitlist (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  resend_contact_id text,
  created_at        timestamptz not null default now(),
  notified_at       timestamptz,
  constraint mobile_waitlist_email_unique unique (email),
  constraint mobile_waitlist_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists mobile_waitlist_pending_idx
  on public.mobile_waitlist (created_at)
  where notified_at is null;

alter table public.mobile_waitlist enable row level security;

-- No public policies — inserts go through service-role API route only
