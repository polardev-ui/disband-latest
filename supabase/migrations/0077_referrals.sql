-- 0077_referrals.sql
-- Referral program.
--
-- Every account gets a unique 9-character referral code (the code is public:
-- it appears in share URLs and on the leaderboard). A signup can carry one
-- code in its user metadata; the account-creation trigger records a pending
-- referral, and the email-verification trigger flips it to verified. Only
-- verified referrals count — a signup that never confirms its address never
-- moves the leaderboard.
--
-- The December standings (verified_at within December) decide the $100 Visa
-- gift-card winner; referral_leaderboard() exposes both windows.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_codes_len check (char_length(code) = 9),
  constraint referral_codes_charset check (code ~ '^[0-9a-zA-Z]{9}$')
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    constraint referrals_status_check check (status in ('pending', 'verified')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  -- One referral per account, ever: no code-hopping to re-credit a signup.
  constraint referrals_referred_unique unique (referred_user_id),
  constraint referrals_no_self check (referrer_id <> referred_user_id)
);

create index if not exists referrals_referrer_verified_idx
  on public.referrals (referrer_id, verified_at);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

-- Codes are public by design (share URLs, leaderboard). Referral rows are
-- private to their two parties; aggregate counts come from the
-- security-definer RPC below, not from client reads.
create policy referral_codes_read on public.referral_codes
  for select to anon, authenticated using (true);
create policy referrals_read_own on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_user_id = auth.uid());

revoke all on public.referral_codes, public.referrals from public, anon, authenticated;
grant select on public.referral_codes to anon, authenticated;
grant select on public.referrals to authenticated;

-- ---------------------------------------------------------------------------
-- Code generation (9 mixed-case alphanumerics), collision-checked
-- ---------------------------------------------------------------------------
create or replace function public.generate_referral_code() returns text
language plpgsql
set search_path = public
as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..9 loop
      candidate := candidate || substr(chars, 1 + floor(random() * 62)::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes where code = candidate);
  end loop;
  return candidate;
end $$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;

-- Backfill: every existing account gets a code.
do $$
declare
  p record;
begin
  for p in select id from public.profiles
  loop
    insert into public.referral_codes (user_id, code)
    values (p.id, public.generate_referral_code())
    on conflict (user_id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Account creation: mint the code, apply the signup's code (if any)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_referral_code text;
  v_referrer_id uuid;
begin
  v_username := public.resolve_username(
    new.raw_user_meta_data ->> 'username',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.id
  );
  perform public.assert_username_available(v_username, new.id);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Every account carries a referral code from the first moment it exists.
  insert into public.referral_codes (user_id, code)
  values (new.id, public.generate_referral_code())
  on conflict (user_id) do nothing;

  -- The signup form captured a code: credit it once, and only if the address
  -- is already confirmed at creation time (some configurations skip the
  -- verification email). Otherwise the verification trigger lands it.
  v_referral_code := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  if v_referral_code is not null then
    select user_id into v_referrer_id
    from public.referral_codes
    where code = v_referral_code and user_id <> new.id
    limit 1;
    if v_referrer_id is not null then
      insert into public.referrals (referrer_id, referred_user_id, status, verified_at)
      values (
        v_referrer_id,
        new.id,
        case when new.email_confirmed_at is not null then 'verified' else 'pending' end,
        case when new.email_confirmed_at is not null then now() else null end
      )
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Email verification is what makes a referral count
-- ---------------------------------------------------------------------------
create or replace function public.on_referral_verified() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.referrals
     set status = 'verified', verified_at = now()
   where referred_user_id = new.id and status = 'pending';
  return new;
end $$;

revoke execute on function public.on_referral_verified() from public, anon, authenticated;

drop trigger if exists on_auth_email_verified on auth.users;
create trigger on_auth_email_verified
  after update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null and old.email_confirmed_at is null)
  execute function public.on_referral_verified();

-- ---------------------------------------------------------------------------
-- Leaderboard (public read, aggregates only)
-- ---------------------------------------------------------------------------
create or replace function public.referral_leaderboard(
  p_limit integer default 25,
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (
  standing bigint,
  user_id uuid,
  display_name text,
  username text,
  code text,
  verified_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    row_number() over (order by count(*) desc, min(r.verified_at) asc) as standing,
    p.id as user_id,
    p.display_name as display_name,
    p.username as username,
    rc.code as code,
    count(*) as verified_count
  from public.referrals r
  join public.profiles p on p.id = r.referrer_id
  left join public.referral_codes rc on rc.user_id = r.referrer_id
  where r.status = 'verified'
    and r.verified_at is not null
    and (p_since is null or r.verified_at >= p_since)
    and (p_until is null or r.verified_at < p_until)
    and not exists (select 1 from public.platform_bans b where b.user_id = r.referrer_id)
  group by p.id, p.display_name, p.username, rc.code
  order by count(*) desc, min(r.verified_at) asc
  limit greatest(coalesce(p_limit, 25), 1)
$$;

revoke all on function public.referral_leaderboard(integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.referral_leaderboard(integer, timestamptz, timestamptz)
  to anon, authenticated;

-- Realtime drives the live referral counters in Settings and on the
-- leaderboard. The publication exists on every Supabase project; the guard
-- keeps this migration portable to bare-Postgres test rigs like PGlite.
do $$
begin
  alter publication supabase_realtime add table public.referrals;
exception when undefined_object then null;
end $$;

commit;
