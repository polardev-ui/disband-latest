-- 0090_content_safety.sql
-- Disband Sentinel: automated detection and removal of illegal content
-- (CSAM, gore, bestiality) across every surface a user can put content on.
--
-- WHAT THIS IS
--   * One definition of "all user media" and "all user text" (the two views
--     below), used by both the scanner and the enforcement path so they can
--     never drift apart.
--   * A hash denylist, checked at upload time by the CDN Worker and again by
--     the sweep, so known material is refused outright.
--   * Enforcement that is a single transaction: redact every reference,
--     suspend the uploader, record the action, and record an evidence row.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * It does not delete the bytes on a confirmed CSAM hit. US providers must
--     report apparent CSAM to NCMEC and then PRESERVE it for 90 days
--     (18 U.S.C. § 2258A(h)). Deleting on sight destroys evidence and breaks
--     that duty. The object is moved out of public reach into `quarantine/`
--     in R2 and `moderation_evidence.preserved_until` is set 90 days out; a
--     trigger refuses early deletion of that row.
--   * It does not put imagery in reports or notifications. Reports carry ids,
--     hashes and counts only — emailing the material would distribute it.
--
-- Everything here is service-role only: RLS is on with no policies, and
-- execute is revoked from anon/authenticated. Nothing is reachable from a
-- client session.

-- ---------------------------------------------------------------------------
-- 1. Known-bad hashes. Seeded from takedowns and (once registered) NCMEC.
-- ---------------------------------------------------------------------------
create table if not exists public.banned_media_hashes (
  sha256      text primary key,
  category    text not null default 'csam'
    constraint banned_media_hashes_category_check
    check (category in ('csam', 'gore', 'bestiality', 'other')),
  source      text not null default 'manual',
  notes       text,
  added_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Every media reference on the platform, in one place.
--
-- Adding a new surface that can hold an image or video means adding it here;
-- the scanner picks it up with no further changes.
-- ---------------------------------------------------------------------------
create or replace view public.safety_media_refs
with (security_invoker = true) as
  select 'profiles'::text as src_table, 'avatar_url'::text as src_column,
         p.id::text as src_id, p.id as owner_id, p.avatar_url as url
    from public.profiles p where p.avatar_url is not null
  union all
  select 'profiles', 'banner_url', p.id::text, p.id, p.banner_url
    from public.profiles p where p.banner_url is not null
  union all
  select 'servers', 'icon_url', s.id::text, s.owner_id, s.icon_url
    from public.servers s where s.icon_url is not null
  union all
  select 'servers', 'banner_url', s.id::text, s.owner_id, s.banner_url
    from public.servers s where s.banner_url is not null
  union all
  select 'group_chats', 'icon_url', g.id::text, g.owner_id, g.icon_url
    from public.group_chats g where g.icon_url is not null
  union all
  select 'messages', 'attachment_url', m.id::text, m.author_id, m.attachment_url
    from public.messages m where m.attachment_url is not null
  union all
  select 'dm_messages', 'attachment_url', m.id::text, m.author_id, m.attachment_url
    from public.dm_messages m where m.attachment_url is not null
  union all
  select 'group_messages', 'attachment_url', m.id::text, m.author_id, m.attachment_url
    from public.group_messages m where m.attachment_url is not null
  union all
  select 'notes', 'attachment_url', n.id::text, n.user_id, n.attachment_url
    from public.notes n where n.attachment_url is not null
  union all
  select 'custom_emoji', 'url', e.id::text, e.uploader_id, e.url
    from public.custom_emoji e where e.url is not null
  union all
  select 'bots', 'avatar_url', b.id::text, b.owner_id, b.avatar_url
    from public.bots b where b.avatar_url is not null
  union all
  select 'media_posts', 'asset_url', mp.id::text, mp.user_id, mp.asset_url
    from public.media_posts mp where mp.asset_url is not null;

-- ---------------------------------------------------------------------------
-- 3. Every free-text surface, same idea. Names and descriptions are included
--    because the seized space advertised itself in its own description.
--
--    Bodies are truncated in SQL. The scanner only reads the first 4000
--    characters anyway, and fetching whole message bodies — some of them
--    megabytes — exhausted the edge function's memory and killed the sweep.
-- ---------------------------------------------------------------------------
create or replace view public.safety_text_refs
with (security_invoker = true) as
  select 'profiles'::text as src_table, 'username'::text as src_column,
         p.id::text as src_id, p.id as owner_id, left(p.username, 4000) as body,
         p.updated_at as changed_at
    from public.profiles p where p.username is not null
  union all
  select 'profiles', 'display_name', p.id::text, p.id, left(p.display_name, 4000), p.updated_at
    from public.profiles p where p.display_name is not null
  union all
  select 'profiles', 'bio', p.id::text, p.id, left(p.bio, 4000), p.updated_at
    from public.profiles p where p.bio is not null
  union all
  select 'profiles', 'status_note', p.id::text, p.id, left(p.status_note, 4000), p.updated_at
    from public.profiles p where p.status_note is not null
  union all
  select 'servers', 'name', s.id::text, s.owner_id, left(s.name, 4000), s.created_at
    from public.servers s
  union all
  select 'servers', 'description', s.id::text, s.owner_id, left(s.description, 4000), s.created_at
    from public.servers s where s.description is not null
  union all
  select 'channels', 'name', c.id::text, sv.owner_id, left(c.name, 4000), c.created_at
    from public.channels c join public.servers sv on sv.id = c.server_id
  union all
  select 'group_chats', 'name', g.id::text, g.owner_id, left(g.name, 4000), g.created_at
    from public.group_chats g
  union all
  select 'custom_emoji', 'name', e.id::text, e.uploader_id, left(e.name, 4000), e.created_at
    from public.custom_emoji e
  union all
  select 'messages', 'content', m.id::text, m.author_id, left(m.content, 4000), m.created_at
    from public.messages m where m.content <> ''
  union all
  select 'dm_messages', 'content', m.id::text, m.author_id, left(m.content, 4000), m.created_at
    from public.dm_messages m where m.content <> ''
  union all
  select 'group_messages', 'content', m.id::text, m.author_id, left(m.content, 4000), m.created_at
    from public.group_messages m where m.content <> ''
  union all
  select 'notes', 'content', n.id::text, n.user_id, left(n.content, 4000), n.created_at
    from public.notes n where n.content <> '';

-- ---------------------------------------------------------------------------
-- 4. Scan bookkeeping.
-- ---------------------------------------------------------------------------
create table if not exists public.media_assets (
  url           text primary key,
  storage_key   text,
  owner_id      uuid references public.profiles (id) on delete set null,
  sha256        text,
  bytes         bigint,
  content_type  text,
  scan_state    text not null default 'pending'
    constraint media_assets_state_check
    check (scan_state in ('pending', 'clean', 'flagged', 'blocked', 'error', 'skipped')),
  provider      text,
  verdict       jsonb,
  first_seen_at timestamptz not null default now(),
  scanned_at    timestamptz,
  attempts      int not null default 0
);

create index if not exists media_assets_state_idx on public.media_assets (scan_state, scanned_at);
create index if not exists media_assets_sha_idx on public.media_assets (sha256) where sha256 is not null;

create table if not exists public.content_flags (
  id           uuid primary key default gen_random_uuid(),
  src_table    text not null,
  src_column   text not null,
  src_id       text not null,
  owner_id     uuid references public.profiles (id) on delete set null,
  category     text not null,
  severity     text not null
    constraint content_flags_severity_check check (severity in ('block', 'review')),
  rule_id      text not null,
  -- A short redacted excerpt for the audit trail. Never the media itself.
  excerpt      text,
  state        text not null default 'open'
    constraint content_flags_state_check check (state in ('open', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now()
);

create index if not exists content_flags_state_idx on public.content_flags (state, created_at desc);
create unique index if not exists content_flags_unique
  on public.content_flags (src_table, src_column, src_id, rule_id);

create table if not exists public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  src_table   text,
  src_id      text,
  owner_id    uuid references public.profiles (id) on delete set null,
  category    text,
  reason      text,
  detail      jsonb,
  actor       text not null default 'sentinel',
  created_at  timestamptz not null default now()
);

create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_owner_idx on public.moderation_actions (owner_id);

-- Preserved material. The row (and the object it points at) must survive
-- until `preserved_until`; see the trigger below.
create table if not exists public.moderation_evidence (
  id              uuid primary key default gen_random_uuid(),
  sha256          text,
  quarantine_key  text,
  original_url    text,
  owner_id        uuid references public.profiles (id) on delete set null,
  category        text not null,
  preserved_until timestamptz not null default (now() + interval '90 days'),
  ncmec_report_id text,
  reported_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists moderation_evidence_pending_idx
  on public.moderation_evidence (reported_at) where reported_at is null;

create or replace function public.protect_evidence_retention()
returns trigger
language plpgsql
as $$
begin
  if old.preserved_until > now() then
    raise exception
      'Evidence % is under a legal preservation hold until %; it cannot be deleted yet.',
      old.id, old.preserved_until;
  end if;
  return old;
end;
$$;

drop trigger if exists moderation_evidence_retention on public.moderation_evidence;
create trigger moderation_evidence_retention
  before delete on public.moderation_evidence
  for each row execute function public.protect_evidence_retention();

create table if not exists public.safety_runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  media_scanned  int not null default 0,
  text_scanned   int not null default 0,
  flags_opened   int not null default 0,
  actions_taken  int not null default 0,
  accounts_held  int not null default 0,
  status         text not null default 'running'
    constraint safety_runs_status_check check (status in ('running', 'ok', 'error')),
  error          text,
  report_sent_at timestamptz
);

create index if not exists safety_runs_started_idx on public.safety_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- 5. Lock everything down. Service role bypasses RLS; nobody else gets in.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['banned_media_hashes', 'media_assets', 'content_flags',
                           'moderation_actions', 'moderation_evidence', 'safety_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end
$$;

revoke all on public.safety_media_refs from public, anon, authenticated;
revoke all on public.safety_text_refs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Enforcement.
-- ---------------------------------------------------------------------------

-- Suspend an account platform-wide. `is_platform_banned()` already gates
-- every RLS policy, so this takes effect on their next request everywhere.
create or replace function public.sentinel_suspend(p_user uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new boolean := false;
begin
  if p_user is null then return false; end if;

  insert into public.platform_bans (user_id, banned_by, reason)
  values (p_user, null, coalesce(p_reason, 'Automated safety enforcement'))
  on conflict (user_id) do nothing;
  get diagnostics v_new = row_count;

  if v_new then
    insert into public.moderation_actions (action, src_table, src_id, owner_id, reason)
    values ('suspend_user', 'profiles', p_user::text, p_user, p_reason);
  end if;
  return v_new;
end;
$$;

/**
 Remove every reference to one media URL, everywhere, and hold the uploader.

 Runs as one statement set: if any part fails the whole thing rolls back
 rather than leaving the content half-removed.
 */
create or replace function public.sentinel_quarantine_media(
  p_url            text,
  p_category       text,
  p_reason         text,
  p_sha256         text default null,
  p_quarantine_key text default null,
  p_suspend        boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owners uuid[];
  v_removed int := 0;
  v_n int;
  v_held int := 0;
  v_owner uuid;
  v_evidence uuid;
begin
  select array_agg(distinct owner_id) into v_owners
  from public.safety_media_refs where url = p_url and owner_id is not null;

  -- Profile and space art: blank the column.
  update public.profiles set avatar_url = null where avatar_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;
  update public.profiles set banner_url = null where banner_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;
  update public.servers set icon_url = null where icon_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;
  update public.servers set banner_url = null where banner_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;
  update public.group_chats set icon_url = null where icon_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;
  update public.bots set avatar_url = null where avatar_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  -- Messages: drop the attachment and leave a tombstone in place of the row,
  -- so a conversation doesn't silently lose its shape.
  update public.messages
     set attachment_url = null, attachment_name = null, attachment_type = null,
         content = case when content = '' then '[removed by Disband Safety]' else content end
   where attachment_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  update public.dm_messages
     set attachment_url = null, attachment_name = null, attachment_type = null,
         content = case when content = '' then '[removed by Disband Safety]' else content end
   where attachment_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  update public.group_messages
     set attachment_url = null, attachment_name = null, attachment_type = null,
         content = case when content = '' then '[removed by Disband Safety]' else content end
   where attachment_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  update public.notes
     set attachment_url = null, attachment_name = null, attachment_type = null
   where attachment_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  delete from public.custom_emoji where url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  delete from public.media_posts where asset_url = p_url;
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  -- Never serve it again, even if someone re-uploads the same bytes.
  if p_sha256 is not null then
    insert into public.banned_media_hashes (sha256, category, source, notes)
    values (p_sha256, p_category, 'sentinel', p_reason)
    on conflict (sha256) do nothing;
  end if;

  insert into public.moderation_evidence
    (sha256, quarantine_key, original_url, owner_id, category)
  values (p_sha256, p_quarantine_key, p_url, v_owners[1], p_category)
  returning id into v_evidence;

  insert into public.media_assets (url, sha256, scan_state, scanned_at)
  values (p_url, p_sha256, 'blocked', now())
  on conflict (url) do update
    set scan_state = 'blocked', sha256 = coalesce(excluded.sha256, media_assets.sha256),
        scanned_at = now();

  insert into public.moderation_actions
    (action, src_table, src_id, owner_id, category, reason, detail)
  values ('quarantine_media', 'media', p_url, v_owners[1], p_category, p_reason,
          jsonb_build_object('references_removed', v_removed, 'evidence_id', v_evidence));

  if p_suspend then
    foreach v_owner in array coalesce(v_owners, array[]::uuid[]) loop
      if public.sentinel_suspend(v_owner, format('Uploaded prohibited content (%s)', p_category)) then
        v_held := v_held + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'references_removed', v_removed,
    'accounts_held', v_held,
    'owners', to_jsonb(coalesce(v_owners, array[]::uuid[])),
    'evidence_id', v_evidence
  );
end;
$$;

-- Redact one offending text field and record why.
create or replace function public.sentinel_redact_text(
  p_table    text,
  p_column   text,
  p_id       text,
  p_category text,
  p_reason   text,
  p_suspend  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_held boolean := false;
  v_placeholder constant text := '[removed by Disband Safety]';
begin
  select owner_id into v_owner
  from public.safety_text_refs
  where src_table = p_table and src_column = p_column and src_id = p_id
  limit 1;

  -- Explicit per-surface updates: no dynamic SQL on a moderation path.
  if p_table = 'profiles' and p_column = 'bio' then
    update public.profiles set bio = null where id = p_id::uuid;
  elsif p_table = 'profiles' and p_column = 'status_note' then
    update public.profiles set status_note = null, status_expires_at = null where id = p_id::uuid;
  elsif p_table = 'profiles' and p_column = 'display_name' then
    update public.profiles set display_name = null where id = p_id::uuid;
  elsif p_table = 'servers' and p_column = 'description' then
    update public.servers set description = v_placeholder where id = p_id::uuid;
  elsif p_table = 'servers' and p_column = 'name' then
    update public.servers set name = 'Removed space' where id = p_id::uuid;
  elsif p_table = 'channels' and p_column = 'name' then
    update public.channels set name = 'removed-channel' where id = p_id::uuid;
  elsif p_table = 'group_chats' and p_column = 'name' then
    update public.group_chats set name = 'Removed group' where id = p_id::uuid;
  elsif p_table = 'custom_emoji' and p_column = 'name' then
    delete from public.custom_emoji where id = p_id::uuid;
  elsif p_table = 'messages' and p_column = 'content' then
    update public.messages set content = v_placeholder where id = p_id::uuid;
  elsif p_table = 'dm_messages' and p_column = 'content' then
    update public.dm_messages set content = v_placeholder where id = p_id::uuid;
  elsif p_table = 'group_messages' and p_column = 'content' then
    update public.group_messages set content = v_placeholder where id = p_id::uuid;
  elsif p_table = 'notes' and p_column = 'content' then
    update public.notes set content = v_placeholder where id = p_id::uuid;
  else
    return jsonb_build_object('redacted', false, 'reason', 'unsupported surface');
  end if;

  insert into public.moderation_actions
    (action, src_table, src_id, owner_id, category, reason, detail)
  values ('redact_text', p_table, p_id, v_owner, p_category, p_reason,
          jsonb_build_object('column', p_column));

  if p_suspend then
    v_held := public.sentinel_suspend(v_owner, format('Prohibited content (%s)', p_category));
  end if;

  update public.content_flags set state = 'actioned'
   where src_table = p_table and src_column = p_column and src_id = p_id and state = 'open';

  return jsonb_build_object('redacted', true, 'owner', v_owner, 'account_held', v_held);
end;
$$;

-- Service role only. These are enforcement tools, not app features.
do $$
declare f text;
begin
  foreach f in array array[
    'public.sentinel_suspend(uuid, text)',
    'public.sentinel_quarantine_media(text, text, text, text, text, boolean)',
    'public.sentinel_redact_text(text, text, text, text, text, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Credential + schedule.
--
-- The sweep's key is generated by Postgres and kept in Vault: it is never
-- printed, never passed on a command line, and never written into the cron
-- job, which reads it at execution time. `sentinel_check_key` lets the edge
-- function verify a presented key without being able to read it back.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sentinel_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'sentinel_key',
                                'Content sentinel shared secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'sentinel_url') then
    perform vault.create_secret(
      'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/content-sentinel',
      'sentinel_url', 'Content sentinel endpoint');
  end if;
end
$$;

create or replace function public.sentinel_check_key(p_key text)
returns boolean
language sql
security definer
set search_path = public, vault
stable
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'sentinel_key' and decrypted_secret = p_key
  );
$$;

revoke all on function public.sentinel_check_key(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; schedule the sweep manually.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'content-sentinel';
  perform cron.schedule(
    'content-sentinel',
    '0 */5 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
        ),
        body := '{"trigger":"cron","mode":"sweep","limit":250}'::jsonb,
        timeout_milliseconds := 300000
      );
    $job$
  );
end
$$;
