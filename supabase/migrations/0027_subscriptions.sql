-- Subscriptions
create table public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free'::text check (plan in ('free', 'basic', 'super')),
  status text not null default 'incomplete'::text check (status in ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_subscriptions_user_id on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Service role manages subscriptions"
  on public.subscriptions for all
  using (true)
  with check (true);

-- Custom emoji
create table public.custom_emoji (
  id bigint generated always as identity primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  name text not null check (name ~ '^[a-zA-Z0-9_]{2,32}$'),
  url text not null,
  uploader_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(server_id, name)
);

alter table public.custom_emoji enable row level security;

create policy "Members can view server emoji"
  on public.custom_emoji for select
  using (
    exists (
      select 1 from public.server_members
      where server_members.server_id = custom_emoji.server_id
      and server_members.user_id = auth.uid()
    )
  );

create policy "Members with manage_emoji can insert"
  on public.custom_emoji for insert
  with check (
    exists (
      select 1 from public.server_members
      where server_members.server_id = custom_emoji.server_id
      and server_members.user_id = auth.uid()
      and server_members.role_id is not null
    )
  );

-- Server boosts
create table public.server_boosts (
  id bigint generated always as identity primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(server_id, user_id)
);

alter table public.server_boosts enable row level security;

create policy "Anyone can view boosts"
  on public.server_boosts for select
  using (true);

create policy "Users can manage own boosts"
  on public.server_boosts for insert
  with check (auth.uid() = user_id);

-- Function to get subscription plan for a user (used by RLS and queries)
create or replace function public.get_subscription_plan(user_id uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (select plan from public.subscriptions where subscriptions.user_id = get_subscription_plan.user_id and status = 'active'),
    'free'::text
  );
$$;
