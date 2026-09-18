-- 0087_app_reviews.sql
-- Public app reviews: 1-5 stars, optional text, alias or anonymous display.
-- Posting requires an account (spam control); reading is public.

create table if not exists public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stars smallint not null,
  body text not null default '',
  alias text,
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_reviews_stars_range check (stars between 1 and 5),
  constraint app_reviews_body_length check (char_length(body) <= 2000),
  constraint app_reviews_alias_length check (alias is null or char_length(alias) between 1 and 32)
);

create index if not exists app_reviews_created_idx
  on public.app_reviews (created_at desc);

alter table public.app_reviews enable row level security;

drop policy if exists app_reviews_read on public.app_reviews;
create policy app_reviews_read on public.app_reviews
  for select using (true);

drop policy if exists app_reviews_write_own on public.app_reviews;
create policy app_reviews_write_own on public.app_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists app_reviews_update_own on public.app_reviews;
create policy app_reviews_update_own on public.app_reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists app_reviews_delete_own on public.app_reviews;
create policy app_reviews_delete_own on public.app_reviews
  for delete using (auth.uid() = user_id);
