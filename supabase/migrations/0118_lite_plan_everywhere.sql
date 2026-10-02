-- 0118: Lite plan support in the entitlement layer
--
-- Lite shipped in the UI (PLANS/ENTITLEMENTS, GiftModal's plan picker,
-- create-checkout metadata, the Stripe webhook) but the database still
-- predated it:
--
--   * subscriptions_plan_check only allowed ('free','aero'), so recording a
--     Lite subscriber failed outright — the webhook's upsert would violate
--     the check and the subscriber paid for nothing.
--   * gift_entitlements_plan_check only allowed 'aero', so a claimed Lite
--     gift could not store what it granted.
--   * claim_gift hardcoded 'aero' in three places: claiming a $2.99 Lite
--     gift granted a full Aero entitlement.
--   * get_entitlement / get_entitlements returned 'aero' or 'free' only,
--     hiding Lite subscriptions from iOS and Lite gifts from the badge
--     store, Tether, and the profile entitlement feed.
--
-- Every existing row is 'free'/'aero', so widening the checks is safe.
-- gift_entitlements holds one row per user, so stacking keeps the BETTER
-- plan: a later Lite gift must not downgrade an active Aero one.
--
-- Applied to the live database via the Supabase CLI; kept here as the record.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('free', 'lite', 'aero'));

alter table public.gift_entitlements
  drop constraint if exists gift_entitlements_plan_check;
alter table public.gift_entitlements
  add constraint gift_entitlements_plan_check check (plan in ('lite', 'aero'));

create or replace function public.claim_gift(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path TO 'public'
as $function$
declare
  g public.gifts%rowtype;
  v_user uuid := auth.uid();
  v_from timestamptz;
  v_held text;
  v_plan text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select * into g from public.gifts where code = p_code for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That gift link is not valid.');
  end if;
  if g.status = 'claimed' then
    return jsonb_build_object('ok', false, 'error', 'Someone already claimed this gift.');
  end if;
  if g.status <> 'unclaimed' then
    return jsonb_build_object('ok', false, 'error', 'This gift is not available.');
  end if;
  if g.expires_at < now() then
    update public.gifts set status = 'expired' where id = g.id;
    return jsonb_build_object('ok', false, 'error', 'This gift has expired.');
  end if;
  if g.buyer_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'You cannot claim your own gift.');
  end if;

  update public.gifts
  set status = 'claimed', claimed_by = v_user, claimed_at = now()
  where id = g.id;

  -- Stack onto whatever gift time is already held rather than replacing it.
  -- The row carries one plan, so mixing plans keeps the better of the two
  -- instead of letting a later Lite gift downgrade an active Aero one.
  select expires_at, plan
    into v_from, v_held
    from public.gift_entitlements
   where user_id = v_user;

  v_plan := case
    when g.plan in ('aero', 'basic', 'super') or v_held in ('aero', 'basic', 'super')
      then 'aero'
    when g.plan = 'lite' or v_held = 'lite'
      then 'lite'
    else g.plan
  end;

  insert into public.gift_entitlements (user_id, plan, expires_at, updated_at)
  values (v_user, v_plan,
          greatest(coalesce(v_from, now()), now()) + (g.months || ' months')::interval, now())
  on conflict (user_id) do update set
    plan = excluded.plan,
    expires_at = excluded.expires_at,
    updated_at = now();

  perform public.refresh_user_badges(g.buyer_id);
  perform public.refresh_user_badges(v_user);

  return jsonb_build_object('ok', true, 'plan', v_plan, 'months', g.months,
                            'from', g.buyer_id);
end;
$function$;

create or replace function public.get_entitlement(p_user uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path TO 'public'
as $function$
  with u as (select coalesce(p_user, auth.uid()) as id),
  sub as (
    select plan, status, first_subscribed_at, tenure_months
    from public.subscriptions, u
    where subscriptions.user_id = u.id
      and status in ('active','trialing','past_due')
    limit 1
  ),
  gift as (
    select plan, expires_at from public.gift_entitlements, u
    where gift_entitlements.user_id = u.id and expires_at > now()
  )
  select jsonb_build_object(
    'plan', case
      when (select plan from sub) in ('aero','basic','super')
        or (select plan from gift) in ('aero','basic','super') then 'aero'
      when (select plan from sub) = 'lite'
        or (select plan from gift) = 'lite' then 'lite'
      else 'free' end,
    'months', coalesce((select tenure_months from sub), 0)
              + coalesce((select greatest(0, ceil(extract(epoch from (expires_at - now())) / 2592000))::int
                          from gift), 0),
    'since', (select first_subscribed_at from sub),
    'gift_until', (select expires_at from gift)
  );
$function$;

create or replace function public.get_entitlements(p_users uuid[])
 returns TABLE(user_id uuid, plan text, months integer, since timestamp with time zone, gift_until timestamp with time zone)
 language sql
 stable security definer
 set search_path TO 'public'
as $function$
  select
    u.id as user_id,
    case
      when s.plan in ('aero','basic','super') or g.plan in ('aero','basic','super')
        then 'aero'
      when s.plan = 'lite' or g.plan = 'lite'
        then 'lite'
      else 'free'
    end as plan,
    (coalesce(s.tenure_months, 0)
      + coalesce(greatest(0, ceil(extract(epoch from (g.expires_at - now())) / 2592000))::int, 0))::int as months,
    s.first_subscribed_at as since,
    g.expires_at as gift_until
  from unnest(p_users) as u(id)
  left join public.subscriptions s
    on s.user_id = u.id and s.status in ('active','trialing','past_due')
  left join public.gift_entitlements g
    on g.user_id = u.id and g.expires_at > now();
$function$;
