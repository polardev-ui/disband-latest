-- 0092_mention_rate.sql
-- Rate limits for pinging accounts via chat (@user mentions + @everyone).
--
-- Agreed limits:
--   - max 10 mentioned users per message
--   - 10 mention-messages per minute per author
--   - 50 mention-messages per hour per author
--   - @everyone 2 per 10 minutes per author
--
-- Applies to all three message tables (messages, dm_messages,
-- group_messages), which share (author_id, content, mentions, created_at).
-- Violations raise P0001 so the client surfaces the existing
-- "slow down" error path.

create index if not exists messages_author_created_idx
  on public.messages (author_id, created_at desc);
create index if not exists dm_messages_author_created_idx
  on public.dm_messages (author_id, created_at desc);
create index if not exists group_messages_author_created_idx
  on public.group_messages (author_id, created_at desc);

create or replace function public.enforce_mention_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentions uuid[] := coalesce(new.mentions, array[]::uuid[]);
  v_count integer;
  v_everyone boolean := new.content ~* '@everyone';
begin
  if coalesce(array_length(v_mentions, 1), 0) = 0 and not v_everyone then
    return new;
  end if;

  if coalesce(array_length(v_mentions, 1), 0) > 10 then
    raise exception 'Too many mentions in one message (max 10).' using errcode = 'P0001';
  end if;

  -- Per-minute: messages carrying any ping from this author.
  execute format(
    'select count(*) from public.%I where author_id = $1 and created_at > now() - interval ''1 minute'' and (coalesce(array_length(mentions, 1), 0) > 0 or content ~* ''@everyone'')',
    tg_table_name
  ) into v_count using new.author_id;
  if v_count >= 10 then
    raise exception 'You are pinging people too quickly. Slow down.' using errcode = 'P0001';
  end if;

  -- Per-hour.
  execute format(
    'select count(*) from public.%I where author_id = $1 and created_at > now() - interval ''1 hour'' and (coalesce(array_length(mentions, 1), 0) > 0 or content ~* ''@everyone'')',
    tg_table_name
  ) into v_count using new.author_id;
  if v_count >= 50 then
    raise exception 'Mention limit reached. Try again later.' using errcode = 'P0001';
  end if;

  -- @everyone is far louder: 2 per 10 minutes.
  if v_everyone then
    execute format(
      'select count(*) from public.%I where author_id = $1 and created_at > now() - interval ''10 minutes'' and content ~* ''@everyone''',
      tg_table_name
    ) into v_count using new.author_id;
    if v_count >= 2 then
      raise exception '@everyone is rate limited. Try again in a few minutes.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists mention_rate_limit on public.messages;
create trigger mention_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_mention_rate();

drop trigger if exists dm_mention_rate_limit on public.dm_messages;
create trigger dm_mention_rate_limit
  before insert on public.dm_messages
  for each row execute function public.enforce_mention_rate();

drop trigger if exists group_mention_rate_limit on public.group_messages;
create trigger group_mention_rate_limit
  before insert on public.group_messages
  for each row execute function public.enforce_mention_rate();
