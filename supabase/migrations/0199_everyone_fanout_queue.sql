-- ---------------------------------------------------------------------------
-- 0199: @everyone no longer times out in big spaces.
--
-- notify_mentions and on_channel_mention_push expanded @everyone to every
-- member inside the message INSERT: in a 13,800-member space that was 13,800
-- one-row notification inserts (each with its own membership check) and
-- 13,800 push requests, each decrypting the vault secret. The send hit the
-- statement timeout and was rolled back, so people pressed resend until a
-- run happened to squeeze under it.
--
-- Now the send only notifies people mentioned by name (at most 10) and
-- queues one mention_fanout row. process_mention_fanout(), run by pg_cron
-- every 10 seconds, walks the space's members in keyset pages of 2,000 with
-- one set-based insert per page, and pushes only to members who have a
-- device registered. Members named directly are skipped there so nobody is
-- notified twice.
-- ---------------------------------------------------------------------------

create table if not exists public.mention_fanout (
  id          bigint generated always as identity primary key,
  message_id  uuid not null,
  channel_id  uuid not null,
  server_id   uuid not null,
  author_id   uuid not null,
  author_name text not null,
  body        text not null,
  -- Already notified inline: the people mentioned by name.
  skip_ids    uuid[] not null default '{}',
  -- Keyset position in server_members (user_id order).
  after_user  uuid,
  created_at  timestamptz not null default now()
);

alter table public.mention_fanout enable row level security;
revoke all on public.mention_fanout from anon, authenticated;
grant all on public.mention_fanout to service_role;

create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  v_server uuid;
  v_named uuid[];
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  select server_id into v_server from public.channels where id = new.channel_id;
  if v_server is null then
    return new;
  end if;

  -- People mentioned by name who are members. Capped at 10 by enforce_mention_rate.
  select coalesce(array_agg(distinct sm.user_id), '{}') into v_named
  from public.server_members sm
  where sm.server_id = v_server
    and sm.user_id = any (coalesce(new.mentions, '{}'::uuid[]))
    and sm.user_id <> new.author_id;

  insert into public.notifications (user_id, type, title, body, link)
  select u, 'mention', author_name || ' mentioned you', left(new.content, 200), 'channel:' || new.channel_id::text
  from unnest(v_named) u;

  if new.content ~* '@everyone\y' then
    insert into public.mention_fanout (message_id, channel_id, server_id, author_id, author_name, body, skip_ids)
    values (new.id, new.channel_id, v_server, new.author_id, author_name, left(new.content, 200), v_named);
  end if;
  return new;
end;
$$;

create or replace function public.on_channel_mention_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
  sender text;
  uid uuid;
begin
  select server_id into v_server from public.channels where id = new.channel_id;
  if v_server is null or coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;

  -- Named mentions only; @everyone is pushed by process_mention_fanout().
  for uid in
    select distinct m from unnest(new.mentions) m
    where m <> new.author_id
      and exists (select 1 from public.device_tokens d where d.user_id = m)
  loop
    perform public.notify_push(uid, 'New mention', sender || ' mentioned you', new.channel_id::text);
  end loop;
  return new;
end;
$$;

create or replace function public.process_mention_fanout(p_page integer default 2000, p_pages integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  q public.mention_fanout%rowtype;
  v_last uuid;
  v_done integer := 0;
  v_secret text;
  v_ids uuid[];
  uid uuid;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;

  while v_done < p_pages loop
    select * into q from public.mention_fanout order by id limit 1 for update skip locked;
    exit when not found;

    -- The message was deleted before we got to it: nothing to announce.
    if not exists (select 1 from public.messages where id = q.message_id) then
      delete from public.mention_fanout where id = q.id;
      continue;
    end if;

    select coalesce(array_agg(user_id order by user_id), '{}') into v_ids
    from (
      select sm.user_id
      from public.server_members sm
      where sm.server_id = q.server_id
        and (q.after_user is null or sm.user_id > q.after_user)
      order by sm.user_id
      limit p_page
    ) page;

    if coalesce(array_length(v_ids, 1), 0) = 0 then
      delete from public.mention_fanout where id = q.id;
      continue;
    end if;
    v_last := v_ids[array_length(v_ids, 1)];

    insert into public.notifications (user_id, type, title, body, link)
    select u, 'mention', q.author_name || ' mentioned you', q.body, 'channel:' || q.channel_id::text
    from unnest(v_ids) u
    where u <> q.author_id and not (u = any (q.skip_ids));

    for uid in
      select distinct d.user_id from public.device_tokens d
      where d.user_id = any (v_ids) and d.user_id <> q.author_id and not (d.user_id = any (q.skip_ids))
    loop
      begin
        perform net.http_post(
          url := 'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/send-push',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
          body := jsonb_build_object('user_id', uid, 'title', 'New mention',
                                     'body', q.author_name || ' mentioned you', 'source', q.channel_id::text)
        );
      exception when others then
        null;
      end;
    end loop;

    if array_length(v_ids, 1) < p_page then
      delete from public.mention_fanout where id = q.id;
    else
      update public.mention_fanout set after_user = v_last where id = q.id;
    end if;
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.process_mention_fanout(integer, integer) from public, anon, authenticated;

select cron.unschedule('mention-fanout') where exists (select 1 from cron.job where jobname = 'mention-fanout');
select cron.schedule('mention-fanout', '10 seconds', 'select public.process_mention_fanout(2000, 10);');
