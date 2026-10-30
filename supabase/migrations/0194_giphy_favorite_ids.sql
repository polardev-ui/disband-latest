-- ---------------------------------------------------------------------------
-- 0194: one identity per Giphy GIF in favourites.
--
-- Giphy hands back the same GIF under a different URL on every search:
--   https://media0.giphy.com/media/v1.<per-search token>/abc123/giphy.gif
--   https://media4.giphy.com/media/v1.<another token>/abc123/200w.gif
-- so gif_favorite_id (0139) gave it a new id each time. After a reload the
-- picker's results no longer matched what was saved, the stars came back
-- empty, and starring again added a second row instead of finding the first.
--
-- Giphy URLs now key on the GIF id alone (giphy.com/media/abc123). Every
-- other host keeps host + path. The web (`gifFavKey`) and iOS
-- (`GifFavoritesService.key`) use the same rule.
--
-- gif_id is a stored generated column, so existing rows are recomputed by
-- touching them, after dropping any rows that now collide (keep the newest).
-- ---------------------------------------------------------------------------

create or replace function public.gif_favorite_id(p_url text)
returns bigint
language sql
immutable
parallel safe
set search_path = public, extensions, pg_temp
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
  ), c as (
    select regexp_replace(
      value,
      '^(?:media[0-9]*\.|i\.)?giphy\.com/media/(?:v1\.[^/]+/)?([^/]+)/[^/]+$',
      'giphy.com/media/\1'
    ) as value
    from k
  )
  select ('x' || substr(md5(value), 1, 13))::bit(52)::bigint from c;
$$;

delete from public.favorite_gifs a
using public.favorite_gifs b
where a.user_id = b.user_id
  and a.id <> b.id
  and public.gif_favorite_id(a.url) = public.gif_favorite_id(b.url)
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

update public.favorite_gifs
   set url = url
 where gif_id is distinct from public.gif_favorite_id(url);
