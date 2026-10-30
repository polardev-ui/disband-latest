-- ---------------------------------------------------------------------------
-- 0192: @disband tells people when a space is suspended or reinstated.
--
--   1. When a space's suspended_at goes from null to set, the owner and every
--      member get a DM from @disband in the read-only official thread
--      (0105/0106), plus an entry in their notifications. The owner's notice
--      says what the suspension means and how to dispute it; members are told
--      it is about the space, not them. When a suspension is lifted, both get
--      a short follow-up. A trigger rather than a change to each suspend path
--      covers Sentinel, managers and anything added later.
--   2. sentinel_suspend_server never touches the official Disband space.
--   3. Spam and slurs are no longer grounds to suspend a space, so Sentinel's
--      three suspensions for them are lifted first, before the trigger
--      exists: their owners were never told about the suspension, so a
--      "reinstated" notice would only confuse them.
--
-- The reason shown is servers.suspended_reason: Sentinel writes it for the
-- reader (content-sentinel SPACE_SUSPEND_REASONS); managers type their own.
-- Members who have blocked @disband are skipped, since the DM block guard
-- would otherwise abort the whole insert. A failure here is swallowed: the
-- suspension itself must always go through.
-- ---------------------------------------------------------------------------

update public.message_reports r
   set status = 'dismissed',
       decision = 'no_violation',
       action = 'Suspension lifted: spam and slurs are not grounds to suspend a space',
       reviewed_at = now()
  from public.servers s
 where s.id = r.target_id
   and r.target_type = 'server'
   and s.suspended_by is null
   and s.suspended_reason in ('Suspended by Disband Safety (spam).', 'Suspended by Disband Safety (hate speech).');

update public.servers
   set suspended_at = null, suspended_reason = null, suspended_by = null
 where suspended_by is null
   and suspended_reason in ('Suspended by Disband Safety (spam).', 'Suspended by Disband Safety (hate speech).');

create or replace function public.notify_space_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official uuid := public.official_account_id();
  v_suspended boolean;
  v_space text;
  v_reason text;
  v_owner_title text;
  v_owner_body text;
  v_member_title text;
  v_member_body text;
begin
  if v_official is null then return null; end if;
  if old.suspended_at is null and new.suspended_at is not null then
    v_suspended := true;
  elsif old.suspended_at is not null and new.suspended_at is null then
    v_suspended := false;
  else
    return null;
  end if;

  v_space := coalesce(nullif(btrim(new.name), ''), 'a space');
  v_reason := coalesce(nullif(btrim(new.suspended_reason), ''), 'It broke the Disband Terms of Service.');

  if v_suspended then
    v_owner_title := 'Your space has been suspended';
    v_owner_body :=
      '**' || v_space || '**, a space you own, has been suspended by Disband.' || E'\n\n' ||
      '**Reason:** ' || v_reason || E'\n\n' ||
      '**What this means**' || E'\n' ||
      '• The space is read-only. Nobody, including you, can post new messages.' || E'\n' ||
      '• It is hidden from Discover and no one new can join.' || E'\n' ||
      '• Nothing has been deleted. Members can still read existing channels.' || E'\n\n' ||
      'Disband can suspend spaces under sections 7 and 8 of the Terms of Service (disband.dev/terms). ' ||
      'If you think this is a mistake, contact us at disband.dev/support and include the name of the space. ' ||
      'Serious or repeated violations can lead to the space being removed and to action on your account.';
    v_member_title := 'A space you''re in has been suspended';
    v_member_body :=
      '**' || v_space || '**, a space you''re a member of, has been suspended by Disband.' || E'\n\n' ||
      '**Reason:** ' || v_reason || E'\n\n' ||
      'This is a decision about the space, not about you. No action has been taken against your account ' ||
      'and you don''t need to do anything.' || E'\n\n' ||
      'While it''s suspended the space is read-only: you can still read what''s there, but nobody can post, ' ||
      'and it won''t appear in Discover. If the suspension is lifted, it will work as before. ' ||
      'You can leave the space at any time. Questions? Visit disband.dev/support.';
  else
    v_owner_title := 'Your space has been reinstated';
    v_owner_body :=
      'The suspension on **' || v_space || '** has been lifted. Members can post and new people can join again.' ||
      E'\n\n' || 'Suspension removed it from Discover. If you want it listed again, switch Discover back on in the space''s settings.';
    v_member_title := 'A space you''re in has been reinstated';
    v_member_body :=
      'The suspension on **' || v_space || '**, a space you''re a member of, has been lifted. ' ||
      'You can post there again as normal.';
  end if;

  begin
    with recipients as (
      select r.user_id, r.user_id = new.owner_id as is_owner
      from (
        select m.user_id from public.server_members m where m.server_id = new.id
        union
        select new.owner_id
      ) r
      join public.profiles p on p.id = r.user_id
      where r.user_id is not null
        and not coalesce(p.is_bot, false)
        and r.user_id <> v_official
        and not public.is_blocked_between(v_official, r.user_id)
    ), touched as (
      insert into public.dm_threads (user_a, user_b)
      select least(r.user_id, v_official), greatest(r.user_id, v_official)
      from recipients r
      on conflict (user_a, user_b) do nothing
      returning id, user_a, user_b
    ), threads as (
      select t.id, r.is_owner
      from (
        select id, user_a, user_b from touched
        union
        select t.id, t.user_a, t.user_b
        from public.dm_threads t
        join recipients r
          on t.user_a = least(r.user_id, v_official)
         and t.user_b = greatest(r.user_id, v_official)
      ) t
      join recipients r
        on r.user_id = case when t.user_a = v_official then t.user_b else t.user_a end
    )
    insert into public.dm_messages (thread_id, author_id, content)
    select th.id, v_official,
           case when th.is_owner then v_owner_title || E'\n\n' || v_owner_body
                else v_member_title || E'\n\n' || v_member_body end
    from threads th;

    insert into public.notifications (user_id, type, title, body, link)
    select r.user_id, 'official',
           case when r.user_id = new.owner_id then v_owner_title else v_member_title end,
           case when r.user_id = new.owner_id then v_owner_body else v_member_body end,
           null
    from (
      select m.user_id from public.server_members m where m.server_id = new.id
      union
      select new.owner_id
    ) r
    join public.profiles p on p.id = r.user_id
    where r.user_id is not null
      and not coalesce(p.is_bot, false)
      and r.user_id <> v_official
      and not public.is_blocked_between(v_official, r.user_id);
  exception when others then
    raise warning 'space suspension notice failed for %: %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.notify_space_suspension() from public, anon, authenticated;

drop trigger if exists trg_notify_space_suspension on public.servers;
create trigger trg_notify_space_suspension
  after update of suspended_at on public.servers
  for each row execute function public.notify_space_suspension();

create or replace function public.sentinel_suspend_server(p_server uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.servers
     set suspended_at = now(),
         suspended_reason = left(coalesce(nullif(trim(p_reason), ''), 'Disband Safety'), 500),
         suspended_by = null,
         discoverable = false
   where id = p_server
     and suspended_at is null
     and lower(coalesce(vanity_code, '')) <> 'disband';
  return found;
end;
$$;
