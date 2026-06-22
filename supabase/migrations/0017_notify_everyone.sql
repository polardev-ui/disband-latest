-- Expand @everyone in channel messages to notify all server members.

create or replace function public.notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  author_name text;
  mentioned uuid[];
begin
  select coalesce(display_name, username, 'Someone') into author_name
  from public.profiles where id = new.author_id;

  mentioned := coalesce(new.mentions, array[]::uuid[]);

  if new.content ~* '@everyone\b' then
    select coalesce(array_agg(distinct member_id), array[]::uuid[]) into mentioned
    from (
      select unnest(mentioned) as member_id
      union
      select sm.user_id
      from public.server_members sm
      join public.channels c on c.server_id = sm.server_id
      where c.id = new.channel_id
        and sm.user_id <> new.author_id
    ) expanded;
  end if;

  foreach uid in array mentioned loop
    if uid is not null and uid <> new.author_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        uid,
        'mention',
        author_name || ' mentioned you',
        left(new.content, 200),
        'channel:' || new.channel_id::text
      );
    end if;
  end loop;
  return new;
end;
$$;
