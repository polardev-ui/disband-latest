-- A push now carries the conversation it is about, so a client already showing
-- that conversation can stay silent. Being interrupted by a banner for the
-- message you are watching arrive is pure noise.
--
-- `p_source` is defaulted, so any caller that does not pass one keeps working.
create or replace function public.notify_push(
  p_user_id uuid, p_title text, p_body text, p_source text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  if p_user_id is null then return; end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret'
   limit 1;

  perform net.http_post(
    url := 'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object(
      'user_id', p_user_id, 'title', p_title, 'body', p_body, 'source', p_source
    )
  );
exception when others then
  null;
end;
$$;

create or replace function public.on_dm_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient uuid; sender text;
begin
  select case when user_a = new.author_id then user_b else user_a end
    into recipient from public.dm_threads where id = new.thread_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  perform public.notify_push(recipient, sender,
    coalesce(nullif(new.content, ''), 'Sent an attachment'),
    new.thread_id::text);
  return new;
end; $$;

create or replace function public.on_group_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; sender text; rec record;
begin
  select name into gname from public.group_chats where id = new.group_id;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  for rec in select user_id from public.group_chat_members
             where group_id = new.group_id and user_id <> new.author_id loop
    perform public.notify_push(rec.user_id, gname,
      sender || ': ' || coalesce(nullif(new.content, ''), 'attachment'),
      new.group_id::text);
  end loop;
  return new;
end; $$;

create or replace function public.on_channel_mention_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender text; uid uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then return new; end if;
  select coalesce(display_name, username, 'Someone') into sender
    from public.profiles where id = new.author_id;
  foreach uid in array new.mentions loop
    if uid <> new.author_id then
      perform public.notify_push(uid, 'New mention', sender || ' mentioned you',
        new.channel_id::text);
    end if;
  end loop;
  return new;
end; $$;
