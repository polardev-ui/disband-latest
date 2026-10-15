-- 0128: Team support dashboard + human replies.
create table if not exists public.support_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.support_staff (user_id)
values
  ('18c3ef6d-7540-43ec-a826-0bed8d83beb7'::uuid),
  ('cbcbf98b-aa53-44cf-a2b0-1c551a8267c7'::uuid),
  ('9970924c-9497-465e-9fbf-8699f3dc3ed0'::uuid)
on conflict (user_id) do nothing;

alter table public.support_messages
  drop constraint if exists support_messages_role_check;
alter table public.support_messages
  add constraint support_messages_role_check
  check (role in ('user', 'tether', 'staff', 'system'));

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'pending', 'human_reply', 'closed'));

alter table public.support_staff enable row level security;
drop policy if exists support_staff_self_select on public.support_staff;
create policy support_staff_self_select on public.support_staff
  for select to authenticated
  using (auth.uid() = user_id);
