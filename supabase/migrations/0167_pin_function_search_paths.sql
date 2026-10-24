-- ---------------------------------------------------------------------------
-- 0167: pin search_path on the functions that still inherited the caller's
--
-- A function without its own search_path resolves names through whatever
-- path the session has, so a lookalike object earlier in that path could be
-- picked up instead. public and extensions cover everything these use today.
-- ---------------------------------------------------------------------------

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_subscription_plan', 'touch_maintenance', 'count_words',
        'username_contains_blocked_word', 'null_default_member_role',
        'enforce_bio_length', 'canonical_email', 'protect_evidence_retention',
        'enforce_server_sound_limit', 'set_updated_at',
        'guard_message_trusted_fields', 'enforce_message_word_limit',
        'gif_favorite_id', 'generate_snowflake', 'is_valid_bot_scopes'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f);
  end loop;
end;
$$;
