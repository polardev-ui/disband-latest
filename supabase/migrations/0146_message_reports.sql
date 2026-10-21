-- ---------------------------------------------------------------------------
-- 0146: user reports + hourly Sentinel review + graduated enforcement
--
-- Any signed-in member can report a message or a profile. The API snapshots
-- the reported content at the moment of the report, so a later edit or delete
-- cannot erase the evidence. Sentinel reviews the queue every hour, while the
-- existing full text/media sweep stays on its five-hour schedule.
--
-- Penalties are deliberately separate from the existing illegal-content path:
--   * a confirmed hate-speech slur is a one-day messaging suspension;
--   * sexual and graphic-violence content is removed and restricted for longer;
--   * apparent illegal material is preserved and escalated, never auto-deleted;
--   * the sixth confirmed violation in a rolling year suspends the account.
--
-- Everything here is service-role only. Reports contain a snapshot of user
-- content, so they are not readable from a client session.
-- ---------------------------------------------------------------------------

create table if not exists public.message_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  target_type       text not null
    constraint message_reports_target_type_check check (target_type in ('message', 'profile')),
  target_surface    text not null
    constraint message_reports_target_surface_check check (target_surface in ('channel', 'dm', 'group', 'profile')),
  target_table      text not null
    constraint message_reports_target_table_check
    check (target_table in ('messages', 'dm_messages', 'group_messages', 'profiles')),
  target_id         uuid not null,
  -- Channel/DM/group id for messages; NULL for a profile report.
  container_id      uuid,
  reported_user_id  uuid references public.profiles (id) on delete set null,
  reason            text not null
    constraint message_reports_reason_check check (reason in (
      'harassment',
      'hate_speech',
      'sexual_content',
      'violence_gore',
      'illegal_content',
      'spam',
      'self_harm',
      'impersonation',
      'other'
    )),
  details           text
    constraint message_reports_details_length check (details is null or char_length(details) <= 1000),
  -- The reported message/profile as it looked when the report was filed.
  -- `{ version, text_fields: [...], media: [...], container_id, created_at }`
  snapshot          jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
    constraint message_reports_status_check check (status in (
      'pending', 'reviewing', 'actioned', 'dismissed', 'needs_review', 'failed'
    )),
  decision          text,
  action            text,
  -- Deliberately not a foreign key: user_violations points back at this row,
  -- and a circular pair of FKs makes retention/deletion harder than it needs
  -- to be. The id is still recorded on both sides.
  violation_id      uuid,
  review_attempts   integer not null default 0,
  last_error        text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists message_reports_queue_idx
  on public.message_reports (status, created_at);
create index if not exists message_reports_reporter_idx
  on public.message_reports (reporter_id, created_at desc);
create index if not exists message_reports_user_idx
  on public.message_reports (reported_user_id, created_at desc);

-- A member can have one open report per target. Once it is actioned or
-- dismissed they may report the same target again if it still exists.
create unique index if not exists message_reports_open_unique
  on public.message_reports (reporter_id, target_type, target_id)
  where status in ('pending', 'reviewing', 'needs_review');

create table if not exists public.user_violations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  report_id   uuid references public.message_reports (id) on delete set null,
  category    text not null
    constraint user_violations_category_check check (category in (
      'harassment', 'hate_speech', 'sexual_content', 'violence_gore',
      'illegal_content', 'spam', 'other'
    )),
  severity    text not null default 'minor'
    constraint user_violations_severity_check check (severity in ('minor', 'serious', 'severe')),
  action      text,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists user_violations_user_idx
  on public.user_violations (user_id, created_at desc);

alter table public.message_reports enable row level security;
alter table public.user_violations enable row level security;
revoke all on public.message_reports from public, anon, authenticated;
revoke all on public.user_violations from public, anon, authenticated;

-- The five-hour sweep keeps working exactly as before; these counters let the
-- status page and the safety email distinguish report work from content work.
alter table public.safety_runs
  add column if not exists reports_scanned integer not null default 0;
alter table public.safety_runs
  add column if not exists reports_actioned integer not null default 0;

-- ---------------------------------------------------------------------------
-- 1. Include multi-attachment URLs in the global media inventory. Before this,
--    only legacy `attachment_url` was scanned; a second image on a message was
--    invisible to the five-hour sweep.
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
  select 'messages', 'attachments', m.id::text, m.author_id, a.att->>'url'
    from public.messages m
    cross join lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
   where a.att->>'url' is not null
  union all
  select 'dm_messages', 'attachment_url', m.id::text, m.author_id, m.attachment_url
    from public.dm_messages m where m.attachment_url is not null
  union all
  select 'dm_messages', 'attachments', m.id::text, m.author_id, a.att->>'url'
    from public.dm_messages m
    cross join lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
   where a.att->>'url' is not null
  union all
  select 'group_messages', 'attachment_url', m.id::text, m.author_id, m.attachment_url
    from public.group_messages m where m.attachment_url is not null
  union all
  select 'group_messages', 'attachments', m.id::text, m.author_id, a.att->>'url'
    from public.group_messages m
    cross join lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
   where a.att->>'url' is not null
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

revoke all on public.safety_media_refs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Keep suspensions working after a ban row already exists, and record the
--    account email so the login gate can also block a signed-out account.
-- ---------------------------------------------------------------------------
create or replace function public.sentinel_suspend(p_user uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new boolean := false;
  v_email text;
begin
  if p_user is null then return false; end if;

  select not exists (
    select 1 from public.platform_bans where user_id = p_user
  ) into v_new;

  select email into v_email from auth.users where id = p_user;

  insert into public.platform_bans (user_id, banned_by, reason, email)
  values (p_user, null, coalesce(p_reason, 'Automated safety enforcement'), v_email)
  on conflict (user_id) do update
    set email = coalesce(public.platform_bans.email, excluded.email);

  -- Only write a moderation action for a genuinely new ban, so a second
  -- report cannot spam the account with duplicate suspension notices.
  if v_new then
    insert into public.moderation_actions (action, src_table, src_id, owner_id, reason)
    values ('suspend_user', 'profiles', p_user::text, p_user, p_reason);
  end if;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Multi-attachment removal. The old function only cleared the legacy
--    single-attachment columns, leaving URLs in the `attachments` array.
-- ---------------------------------------------------------------------------
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

  -- The same URLs can live in the multi-attachment JSON. Remove just the
  -- offending entry and keep the rest of the message intact.
  update public.messages m
     set attachments = coalesce((
       select jsonb_agg(a.att)
       from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' is distinct from p_url
     ), '[]'::jsonb)
   where m.attachments is not null
     and exists (
       select 1 from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' = p_url
     );
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  update public.dm_messages m
     set attachments = coalesce((
       select jsonb_agg(a.att)
       from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' is distinct from p_url
     ), '[]'::jsonb)
   where m.attachments is not null
     and exists (
       select 1 from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' = p_url
     );
  get diagnostics v_n = row_count; v_removed := v_removed + v_n;

  update public.group_messages m
     set attachments = coalesce((
       select jsonb_agg(a.att)
       from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' is distinct from p_url
     ), '[]'::jsonb)
   where m.attachments is not null
     and exists (
       select 1 from jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) as a(att)
       where a.att->>'url' = p_url
     );
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

-- ---------------------------------------------------------------------------
-- 4. Apply one confirmed report decision.
--
-- The edge function decides *whether* something violates the rules (text
-- rules, image classifier, or hash denylist). This function is the single
-- transactional place that removes the content, records the violation, applies
-- the restriction, and escalates a sixth violation into a platform suspension.
-- ---------------------------------------------------------------------------
create or replace function public.sentinel_apply_report_decision(
  p_report_id         uuid,
  p_category          text,
  p_reason            text,
  p_text_field        text default null,
  p_restriction_days  integer default null,
  p_platform_ban      boolean default false,
  p_media_url         text default null,
  p_sha256            text default null,
  p_quarantine_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report            public.message_reports%rowtype;
  v_violation         uuid;
  v_count             integer := 0;
  v_suspended         boolean := false;
  v_restricted_until  timestamptz;
  v_action_parts      text[] := '{}';
  v_quarantine        jsonb;
  v_redact            jsonb;
  v_removed           boolean := false;
begin
  select * into v_report
  from public.message_reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Report % not found', p_report_id;
  end if;

  if v_report.status in ('actioned', 'dismissed') then
    return jsonb_build_object(
      'ok', true,
      'already_handled', true,
      'status', v_report.status
    );
  end if;

  -- Remove only the surface that was confirmed. A report snapshot may contain
  -- several images; the edge function passes the one the classifier flagged.
  if p_media_url is not null then
    v_quarantine := public.sentinel_quarantine_media(
      p_media_url, p_category, p_reason, p_sha256, p_quarantine_key, false
    );
    v_removed := coalesce((v_quarantine->>'references_removed')::integer, 0) > 0;
  elsif p_text_field is not null then
    v_redact := public.sentinel_redact_text(
      v_report.target_table,
      p_text_field,
      v_report.target_id::text,
      p_category,
      p_reason,
      false
    );
    v_removed := coalesce((v_redact->>'redacted')::boolean, false);
  end if;

  if v_removed then
    v_action_parts := array_append(v_action_parts, 'Content removed');
  end if;

  if v_report.reported_user_id is not null then
    insert into public.user_violations
      (user_id, report_id, category, severity, action, reason)
    values (
      v_report.reported_user_id,
      v_report.id,
      p_category,
      case
        when p_platform_ban or p_category = 'illegal_content' then 'severe'
        when p_category in ('hate_speech', 'sexual_content', 'violence_gore', 'harassment') then 'serious'
        else 'minor'
      end,
      'pending',
      p_reason
    )
    returning id into v_violation;

    -- "Over five" means the sixth confirmed violation in a rolling year.
    select count(*) into v_count
    from public.user_violations
    where user_id = v_report.reported_user_id
      and created_at >= now() - interval '365 days';

    if p_platform_ban or v_count > 5 then
      v_suspended := public.sentinel_suspend(
        v_report.reported_user_id,
        format('Repeated or severe rule violations (%s confirmed)', v_count)
      );
      if v_suspended then
        v_action_parts := array_append(v_action_parts, 'Account suspended');
      end if;
    elsif p_restriction_days is not null and p_restriction_days > 0 then
      insert into public.account_restrictions
        (user_id, restriction, reason, applied_by, expires_at)
      values (
        v_report.reported_user_id,
        'send_messages',
        p_reason,
        null,
        now() + make_interval(days => p_restriction_days)
      )
      on conflict (user_id, restriction) do update
        set reason = excluded.reason,
            applied_by = null,
            expires_at = case
              when public.account_restrictions.expires_at is null then null
              else greatest(public.account_restrictions.expires_at, excluded.expires_at)
            end
      returning expires_at into v_restricted_until;

      v_action_parts := array_append(
        v_action_parts,
        format('%s-day messaging suspension', p_restriction_days)
      );
    end if;

    update public.user_violations
      set action = nullif(array_to_string(v_action_parts, '; '), '')
      where id = v_violation;
  end if;

  update public.message_reports
     set status = 'actioned',
         decision = p_category,
         action = nullif(array_to_string(v_action_parts, '; '), ''),
         violation_id = v_violation,
         reviewed_at = now(),
         last_error = null
   where id = v_report.id;

  insert into public.moderation_actions
    (action, src_table, src_id, owner_id, category, reason, detail)
  values (
    'report_action',
    'message_reports',
    v_report.id::text,
    v_report.reported_user_id,
    p_category,
    p_reason,
    jsonb_build_object(
      'violation_id', v_violation,
      'violation_count', v_count,
      'suspended', v_suspended,
      'restricted_until', v_restricted_until,
      'content_removed', v_removed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'report_id', v_report.id,
    'violation_id', v_violation,
    'violation_count', v_count,
    'suspended', v_suspended,
    'restricted_until', v_restricted_until,
    'content_removed', v_removed,
    'action', nullif(array_to_string(v_action_parts, '; '), '')
  );
end;
$$;

revoke all on function public.sentinel_apply_report_decision(
  uuid, text, text, text, integer, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.sentinel_apply_report_decision(
  uuid, text, text, text, integer, boolean, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Hourly report review. The existing five-hour sweep is untouched; this
--    runs at :15 past every hour so the two jobs do not compete for the edge
--    function's CPU.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; schedule the report review manually.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'content-sentinel-reports';
  perform cron.schedule(
    'content-sentinel-reports',
    '15 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sentinel_key')
        ),
        body := '{"trigger":"cron","mode":"reports","limit":40}'::jsonb,
        timeout_milliseconds := 300000
      );
    $job$
  );
end
$$;
