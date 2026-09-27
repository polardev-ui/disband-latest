-- ---------------------------------------------------------------------------
-- 0104: Reserve the @everyone / @here username tokens
--
-- `@everyone` is a broadcast ping, not a person: parseMentions skips the
-- token and isValidMentionToken treats it as "the whole server". A human
-- holding username `everyone` (or `here`) breaks that contract — the owner
-- cannot ping their server without mentioning (and confusing) the squatter.
--
-- What this does:
--   * `username_contains_blocked_word` now also rejects the exact cleaned
--     tokens `everyone` and `here`. Exact-match only: `everyone123`,
--     `where`, `there` stay legal because no mention token collides with
--     them. Cleaning strips punctuation first, so `every.one` and `EVERYONE`
--     are caught too.
--   * One edit covers every enforcement path, because all of them funnel
--     through this function: the profiles update trigger (via
--     assert_username_available -> assert_username_policy), complete_signup,
--     and check_username_available (client availability check). The error
--     stays 'That username is not allowed.', which the client's existing
--     profileErrors mapping already renders.
--   * The two live squatters are renamed to `<name>_<id-md5-6>` (unique by
--     construction loop), freeing the tokens. Login is by email, so no one
--     is locked out; old @-mentions of them simply stop resolving.
--
-- Deliberately NOT touched: resolve_username's derivation loop. Its callers
-- all pass through assert paths that now reject, so a derived reserved name
-- fails loudly instead of being assigned.
--
-- Self-contained on purpose (full function body, no cross-migration deps)
-- so tests/security/username-reserved.test.mjs can apply this file alone
-- against a bare database.
-- ---------------------------------------------------------------------------

create or replace function public.username_contains_blocked_word(p_username text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_clean text;
  v_word text;
  v_blocked text[] := array[
    'nigger', 'nigga', 'benjaminnetanyahu', 'childporn', 'racist', 'hitler',
    'faggot', 'fag', 'kike', 'chink', 'spic', 'wetback', 'pedophile', 'pedo',
    'nazi', 'nazis', 'holocaust', 'terrorist', 'isis', 'rape', 'rapist',
    'incest', 'bestiality', 'loli', 'lolicon', 'shota', 'shotacon'
  ];
  -- System mention tokens. Exact match only (after cleaning): the token
  -- `@everyone` collides with username `everyone`, but `everyone123` and
  -- `where` collide with nothing and stay legal.
  v_reserved text[] := array['everyone', 'here'];
begin
  v_clean := regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9]', '', 'g');
  if v_clean = '' then
    return false;
  end if;
  if v_clean = any (v_reserved) then
    return true;
  end if;
  if v_clean = 'cp' or v_clean like '%cp%' and length(v_clean) <= 4 then
    return true;
  end if;
  foreach v_word in array v_blocked loop
    if position(v_word in v_clean) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Free the tokens held by existing squatters. Suffix is derived from the row
-- id (stable across retries) with a collision loop for paranoia.
do $$
declare
  r record;
  v_new text;
  v_i integer;
begin
  for r in
    select id from public.profiles
    where lower(username) in ('everyone', 'here')
  loop
    v_i := 0;
    loop
      v_new := lower((select username from public.profiles where id = r.id))
        || '_' || substr(md5(r.id::text), 1, 6)
        || case when v_i = 0 then '' else v_i::text end;
      exit when not exists (
        select 1 from public.profiles
        where lower(username) = v_new and id <> r.id
      );
      v_i := v_i + 1;
    end loop;
    update public.profiles set username = v_new where id = r.id;
  end loop;
end;
$$;
