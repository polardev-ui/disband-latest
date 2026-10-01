-- ---------------------------------------------------------------------------
-- 0112: Close the catalyst counterfeit, member force-add, and bot-flag holes
--
-- Three live holes, all proven against production before writing this:
--
-- 1. server_catalysts accepted client INSERTs gated only on
--    user_id = auth.uid(). Anyone could mint unlimited catalysts on any
--    server: one account wrote 398 in 7 minutes (plus 4 on three other
--    servers), against 8 lifetime Stripe purchases. Writes now come only
--    from the Stripe webhook / Apple IAP edge function (service role,
--    unaffected). The self-delete policy stays: removing your own boost is
--    legitimate product behavior.
--
-- 2. server_members accepted client INSERTs from the row's own subject
--    (self-join to any server, invite or not) and from any owner/admin for
--    any target (force-add). No client on any platform inserts this table
--    directly — web, iOS, and Android all join through the definer RPCs
--    (join_server_by_invite, join_server_by_id, create_server's owner row)
--    or the service role — so client INSERT is removed entirely rather than
--    narrowed.
--
-- 3. profiles_update_own has no column restriction, and
--    protect_platform_badges only pinned show_owner/staff_badge. Any user
--    could set is_bot and bot_dm_enabled on themselves (one live rogue:
--    a normal signup walking around as a bot). That flag opts out of every
--    official-notice audience (broadcast recipients exclude bots), dodges
--    friend/block mechanics, and impersonates system accounts. Both flags
--    are now frozen for end-user sessions exactly like the badges; bots are
--    provisioned service-side (auth.uid() null), which this does not touch.
--
-- Cleanup in the same transaction: the 402 scripted grant rows (burst
-- timing, no payment reference of either kind) and the rogue bot flag.
-- Ambiguous small grant sets are left for human judgment, not deleted here.
-- ---------------------------------------------------------------------------

-- 1. Catalysts: service-role writers only.
drop policy if exists server_catalysts_insert_own on public.server_catalysts;
revoke insert on public.server_catalysts from authenticated;

-- 2. Membership: joins happen through the invite/discover RPCs, never raw.
drop policy if exists server_members_insert on public.server_members;
revoke insert on public.server_members from authenticated;

-- 3. Identity flags: extend the existing badge guard, same shape.
create or replace function public.protect_platform_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A logged-in user (auth.uid() set) can never set their own badges or bot
  -- flags; only the service role / dashboard (auth.uid() is null) may.
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.show_owner_badge := false;
      new.show_staff_badge := false;
      new.is_bot := false;
      new.bot_dm_enabled := false;
    end if;
  elsif tg_op = 'UPDATE' then
    if (
      old.show_owner_badge is distinct from new.show_owner_badge
      or old.show_staff_badge is distinct from new.show_staff_badge
      or old.is_bot is distinct from new.is_bot
      or old.bot_dm_enabled is distinct from new.bot_dm_enabled
    ) and auth.uid() is not null then
      new.show_owner_badge := old.show_owner_badge;
      new.show_staff_badge := old.show_staff_badge;
      new.is_bot := old.is_bot;
      new.bot_dm_enabled := old.bot_dm_enabled;
    end if;
  end if;
  return new;
end;
$$;

-- 4a. Remediate self-flagged bots: is_bot with no bots-table row is, by
-- construction, not a provisioned bot. Tether and @disband are excluded by
-- name (neither holds a bots row either).
update public.profiles
  set is_bot = false,
      bot_dm_enabled = false
  where coalesce(is_bot, false) = true
    and lower(username) not in ('tether', 'disband')
    and not exists (select 1 from public.bots b where b.user_id = profiles.id);

-- 4b. Delete the scripted catalyst rows: burst timing plus no payment
-- reference of either kind. Purchases carry a session/transaction id and
-- are untouched by construction.
delete from public.server_catalysts
  where source = 'grant'
    and stripe_session_id is null
    and apple_transaction_id is null
    and user_id in (
      'a3eceed8-6d40-4e90-abcf-3307871a31e4',  -- informant: 398 rows, 7 minutes
      '2ecd96b4-39e9-4b59-affb-fa7dc493306b'   -- disbandcia: 4 rows, 1 second
    );
