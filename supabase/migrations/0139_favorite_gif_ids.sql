-- ---------------------------------------------------------------------------
-- 0139: stable numeric identity for favourite GIFs
--
-- Favourites used to be matched only by URL. The same GIF can arrive with
-- different tracking params, a `www.` host, or different capitalisation, and
-- the mobile and web clients could not agree on which row they meant.
--
-- gif_id is a deterministic 52-bit number derived from the canonical URL
-- (host lowercased, `www.` dropped, query/fragment dropped, trailing slashes
-- dropped). It is stable across clients, fits a JavaScript safe integer, and
-- becomes the conflict key for starring the same GIF again. The old URL
-- unique index stays as a guard against duplicate spellings of the same URL.
-- ---------------------------------------------------------------------------

create or replace function public.gif_favorite_id(p_url text)
returns bigint
language sql
immutable
parallel safe
as $$
  with u as (
    select regexp_replace(trim(coalesce(p_url, '')), '[?#].*$', '') as value
  ), k as (
    select case
      when value ~* '^https?://' then
        regexp_replace(lower(substring(value from '^https?://([^/]+)')), '^www\.', '')
        || coalesce(regexp_replace(substring(value from '^https?://[^/]+(.*)$'), '/+$', ''), '')
      else regexp_replace(value, '/+$', '')
    end as value
    from u
  )
  select ('x' || substr(md5(value), 1, 13))::bit(52)::bigint from k;
$$;

alter table public.favorite_gifs
  add column if not exists gif_id bigint
  generated always as (public.gif_favorite_id(url)) stored;

-- Existing rows can contain two URL spellings of the same GIF. Keep the most
-- recent row before the unique index goes on.
delete from public.favorite_gifs a
using public.favorite_gifs b
where a.user_id = b.user_id
  and a.gif_id = b.gif_id
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists favorite_gifs_user_gif_idx
  on public.favorite_gifs (user_id, gif_id);
