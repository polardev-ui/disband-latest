-- ---------------------------------------------------------------------------
-- 0184: gifting decorations, and staff moderation of bots.
--
--   1. wallet_gift_decoration(): spend Glimmers on a decoration for a friend.
--      (Paid gifts go through the shop checkout and the Stripe webhook.)
--   2. bot_moderation_log: every warning, deactivation and reactivation staff
--      make from Settings → Management, with the reason the owner is told.
-- ---------------------------------------------------------------------------

create or replace function public.wallet_gift_decoration(p_item text, p_recipient uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if public.is_anonymous(v_user) then raise exception 'Guest accounts cannot send gifts'; end if;
  if p_recipient = v_user then raise exception 'Redeem it for yourself instead'; end if;
  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester_id = v_user and addressee_id = p_recipient)
         or (requester_id = p_recipient and addressee_id = v_user))
  ) then
    raise exception 'You can only gift to friends';
  end if;
  if not exists (select 1 from public.shop_items where id = p_item and category = 'ring' and active) then
    raise exception 'That decoration is not available';
  end if;
  if exists (select 1 from public.user_shop_items where user_id = p_recipient and item_id = p_item) then
    raise exception 'They already have that decoration';
  end if;

  perform public.wallet_apply(v_user, -500, 'gift_decoration', p_item || ':' || p_recipient::text);
  insert into public.user_shop_items (user_id, item_id) values (p_recipient, p_item);

  select coalesce(display_name, username, 'Someone') into v_name from public.profiles where id = v_user;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_recipient, 'gift', 'You got a gift',
          v_name || ' gifted you the ' || (select name from public.shop_items where id = p_item) || ' decoration. Wear it from the Shop.',
          'shop:ring');
  return jsonb_build_object('ok', true, 'item', p_item);
end;
$$;
revoke all on function public.wallet_gift_decoration(text, uuid) from public, anon;
grant execute on function public.wallet_gift_decoration(text, uuid) to authenticated;

create table if not exists public.bot_moderation_log (
  id bigserial primary key,
  bot_id uuid not null references public.bots(id) on delete cascade,
  actor_id uuid not null,
  action text not null check (action in ('warn', 'deactivate', 'reactivate')),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists bot_moderation_log_bot_idx on public.bot_moderation_log (bot_id, created_at desc);
alter table public.bot_moderation_log enable row level security;
drop policy if exists "staff read bot moderation" on public.bot_moderation_log;
create policy "staff read bot moderation" on public.bot_moderation_log for select to authenticated
  using ((select public.is_platform_staff(auth.uid())));
