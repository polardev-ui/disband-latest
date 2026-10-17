-- ---------------------------------------------------------------------------
-- 0133: Fix guard_official_identity silently cancelling every profile delete
--
-- The trigger function ended with `return new;` unconditionally. In a BEFORE
-- DELETE trigger NEW is NULL, and PostgreSQL treats a NULL return from a
-- BEFORE DELETE trigger as "skip this row quietly" — no error, no delete.
--
-- Effect: every path that removes a profile row did nothing.
--   * the FK cascade from auth.users -> profiles (account purge cron,
--     anonymous-account purge, admin user deletion) left orphaned profiles,
--     some with bio/avatar/banner still intact;
--   * any direct `delete from profiles` matched zero rows.
--
-- Fix: return old for DELETE (the row being removed), new otherwise. The
-- official-account protections are unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.guard_official_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_end_user boolean :=
    coalesce(current_setting('request.jwt.claim.role', true), '')
    in ('authenticated', 'anon');
begin
  -- Nobody but the system may claim the name.
  if new.username is not null
     and lower(new.username) = 'disband'
     and not coalesce(new.is_bot, false) then
    raise exception 'That username is reserved for official Disband use.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if old.username is not null
       and lower(old.username) = 'disband'
       and v_is_end_user then
      raise exception 'The official Disband account cannot be deleted.'
        using errcode = '42501';
    end if;
    -- NEW is null on DELETE; returning it would silently cancel the delete.
    return old;
  end if;

  -- The official account itself is frozen for ordinary sessions.
  if tg_op = 'UPDATE'
     and old.username is not null
     and lower(old.username) = 'disband'
     and v_is_end_user then
    raise exception 'The official Disband account cannot be modified.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
