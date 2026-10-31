-- ---------------------------------------------------------------------------
-- 0196: check every uploaded image and video seconds after it is sent.
--
-- Until now media was only looked at by the 5-hourly sweep, and with no
-- classifier configured that sweep could only compare files against the
-- known-hash list. A space posted 54 videos into a channel named "cp" and
-- they sat there for seven weeks.
--
-- Now, the moment a row that carries a Disband CDN file is saved (a message,
-- DM or group message attachment, an avatar or banner, a space or group
-- icon, a custom emoji, a media post), this asks content-sentinel to `scan`
-- just those files. Sentinel hashes them, runs the classifier (Sightengine:
-- nudity, face age and gore, for images and short videos) and, if a file
-- looks illegal, preserves it in quarantine, removes it everywhere it is
-- used and holds the account. See supabase/functions/content-sentinel.
--
-- pg_net queues the request and returns at once, so sending a message never
-- waits on the scan, and a failure to queue never blocks the save.
-- Only URLs that are new on this row are sent: editing a message's text does
-- not re-scan its attachment.
-- ---------------------------------------------------------------------------

create or replace function public.sentinel_scan_new_media()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old text := case when tg_op = 'UPDATE' then to_jsonb(old)::text else '' end;
  v_urls text[];
begin
  select array_agg(distinct u) into v_urls
  from (
    select v_new ->> c as u
    from unnest(array['attachment_url', 'avatar_url', 'banner_url', 'icon_url', 'url', 'asset_url']) as c
    union all
    select a ->> 'url'
    from jsonb_array_elements(
      case when jsonb_typeof(v_new -> 'attachments') = 'array' then v_new -> 'attachments' else '[]'::jsonb end
    ) as a
  ) x
  where u like 'https://cdn.disband.dev/v1/images/%'
    and strpos(v_old, u) = 0;

  if v_urls is null then
    return null;
  end if;

  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
    ),
    body := jsonb_build_object('trigger', 'upload', 'mode', 'scan', 'urls', to_jsonb(v_urls[1:10])),
    timeout_milliseconds := 120000
  );
  return null;
exception when others then
  raise warning 'sentinel scan not queued: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.sentinel_scan_new_media() from public, anon, authenticated;

drop trigger if exists trg_sentinel_scan_media on public.messages;
create trigger trg_sentinel_scan_media
  after insert or update of attachment_url, attachments on public.messages
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.dm_messages;
create trigger trg_sentinel_scan_media
  after insert or update of attachment_url, attachments on public.dm_messages
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.group_messages;
create trigger trg_sentinel_scan_media
  after insert or update of attachment_url, attachments on public.group_messages
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.profiles;
create trigger trg_sentinel_scan_media
  after insert or update of avatar_url, banner_url on public.profiles
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.servers;
create trigger trg_sentinel_scan_media
  after insert or update of icon_url, banner_url on public.servers
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.group_chats;
create trigger trg_sentinel_scan_media
  after insert or update of icon_url on public.group_chats
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.custom_emoji;
create trigger trg_sentinel_scan_media
  after insert or update of url on public.custom_emoji
  for each row execute function public.sentinel_scan_new_media();

drop trigger if exists trg_sentinel_scan_media on public.media_posts;
create trigger trg_sentinel_scan_media
  after insert or update of asset_url on public.media_posts
  for each row execute function public.sentinel_scan_new_media();
