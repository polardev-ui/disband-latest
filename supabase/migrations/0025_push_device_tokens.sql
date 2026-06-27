-- 0025_push_device_tokens.sql
-- Stores APNs (and future FCM) device tokens so the backend can push
-- notifications to a user's signed-in devices.

create table if not exists public.device_tokens (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null,
  platform    text not null default 'ios',
  updated_at  timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.device_tokens enable row level security;

-- A user may only see/insert/update/delete their own device tokens.
drop policy if exists "device_tokens_select_own" on public.device_tokens;
create policy "device_tokens_select_own" on public.device_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "device_tokens_insert_own" on public.device_tokens;
create policy "device_tokens_insert_own" on public.device_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "device_tokens_update_own" on public.device_tokens;
create policy "device_tokens_update_own" on public.device_tokens
  for update using (auth.uid() = user_id);

drop policy if exists "device_tokens_delete_own" on public.device_tokens;
create policy "device_tokens_delete_own" on public.device_tokens
  for delete using (auth.uid() = user_id);

-- Upsert helper the app calls after it receives an APNs token.
create or replace function public.register_device_token(p_token text, p_platform text default 'ios')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.device_tokens (user_id, token, platform, updated_at)
    values (auth.uid(), p_token, p_platform, now())
  on conflict (user_id, token)
    do update set updated_at = now(), platform = excluded.platform;
end;
$$;

revoke all on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;
