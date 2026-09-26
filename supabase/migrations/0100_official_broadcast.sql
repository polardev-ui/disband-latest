-- 0100_official_broadcast.sql
-- The official @disband account: a locked system identity that can address
-- every account on Disband or one named account, plus real enforcement for
-- expiring restrictions and automatic notices when one is applied or lifted.
--
-- Depends on 0099 (which added the 'send_reactions' enum value and
-- account_restrictions.expires_at in its own transaction, because Postgres
-- forbids using a new enum value in the transaction that adds it).
--
-- ---------------------------------------------------------------------------
-- Why a notification and not a DM
--
-- DM is the wrong rail for this and the database already says so.
-- get_or_create_dm_thread() requires an accepted friendship, so a system
-- account could never reach the 95% of Disband who are not friends with it, and
-- 0097 hard-rejects is_bot targets outright. Notifications already fan out
-- per user, already appear in the bell on every client, and already arrive
-- over realtime. So the rail is one row per recipient, and a delivery table
-- records what actually happened to each of them.
--
-- ---------------------------------------------------------------------------
-- Why push is queued rather than sent inline
--
-- notify_push() issues one net.http_post per user. A broadcast to ~9.5k
-- accounts would queue 9.5k HTTP requests inside the sending transaction, with
-- no rate control against APNs/FCM and no way to resume if the process dies.
-- So a send only marks recipients 'pending'; broadcast_dispatch_push() drains
-- them in bounded batches from pg_cron. push_state = 'dispatched' honestly
-- means "handed to the provider", not "the device showed it".
--
-- ---------------------------------------------------------------------------
-- No explicit BEGIN/COMMIT — the migration runner supplies the transaction,
-- like every other migration in this directory.
--
-- HOW TO RUN THIS ONE: expect lock contention, and retry.
--
-- public.profiles, messages, dm_messages, group_messages and message_reactions
-- are all members of the supabase_realtime publication. Supabase's Realtime
-- service (application_name realtime_subscription_manager_pub) refreshes its
-- column cache against those tables continuously, and PostgREST re-reads the
-- schema after every DDL change. Both hold locks that this migration needs to
-- upgrade, so running the whole 800-line file as one transaction deadlocks
-- against them:
--
--   ERROR: 40P01: deadlock detected
--   Process N waits for AccessExclusiveLock on realtime.subscription
--   Process M waits for AccessShareLock on public.profiles
--
-- This is not rare and it is not a bad plan. On the day this was written it
-- reproduced on three consecutive attempts. The lock_timeout below is what
-- makes the failure safe: a deadlock is resolved by Postgres killing one of the
-- two parties, and it does not get to choose politely — the victim may be the
-- Realtime service, which would drop live subscriptions on the site. With a
-- timeout, this transaction is the one that gives way, cleanly and fully
-- rolled back, so a failure is a retry rather than an outage.
--
-- Every statement in this file is idempotent (create or replace, create table
-- if not exists, create index if not exists, drop ... if exists), so retrying
-- the whole file converges, and applying it in several transactions is also
-- safe if the lock windows need to be narrowed further. Do not make it
-- non-idempotent without re-checking that.
--
-- Reset at the end so the timeout cannot leak into anything later on the
-- connection.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The official account
-- ---------------------------------------------------------------------------

create or replace function public.official_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where lower(p.username) = 'disband' and coalesce(p.is_bot, false)
  limit 1;
$$;

revoke all on function public.official_account_id() from public, anon, authenticated;
grant execute on function public.official_account_id() to service_role;

-- Reserve the name, and freeze the account itself.
--
-- This runs on every profile update, so it is written to be a single string
-- comparison rather than a lookup: the hot path must not grow a query. The
-- username comparison alone is enough, because a row can only hold the
-- official name if it is a bot, and a bot row is only reachable by service
-- role once the account's password is randomised.
create or replace function public.guard_official_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Only an end-user session is held to this guard. Keying on the role claim
  -- being 'authenticated' rather than on it being 'service_role' matters: a
  -- migration, a pg_cron tick and the SQL editor all arrive with no role claim
  -- at all, so an allow-list of trusted roles would have blocked this
  -- migration's own bio update below. RLS is still the real gate — anon has no
  -- update policy on profiles at all — this trigger is the net underneath it.
  v_is_end_user boolean :=
    coalesce(current_setting('request.jwt.claim.role', true), '')
    in ('authenticated', 'anon');
begin
  -- Nobody but the system may claim the name.
  if new.username is not null
     and lower(new.username) = 'disband'
     and not coalesce(new.is_bot, false) then
    raise exception 'That username is reserved for official Disband use.'
      using errcode = '42501';
  end if;

  -- The official account itself is frozen for ordinary sessions.
  if tg_op = 'UPDATE'
     and old.username is not null
     and lower(old.username) = 'disband'
     and v_is_end_user then
    raise exception 'The official Disband account cannot be modified.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE'
     and old.username is not null
     and lower(old.username) = 'disband'
     and v_is_end_user then
    raise exception 'The official Disband account cannot be deleted.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists official_identity_guard on public.profiles;
create trigger official_identity_guard
  before update or delete on public.profiles
  for each row execute function public.guard_official_identity();

-- The message the account exists to make. Anti-phishing copy, so it is set
-- once here rather than being retyped by whoever sends the next notice.
update public.profiles
set bio = 'Official Disband account. We will never ask you for your password.',
    display_name = 'Disband',
    is_bot = true
where lower(username) = 'disband';

-- ---------------------------------------------------------------------------
-- Restriction enforcement
--
-- has_active_restriction() is the single definition of "is this capability
-- currently taken away". Every enforcement site calls it, so a restriction
-- cannot mean one thing for messages and another for reactions.
--
-- The first parameter is named p_user, not p_user_id, and that is not a
-- preference: a version of this function already exists in production (it was
-- created outside the migration history) and is referenced by a
-- restricted_users_no_write policy on each of messages, dm_messages and
-- group_messages. Postgres refuses CREATE OR REPLACE if an input parameter is
-- renamed, so keeping the name is what lets the expiry check below land on
-- those three live policies as a side effect of this migration. Renaming it
-- would need a DROP, which would break those policies for the length of the
-- migration and leave the gap invisible to anyone reading it later.
--
-- The body is the actual fix. The version in production is
--     where user_id = p_user and restriction = p_restriction
-- which never looks at expires_at, so every restriction on the live site is
-- permanent no matter what end date is stored against it. Adding the expiry
-- comparison is what makes "you cannot like or type for a week" true.
-- ---------------------------------------------------------------------------

create or replace function public.has_active_restriction(
  p_user uuid,
  p_restriction public.account_restriction
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_restrictions r
    where r.user_id = p_user
      and r.restriction = p_restriction
      and (r.expires_at is null or r.expires_at > now())
  );
$$;

grant execute on function public.has_active_restriction(uuid, public.account_restriction)
  to authenticated, service_role;

-- Applying a restriction with a duration. Separate from apply_restriction()
-- rather than an extra defaulted parameter, because "no expiry given" and
-- "make it permanent" are the same NULL to SQL but not to a caller: folding
-- them would let the old three-argument form silently strip the expiry off a
-- timed restriction.
create or replace function public.apply_restriction_temporary(
  p_user_id     uuid,
  p_restriction public.account_restriction,
  p_reason      text default null,
  p_expires_at  timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and (show_staff_badge or show_owner_badge)
  ) then
    raise exception 'Only staff members can apply restrictions';
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_user_id and show_owner_badge
  ) then
    raise exception 'Cannot restrict platform owners';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'No such user';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Restriction expiry must be in the future';
  end if;

  -- do update, not do nothing: re-applying is how a duration gets set or
  -- extended on a restriction that already exists.
  insert into public.account_restrictions (user_id, restriction, reason, applied_by, expires_at)
  values (p_user_id, p_restriction, p_reason, auth.uid(), p_expires_at)
  on conflict (user_id, restriction) do update
    set reason = excluded.reason,
        applied_by = excluded.applied_by,
        expires_at = excluded.expires_at;

  return p_expires_at;
end;
$$;

revoke all on function public.apply_restriction_temporary(uuid, public.account_restriction, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_restriction_temporary(uuid, public.account_restriction, text, timestamptz)
  to authenticated, service_role;

-- list_all_restrictions() gains expires_at. The return type changed, so the
-- old signature has to go before the new one can exist.
drop function if exists public.list_all_restrictions();

create or replace function public.list_all_restrictions()
returns table (
  user_id      uuid,
  restriction  text,
  reason       text,
  applied_by   uuid,
  created_at   timestamptz,
  username     text,
  display_name text,
  expires_at   timestamptz,
  active       boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and (show_staff_badge or show_owner_badge)
  ) then
    raise exception 'Only staff members can list restrictions';
  end if;

  return query
  select
    r.user_id,
    r.restriction::text,
    r.reason,
    r.applied_by,
    r.created_at,
    p.username,
    p.display_name,
    r.expires_at,
    (r.expires_at is null or r.expires_at > now())
  from public.account_restrictions r
  join public.profiles p on p.id = r.user_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_all_restrictions() from public, anon, authenticated;
grant execute on function public.list_all_restrictions() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enforcement at the data layer
--
-- Until now every restriction except the mascot path was enforced only in the
-- browser, which means "you cannot type for a week" was a UI string a modified
-- client walks straight past. These are the write policies for the two
-- capabilities the published wording names — sending (type) and reacting
-- (like) — and they are the reason a timed restriction is worth anything.
--
-- join_servers, send_friend_requests and create_groups are deliberately left
-- alone here: they are still client-side only, and widening this migration to
-- four more policies on the server-join and friendship paths is a separate
-- change with its own review.
--
-- The clause below is added to the *authorising* policy, which already proves
-- auth.uid() = author_id. That is the right place for it: the check is then
-- keyed on the authenticated user rather than on a value the client supplied.
-- ---------------------------------------------------------------------------

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    auth.uid() = author_id
    and channel_user_can_post(channel_id)
    and ((attachment_url is null) or (exists (
      select 1 from channels c
      where c.id = messages.channel_id and channel_user_can_attach(messages.channel_id)
    )))
    and ((lower(content) !~ '@(everyone|here)') or member_has_server_permission(
      (select c.server_id from channels c where c.id = messages.channel_id),
      auth.uid(), 'mention_everyone'))
    and not is_server_timed_out(
      (select c.server_id from channels c where c.id = messages.channel_id),
      auth.uid())
    and not public.has_active_restriction(auth.uid(), 'send_messages')
  );

drop policy if exists "dm_messages_insert" on public.dm_messages;
create policy "dm_messages_insert" on public.dm_messages for insert to authenticated
  with check (
    auth.uid() = author_id
    and not public.has_active_restriction(auth.uid(), 'send_messages')
    and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    )
  );

drop policy if exists "group_messages_insert" on public.group_messages;
create policy "group_messages_insert"
  on public.group_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and not public.has_active_restriction(auth.uid(), 'send_messages')
    and public.is_group_member(group_id)
  );

drop policy if exists "message_reactions_insert" on public.message_reactions;
create policy "message_reactions_insert" on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.has_active_restriction(auth.uid(), 'send_reactions')
    and public.can_view_message_reaction(context_type, message_id)
  );

-- The three restricted_users_no_write policies below already exist on the live
-- database, created outside the migration history. They are re-created here so
-- that a database rebuilt from these migrations is not weaker than the one
-- currently running. They stay in place rather than being replaced, because
-- removing a live policy is a security regression if anything above is ever
-- refactored away by mistake.
--
-- Note what they do NOT cover: message_reactions. "You cannot like for a week"
-- had no enforcement anywhere before this migration, which is why the reaction
-- check above is new work and not a duplicate.
--
-- Reproduced from the live definitions, and AS RESTRICTIVE.
--
-- "as restrictive" is load-bearing and not a detail. Postgres ORs together the
-- WITH CHECK of every *permissive* INSERT policy, so recreating these three
-- under their own names as permissive policies would have been a severe
-- regression: a policy that only asks "is this user restricted?" evaluates to
-- true for every unrestricted user, so it would have granted every
-- authenticated user the right to insert into any DM thread, any group, and
-- any channel — bypassing dm_messages_insert's membership check completely.
-- As restrictive policies they are ANDed onto the authorising policy instead,
-- which is what they were always for.
--
-- The COALESCE(author_id, auth.uid()) subject is left exactly as found: it
-- evaluates the client's own author_id first, which is not the identity the
-- restriction belongs to, but the authorising policies above independently
-- require auth.uid() = author_id, so the pair is safe. Correcting the subject is
-- a separate change from adding a feature.

drop policy if exists restricted_users_no_write on public.messages;
create policy restricted_users_no_write on public.messages
  as restrictive for insert to authenticated
  with check (not public.has_active_restriction(coalesce(author_id, auth.uid()), 'send_messages'));

drop policy if exists restricted_users_no_write on public.dm_messages;
create policy restricted_users_no_write on public.dm_messages
  as restrictive for insert to authenticated
  with check (not public.has_active_restriction(coalesce(author_id, auth.uid()), 'send_messages'));

drop policy if exists restricted_users_no_write on public.group_messages;
create policy restricted_users_no_write on public.group_messages
  as restrictive for insert to authenticated
  with check (not public.has_active_restriction(coalesce(author_id, auth.uid()), 'send_messages'));

-- ---------------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------------

create table if not exists public.official_broadcasts (
  id            uuid primary key default gen_random_uuid(),
  audience      text not null
    constraint official_broadcasts_audience_check check (audience in ('everyone', 'user')),
  target_user_id uuid references public.profiles (id) on delete set null,
  -- Kept even if the account is later deleted, so the audit trail still says
  -- who a notice was aimed at.
  target_username text,
  kind          text not null
    constraint official_broadcasts_kind_check check (kind in (
      'announcement', 'account_action', 'restriction', 'service_notice'
    )),
  title         text not null,
  body          text not null,
  link          text,
  send_email    boolean not null default false,
  origin        text not null default 'admin'
    constraint official_broadcasts_origin_check check (origin in ('admin', 'system', 'sentinel')),
  actor         uuid references public.profiles (id) on delete set null,
  recipient_count integer not null default 0,
  email_requested integer not null default 0,
  email_sent      integer not null default 0,
  email_failed    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists official_broadcasts_created_idx
  on public.official_broadcasts (created_at desc);

create table if not exists public.broadcast_deliveries (
  broadcast_id  uuid not null references public.official_broadcasts (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  notified_at   timestamptz,
  push_state    text not null default 'pending'
    constraint broadcast_deliveries_push_state_check check
      (push_state in ('pending', 'dispatched', 'failed')),
  push_attempts integer not null default 0,
  email_id      text,
  email_status  text,
  email_checked_at timestamptz,
  primary key (broadcast_id, user_id)
);

-- The dispatcher's claim query.
create index if not exists broadcast_deliveries_pending_idx
  on public.broadcast_deliveries (broadcast_id, user_id)
  where push_state = 'pending';

-- Per-recipient email outcome, for the bounce list.
create index if not exists broadcast_deliveries_email_idx
  on public.broadcast_deliveries (broadcast_id, email_status)
  where email_id is not null;

alter table public.official_broadcasts enable row level security;
alter table public.broadcast_deliveries enable row level security;

-- Service role only, and deliberately no policies: a participant who could
-- read the delivery table could see who was banned and who was not.
revoke all on public.official_broadcasts from public, anon, authenticated;
revoke all on public.broadcast_deliveries from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- broadcast_send
--
-- One code path for "everyone" and "one user": the recipient set is a CTE, so
-- a targeted send is the same statement with a filter that matches one row.
-- Both inserts are set-based. A per-recipient loop over ~9.5k rows inside one
-- transaction is the thing this deliberately avoids.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_send(
  p_audience      text,
  p_target_user_id uuid,
  p_kind          text,
  p_title         text,
  p_body          text,
  p_link          text default null,
  p_send_email    boolean default false,
  p_actor         uuid default null,
  p_origin        text default 'admin'
)
-- The OUT columns are deliberately not called broadcast_id/recipient_count:
-- those are real column names in the two tables this function writes, and a
-- plpgsql variable of the same name makes every reference to it ambiguous.
returns table (sent_broadcast_id uuid, sent_recipient_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_title   text;
  v_body    text;
  v_link    text;
  v_count   integer;
  v_official uuid := public.official_account_id();
begin
  if p_audience not in ('everyone', 'user') then
    raise exception 'audience must be everyone or user';
  end if;
  if p_kind not in ('announcement', 'account_action', 'restriction', 'service_notice') then
    raise exception 'unsupported broadcast kind %', p_kind;
  end if;
  if p_origin not in ('admin', 'system', 'sentinel') then
    raise exception 'unsupported origin %', p_origin;
  end if;

  v_title := left(coalesce(btrim(p_title), ''), 120);
  v_body  := left(coalesce(btrim(p_body), ''), 1000);

  if v_title = '' then raise exception 'A title is required'; end if;
  if v_body = '' then raise exception 'A body is required'; end if;

  if p_audience = 'user' then
    if p_target_user_id is null then
      raise exception 'A target user is required for a targeted broadcast';
    end if;
    -- Checked before the bot filter below, because @disband is itself a bot and
    -- would otherwise be reported as a missing user, which is both untrue and a
    -- confusing thing to tell someone who aimed a notice at the official
    -- account by mistake.
    if p_target_user_id = v_official then
      raise exception 'Cannot send an official notice to the official account';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = p_target_user_id and not coalesce(is_bot, false)
    ) then
      raise exception 'No such user';
    end if;
  end if;

  -- A link is rendered as a navigation target by the client, so anything that
  -- is not an in-app route or an https Disband URL is refused outright. This is
  -- what keeps a broadcast from being used to plant a javascript: URL in
  -- everyone's notification drawer.
  v_link := nullif(coalesce(btrim(p_link), ''), '');
  if v_link is not null and v_link !~ '^(/|channel:|dm:|group:|https://(www\.)?disband\.dev/)' then
    raise exception 'Link must be an in-app route or an https disband.dev URL';
  end if;

  insert into public.official_broadcasts (
    audience, target_user_id, target_username, kind, title, body, link,
    send_email, origin, actor
  )
  values (
    p_audience,
    p_target_user_id,
    (select p.username from public.profiles p where p.id = p_target_user_id),
    p_kind,
    v_title,
    v_body,
    v_link,
    coalesce(p_send_email, false),
    p_origin,
    p_actor
  )
  returning id into v_broadcast_id;

  with recipients as (
    select p.id as user_id
    from public.profiles p
    where not coalesce(p.is_bot, false)
      and p.id is distinct from v_official
      and (p_audience = 'everyone' or p.id = p_target_user_id)
  ), inserted as (
    insert into public.broadcast_deliveries (broadcast_id, user_id, notified_at)
    select v_broadcast_id, r.user_id, now() from recipients r
    returning user_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select i.user_id, 'official', v_title, v_body, v_link from inserted i;

  select count(*)::integer into v_count
  from public.broadcast_deliveries where broadcast_id = v_broadcast_id;

  update public.official_broadcasts
  set recipient_count = v_count,
      email_requested = case when coalesce(p_send_email, false) then v_count else 0 end
  where id = v_broadcast_id;

  return query select v_broadcast_id, v_count;
end;
$$;

revoke all on function public.broadcast_send(text, uuid, text, text, text, text, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.broadcast_send(text, uuid, text, text, text, text, boolean, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Push dispatch
--
-- Drains 'pending' deliveries in bounded batches. FOR UPDATE SKIP LOCKED so
-- two overlapping cron ticks cannot send the same push twice, and so a tick
-- that dies mid-batch leaves its rows claimable by the next one.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_dispatch_push(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatched integer := 0;
  r record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    p_limit := 250;
  end if;

  for r in
    select d.broadcast_id, d.user_id, b.title
    from public.broadcast_deliveries d
    join public.official_broadcasts b on b.id = d.broadcast_id
    where d.push_state = 'pending'
    order by d.broadcast_id, d.user_id
    for update of d skip locked
    limit p_limit
  loop
    begin
      -- The four-argument form, with an explicit source. notify_push takes
      -- p_source in production and the send-push function uses it to decide how
      -- the notification is presented, so an official notice is tagged 'official'
      -- rather than arriving as an unlabelled push.
      perform public.notify_push(r.user_id, 'Disband', left(r.title, 120), 'official');
      update public.broadcast_deliveries
      set push_state = 'dispatched', push_attempts = push_attempts + 1
      where broadcast_id = r.broadcast_id and user_id = r.user_id;
      v_dispatched := v_dispatched + 1;
    exception when others then
      -- One bad recipient must not abandon the rest of the batch.
      update public.broadcast_deliveries
      set push_state = 'failed', push_attempts = push_attempts + 1
      where broadcast_id = r.broadcast_id and user_id = r.user_id;
    end;
  end loop;

  return v_dispatched;
end;
$$;

revoke all on function public.broadcast_dispatch_push(integer)
  from public, anon, authenticated;
grant execute on function public.broadcast_dispatch_push(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Automatic notices
--
-- Every notice below is worded so it cannot be used against the person it is
-- sent to: no excerpt, no rule id, no category that would identify what was
-- matched, and never any imagery. A moderation notice tells someone that
-- something happened to their account and what to do next — it does not
-- describe the material that triggered it.
-- ---------------------------------------------------------------------------

create or replace function public.notify_official_of_moderation_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then return new; end if;

  -- quarantine_media records only the first owner, but that function suspends
  -- every owner through sentinel_suspend(), which writes its own
  -- suspend_user row per account. Notifying here as well would double-notify
  -- that one person.
  if new.action = 'suspend_user' then
    perform public.broadcast_send(
      'user', new.owner_id, 'account_action',
      'Your account has been suspended',
      'Your account has been suspended because it broke the Disband rules. '
      || 'If you think this is a mistake, reply to this notice or contact support.',
      null, false, null, 'sentinel'
    );
  elsif new.action = 'redact_text' then
    perform public.broadcast_send(
      'user', new.owner_id, 'account_action',
      'Some of your content was removed',
      'Content you posted did not meet the Disband rules and has been removed. '
      || 'Repeated removals can lead to your account being restricted.',
      null, false, null, 'sentinel'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_official_of_restriction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.account_restrictions%rowtype;
  v_ability text;
  v_until  text;
  v_expired boolean := false;
begin
  v_row := case when tg_op = 'INSERT' then new else old end;

  if v_row.user_id is null then return null; end if;
  if v_row.user_id = public.official_account_id() then return null; end if;

  v_ability := case v_row.restriction
    when 'send_messages' then 'send messages'
    when 'send_reactions' then 'react to messages'
    when 'join_servers' then 'join or create servers'
    when 'send_friend_requests' then 'send friend requests'
    when 'create_groups' then 'create group chats'
    else 'use parts of Disband'
  end;

  if tg_op = 'DELETE' then
    -- Distinguish "it ran out" from "a human lifted it": the wording should
    -- not tell someone a restriction was lifted early if it simply expired.
    v_expired := v_row.expires_at is not null and v_row.expires_at <= now();
    if v_expired then
      perform public.broadcast_send(
        'user', v_row.user_id, 'restriction',
        'Your restriction has ended',
        'You can ' || v_ability || ' again.',
        null, false, null, 'system'
      );
    else
      perform public.broadcast_send(
        'user', v_row.user_id, 'restriction',
        'Your restriction has been lifted',
        'You can ' || v_ability || ' again.',
        null, false, null, 'system'
      );
    end if;
    return null;
  end if;

  if v_row.expires_at is null then
    v_until := 'This has no end date.';
  else
    v_until := 'This lasts until ' ||
      to_char(v_row.expires_at at time zone 'UTC', 'FMDay, D FMMonth YYYY" at "HH24:MI" UTC"') || '.';
  end if;

  perform public.broadcast_send(
    'user', v_row.user_id, 'restriction',
    'Your account has been restricted',
    'You cannot ' || v_ability || ' on Disband. ' || v_until ||
    ' If you think this is a mistake, contact support.',
    null, false, null, 'system'
  );

  return null;
end;
$$;

drop trigger if exists official_moderation_notice on public.moderation_actions;
create trigger official_moderation_notice
  after insert on public.moderation_actions
  for each row execute function public.notify_official_of_moderation_action();

drop trigger if exists official_restriction_notice on public.account_restrictions;
create trigger official_restriction_notice
  after insert or delete on public.account_restrictions
  for each row execute function public.notify_official_of_restriction();

-- Expiry is already enforced by comparison, so this sweeper exists only to
-- tell the user their restriction lapsed. Deleting the row fires the trigger
-- above, which picks the "has ended" wording.
create or replace function public.expire_restrictions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.account_restrictions
    where expires_at is not null and expires_at <= now()
    returning user_id
  )
  select count(*)::integer into v_count from gone;

  return v_count;
end;
$$;

revoke all on function public.expire_restrictions() from public, anon, authenticated;
grant execute on function public.expire_restrictions() to service_role;

-- ---------------------------------------------------------------------------
-- Delivery reporting
--
-- Recipient emails are read here rather than from TypeScript because
-- auth.users is not reachable through PostgREST at all; the raffle reads its
-- winner's address the same way.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_recipient_emails(p_broadcast_id uuid)
returns table (user_id uuid, username text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, p.username, u.email
  from public.broadcast_deliveries d
  join public.profiles p on p.id = d.user_id
  left join auth.users u on u.id = d.user_id
  where d.broadcast_id = p_broadcast_id
  order by d.user_id
  limit 2000;
$$;

revoke all on function public.broadcast_recipient_emails(uuid) from public, anon, authenticated;
grant execute on function public.broadcast_recipient_emails(uuid) to service_role;

-- Counts, not per-recipient rows: the panel shows "9,412 of 9,412 reached",
-- it does not need a table of every recipient.
create or replace function public.broadcast_delivery_summary(p_broadcast_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'notified', (select count(*) from public.broadcast_deliveries
                  where broadcast_id = p_broadcast_id and notified_at is not null),
    'pushPending', (select count(*) from public.broadcast_deliveries
                    where broadcast_id = p_broadcast_id and push_state = 'pending'),
    'pushDispatched', (select count(*) from public.broadcast_deliveries
                       where broadcast_id = p_broadcast_id and push_state = 'dispatched'),
    'pushFailed', (select count(*) from public.broadcast_deliveries
                   where broadcast_id = p_broadcast_id and push_state = 'failed'),
    'emails', coalesce((
      select jsonb_object_agg(t.s, t.n)
      from (
        select coalesce(email_status, 'none') as s, count(*)::int as n
        from public.broadcast_deliveries
        where broadcast_id = p_broadcast_id
        group by 1
      ) t
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.broadcast_delivery_summary(uuid) from public, anon, authenticated;
grant execute on function public.broadcast_delivery_summary(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduling
--
-- Two jobs. Neither needs a secret or an HTTP hop: both are pure SQL, which is
-- why they run in the database rather than through /api/cron.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; broadcast push and restriction expiry must be run manually.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'broadcast-push-dispatch';
  perform cron.schedule('broadcast-push-dispatch', '*/2 * * * *',
    'select public.broadcast_dispatch_push(250);');

  perform cron.unschedule(jobid) from cron.job where jobname = 'restriction-expiry';
  -- Off the hour: the draw and sentinel jobs are already on the hour marks.
  perform cron.schedule('restriction-expiry', '41 * * * *',
    'select public.expire_restrictions();');
end
$$;

-- Matches the set at the top. If the migration is ever run by hand on a
-- reused session, a 5s lock_timeout left behind would silently turn the next
-- unrelated DDL statement into a confusing "could not obtain lock" error.
reset lock_timeout;
