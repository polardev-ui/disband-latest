-- ---------------------------------------------------------------------------
-- 0106: Official DM threads are read-only for recipients
--
-- A broadcast DM must read like a locked announcement channel, not a
-- conversation: the recipient cannot reply, react-bait, or otherwise write
-- into the thread. Enforcement is RLS, not a client check (see 0100): a
-- modified client walks past UI gates, so the database itself refuses the
-- row.
--
-- Shape of the fix, and why:
--   * RESTRICTIVE, not permissive. Postgres ORs the WITH CHECK of every
--     permissive INSERT policy, so a permissive "not an official thread"
--     policy would evaluate true for every normal DM and grant write access
--     to threads the membership check would otherwise refuse. Restrictive
--     policies are ANDed, so this one can only ever deny. (This is the same
--     trap 0100 documents for restricted_users_no_write.)
--   * The only author allowed past it in an official thread is the official
--     account itself, so the owner can still answer from the @disband
--     session while every recipient is read-only. broadcast_send is a
--     security definer owned by postgres, so its writes bypass RLS exactly
--     like the notification fanout always has.
--   * official_account_id() is granted to authenticated here. It was
--     service-role-only, which would make this policy explode with
--     "permission denied" on every DM write instead of evaluating. The id it
--     returns is public information anyway — it sits in plain sight on every
--     official thread row.
--
-- Applying this file contends with Supabase Realtime the same way 0100 did
-- (AccessExclusiveLock on dm_messages vs the realtime workers). Every
-- statement is idempotent, so on a 40P01 deadlock just retry: lock_timeout
-- makes our own attempt yield fast instead of stalling, and a retry lands
-- in a quiet moment.
-- ---------------------------------------------------------------------------

set lock_timeout = '5s';

grant execute on function public.official_account_id() to authenticated;

drop policy if exists official_dm_readonly on public.dm_messages;
create policy official_dm_readonly on public.dm_messages as restrictive
  for insert to authenticated
  with check (
    author_id = public.official_account_id()
    or not exists (
      select 1 from public.dm_threads t
      where t.id = thread_id
        and (t.user_a = public.official_account_id() or t.user_b = public.official_account_id())
    )
  );
