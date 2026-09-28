-- ---------------------------------------------------------------------------
-- 0105: Official broadcasts also land as a DM from @disband
--
-- A broadcast used to fan out as a notification only (bell + push + optional
-- email). Recipients therefore saw a ping but no conversation: nothing sat at
-- the top of their DM list, and there was no thread to open. The notice now
-- ALSO arrives as a real DM from the official account, in a thread the
-- recipient already has with @disband or one created for them.
--
-- Why this works where a normal bot DM cannot: get_or_create_dm_thread
-- demands friendship and rejects bots, but broadcast_send runs as a security
-- definer and writes the thread/message rows directly, membership-checked by
-- construction (least/greatest ordering satisfies dm_threads' user_a < user_b
-- check, and the recipient set is the same human-only CTE as the
-- notification fanout). Threads are upserted set-based on the
-- (user_a, user_b) unique pair, so a repeat notice reuses the thread instead
-- of opening a second one.
--
-- @disband is also flagged bot_dm_enabled so the thread is openable through
-- the normal RPC path too (0102's gate), and so a recipient's reply — which
-- the membership-based dm_messages_insert policy permits — lands somewhere
-- the owner can actually read from the @disband session. Nothing auto-answers.
--
-- The column add is repeated from 0102 on purpose: this migration must stand
-- alone wherever 0102 never ran, and `if not exists` makes the repeat free.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists bot_dm_enabled boolean not null default false;

update public.profiles
  set bot_dm_enabled = true
  where username = 'disband' and coalesce(is_bot, false) = true;

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
-- See 0100 for why the OUT columns are not called broadcast_id/recipient_count.
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

  -- The same recipient set, as DM threads with the official account. New
  -- pairs are inserted; existing pairs are matched back, so a second notice
  -- adds a message to the old thread instead of opening a new one.
  with recipients as (
    select p.id as user_id
    from public.profiles p
    where not coalesce(p.is_bot, false)
      and p.id is distinct from v_official
      and (p_audience = 'everyone' or p.id = p_target_user_id)
  ), touched as (
    insert into public.dm_threads (user_a, user_b)
    select least(r.user_id, v_official), greatest(r.user_id, v_official)
    from recipients r
    on conflict (user_a, user_b) do nothing
    returning id
  ), threads as (
    select id from touched
    union
    select t.id
    from public.dm_threads t
    join recipients r
      on t.user_a = least(r.user_id, v_official)
     and t.user_b = greatest(r.user_id, v_official)
  )
  insert into public.dm_messages (thread_id, author_id, content)
  select th.id, v_official, v_title || E'\n\n' || v_body from threads th;

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
