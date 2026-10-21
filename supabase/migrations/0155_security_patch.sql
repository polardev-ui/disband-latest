-- 0155_security_patch.sql
--
-- Security remediation for the October 2026 audit. Applied to production via
-- the Supabase MCP (not `supabase db push`; production history is timestamped).
--
-- 1. Stop deriving public names from email addresses.
-- 2. Keep private profile/control fields out of user updates.
-- 3. Remove cross-user gift, entitlement, bot, poll, and catalyst exposure.
-- 4. Require server permission before writing soundboard objects to storage.
--
-- All statements are intentionally idempotent so the file can be re-run as a
-- record of the production state.

begin;

-- ---------------------------------------------------------------------------
-- 1. Public names must never be derived from email
-- ---------------------------------------------------------------------------

-- p_email is retained for signature compatibility but is deliberately ignored.
create or replace function public.resolve_username(
  p_preferred text default null,
  p_display_name text default null,
  p_email text default null,
  p_except_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preferred text := nullif(lower(trim(p_preferred)), '');
  v_base text;
  v_probe text;
  v_i integer := 0;
begin
  if v_preferred is not null and v_preferred ~ '^[a-z0-9_]{2,25}$' then
    return v_preferred;
  end if;

  v_base := regexp_replace(
    lower(coalesce(nullif(trim(p_display_name), ''), '')),
    '[^a-z0-9_]', '', 'g'
  );

  -- Derive a neutral, unique base from the account id. Never use the email
  -- local-part: usernames are public and email addresses are not.
  if v_base = '' and p_except_id is not null then
    v_base := 'member' || substr(replace(p_except_id::text, '-', ''), 1, 8);
  end if;
  if v_base = '' then
    v_base := 'member' || to_char(floor(random() * 100000000)::bigint, 'FM00000000');
  end if;

  while length(v_base) < 2 loop
    v_base := v_base || '0';
  end loop;
  v_base := left(v_base, 25);

  v_probe := v_base;
  while exists (
    select 1 from public.profiles
    where lower(username) = v_probe
      and (p_except_id is null or id <> p_except_id)
  ) loop
    v_i := v_i + 1;
    if v_i > 200 then
      v_probe := left(v_base, 20) || to_char(floor(random() * 100000)::bigint, 'FM00000');
      exit;
    end if;
    v_probe := left(v_base, 25 - length(v_i::text)) || v_i::text;
  end loop;

  return v_probe;
end;
$$;

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
  v_fallback_display text;
  v_suffix integer := 0;
begin
  v_fallback_display := 'member-' || substr(replace(new.id::text, '-', ''), 1, 8);

  v_username := public.resolve_username(
    new.raw_user_meta_data ->> 'username',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      v_fallback_display
    ),
    null,
    new.id
  );

  -- Dashboard invites may provide no username metadata. If the resolved name
  -- is blocked, use a neutral unique username instead. Explicitly supplied
  -- usernames/display names still pass through the existing policy.
  if public.username_contains_blocked_word(v_username)
     and nullif(trim(new.raw_user_meta_data ->> 'username'), '') is null
     and nullif(trim(new.raw_user_meta_data ->> 'display_name'), '') is null
     and nullif(trim(new.raw_user_meta_data ->> 'full_name'), '') is null then
    v_username := 'member' || substr(replace(new.id::text, '-', ''), 1, 16);

    while exists (
      select 1 from public.profiles
      where lower(username) = lower(v_username)
        and id <> new.id
    ) loop
      v_suffix := v_suffix + 1;
      v_username := left('member' || substr(replace(new.id::text, '-', ''), 1, 16),
                         25 - length(v_suffix::text)) || v_suffix::text;
    end loop;
  end if;

  perform public.assert_username_available(v_username, new.id);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      v_fallback_display
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.referral_codes (user_id, code)
  values (new.id, public.generate_referral_code())
  on conflict (user_id) do nothing;

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
end;
$$;

create or replace function public.ensure_user_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_fallback_display text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;

  select * into v_user from auth.users where id = auth.uid();
  if not found then
    raise exception 'Auth user not found';
  end if;

  v_fallback_display := 'member-' || substr(replace(v_user.id::text, '-', ''), 1, 8);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    v_user.id,
    public.resolve_username(
      nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), ''),
      coalesce(
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        v_fallback_display
      ),
      null,
      v_user.id
    ),
    coalesce(
      nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
      v_fallback_display
    ),
    v_user.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.complete_signup_profile(
  p_username text default null,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_username text;
  v_display_name text;
  v_fallback_display text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_username := nullif(lower(trim(p_username)), '');
  v_display_name := nullif(trim(p_display_name), '');
  v_fallback_display := 'member-' || substr(replace(auth.uid()::text, '-', ''), 1, 8);

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    select * into v_user from auth.users where id = auth.uid();
    if not found then
      raise exception 'Auth user not found';
    end if;

    v_username := public.resolve_username(
      coalesce(v_username, nullif(lower(trim(v_user.raw_user_meta_data ->> 'username')), '')),
      coalesce(
        v_display_name,
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        v_fallback_display
      ),
      null,
      auth.uid()
    );
    perform public.assert_username_available(v_username, auth.uid());

    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      auth.uid(),
      v_username,
      coalesce(
        v_display_name,
        nullif(trim(v_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
        v_fallback_display
      ),
      v_user.raw_user_meta_data ->> 'avatar_url'
    );
  elsif v_username is not null or v_display_name is not null then
    if v_username is not null then
      v_username := public.resolve_username(
        v_username,
        coalesce(v_display_name, (select display_name from public.profiles where id = auth.uid())),
        null,
        auth.uid()
      );
    end if;
    update public.profiles
    set
      username = coalesce(v_username, username),
      display_name = coalesce(v_display_name, display_name),
      updated_at = now()
    where id = auth.uid();
  end if;
end;
$$;

-- Backfill legacy rows where the stored display name is exactly the public
-- email local-part, the full email, or an email-shaped string. Keep the
-- username only when it is not itself email-derived.
-- The change-limit trigger is for user edits, not this one-time backfill.
-- It also rejects three legacy rows whose username is null (the NOT VALID
-- username check only runs when the row is touched), so fill those in the
-- same statement.
alter table public.profiles disable trigger profiles_enforce_update_limits;

with candidates as (
  select
    p.id,
    p.username,
    case
      when p.username is not null
        and length(trim(p.username)) > 0
        and position('@' in p.username) = 0
        and lower(p.username) <> lower(split_part(u.email, '@', 1))
      then p.username
      else 'member-' || substr(replace(p.id::text, '-', ''), 1, 8)
    end as replacement
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.display_name is not null
    and (
      lower(p.display_name) = lower(split_part(u.email, '@', 1))
      or lower(p.display_name) = lower(u.email)
      or p.display_name ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    )
)
update public.profiles p
set display_name = c.replacement,
    username = case
      when p.username is null or length(trim(p.username)) = 0
        then 'member' || substr(replace(p.id::text, '-', ''), 1, 16)
      else p.username
    end,
    updated_at = now()
from candidates c
where p.id = c.id
  and (
    p.display_name is distinct from c.replacement
    or p.username is null
    or length(trim(p.username)) = 0
  );

alter table public.profiles enable trigger profiles_enforce_update_limits;

-- ---------------------------------------------------------------------------
-- 2. User updates cannot change authority-bearing profile fields
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role / dashboard. Authenticated users
  -- may edit their public profile, but never their account class, deletion
  -- lifecycle, or voice tenure.
  if auth.uid() is not null then
    new.account_type := old.account_type;
    new.deletion_requested_at := old.deletion_requested_at;
    new.deletion_cancel_until := old.deletion_cancel_until;
    new.deletion_purge_at := old.deletion_purge_at;
    new.voice_minutes := old.voice_minutes;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- The function already handles INSERT, but the old trigger only fired on
-- UPDATE. Keep the platform badge and bot flags closed on both paths.
drop trigger if exists profiles_protect_platform_badges on public.profiles;
create trigger profiles_protect_platform_badges
  before insert or update on public.profiles
  for each row execute function public.protect_platform_badges();

-- ---------------------------------------------------------------------------
-- 3. Gift codes are bearer secrets; never list them
-- ---------------------------------------------------------------------------

drop policy if exists "gifts_read" on public.gifts;
drop policy if exists "gifts_read_own" on public.gifts;
create policy "gifts_read_own" on public.gifts
  for select to authenticated
  using (buyer_id = auth.uid() or claimed_by = auth.uid());

create or replace function public.get_gift(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', g.code,
    'plan', g.plan,
    'months', g.months,
    'status', g.status,
    'buyer_id', g.buyer_id,
    'claimed_by', g.claimed_by,
    'expires_at', g.expires_at
  )
  from public.gifts g
  where g.code = p_code
  limit 1;
$$;

revoke all on function public.get_gift(text) from public;
revoke all on function public.get_gift(text) from anon;
grant execute on function public.get_gift(text) to authenticated;

drop policy if exists "gift_ent_read" on public.gift_entitlements;
drop policy if exists "gift_ent_read_own" on public.gift_entitlements;
create policy "gift_ent_read_own" on public.gift_entitlements
  for select to authenticated
  using (user_id = auth.uid());

-- Entitlement badges may show a plan, but tenure and gift expiry belong to
-- the account holder only.
create or replace function public.get_entitlements(p_users uuid[])
returns table(
  user_id uuid,
  plan text,
  months integer,
  since timestamp with time zone,
  gift_until timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id as user_id,
    case
      when s.plan in ('aero','basic','super') or g.plan in ('aero','basic','super')
        then 'aero'
      when s.plan = 'lite' or g.plan = 'lite'
        then 'lite'
      else 'free'
    end as plan,
    case
      when u.id = auth.uid() then
        (coalesce(s.tenure_months, 0)
          + coalesce(greatest(0, ceil(extract(epoch from (g.expires_at - now())) / 2592000))::int, 0))::int
      else 0
    end as months,
    case when u.id = auth.uid() then s.first_subscribed_at else null end as since,
    case when u.id = auth.uid() then g.expires_at else null end as gift_until
  from unnest(p_users) as u(id)
  left join public.subscriptions s
    on s.user_id = u.id and s.status in ('active','trialing','past_due')
  left join public.gift_entitlements g
    on g.user_id = u.id and g.expires_at > now();
$$;

revoke all on function public.get_entitlements(uuid[]) from public;
revoke all on function public.get_entitlements(uuid[]) from anon;
grant execute on function public.get_entitlements(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bot ownership cannot be repointed at another account
-- ---------------------------------------------------------------------------

drop policy if exists "bots_owner_update" on public.bots;
drop policy if exists "bots_owner_select" on public.bots;

-- Bot management is server-side only. The web/mobile clients use /api/bot/*
-- with the service role, so no browser role needs direct table access.
revoke all on table public.bots from anon;
revoke all on table public.bots from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Catalysts and polls are scoped to the people who can see them
-- ---------------------------------------------------------------------------

drop policy if exists "server_catalysts_read" on public.server_catalysts;
drop policy if exists "server_catalysts_read_member" on public.server_catalysts;
create policy "server_catalysts_read_member" on public.server_catalysts
  for select to authenticated
  using (user_id = auth.uid() or public.is_server_member(server_id));

-- Payment identifiers are service-role data. Clients only need the safe
-- columns used by the boost list and withdraw action.
revoke select on table public.server_catalysts from authenticated;
grant select (id, server_id, user_id, created_at, source)
  on public.server_catalysts to authenticated;

-- Poll questions are visible through the message that contains them. Voter
-- identity is never needed by the UI; get_poll() already returns aggregate
-- counts. Keep only the caller's own vote readable.
drop policy if exists "poll_votes_read" on public.poll_votes;
drop policy if exists "polls_read" on public.polls;
drop policy if exists "polls_select_all" on public.polls;
drop policy if exists "polls_read_author" on public.polls;
create policy "polls_read_author" on public.polls
  for select to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Soundboard storage writes require the same permission as the table
-- ---------------------------------------------------------------------------

drop policy if exists "Moderators can upload server soundboard clips" on storage.objects;
create policy "Moderators can upload server soundboard clips" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'server-sounds'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9]+[.][a-z0-9]{1,8}$'
    and split_part(name, '/', 2) like auth.uid()::text || '-%'
    and public.is_server_member(((storage.foldername(name))[1])::uuid)
    and public.member_has_server_permission(
      ((storage.foldername(name))[1])::uuid,
      auth.uid(),
      'manage_emojis'
    )
  );

commit;
