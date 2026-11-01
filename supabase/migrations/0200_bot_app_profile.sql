-- ---------------------------------------------------------------------------
-- 0200: what the developer portal's General Information and Bot pages edit.
--
--   description   shown on the install page and the bot's profile, ≤ 400
--   tags          up to 5, each ≤ 20, for finding bots later
--   terms_url, privacy_url   https links shown when someone adds the bot
--   is_public     off: only the developer can add the bot to spaces
-- ---------------------------------------------------------------------------

alter table public.bots
  add column if not exists description text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists terms_url text,
  add column if not exists privacy_url text,
  add column if not exists is_public boolean not null default true;

alter table public.bots drop constraint if exists bots_description_len;
alter table public.bots add constraint bots_description_len
  check (description is null or char_length(description) <= 400);

alter table public.bots drop constraint if exists bots_tags_shape;
alter table public.bots add constraint bots_tags_shape
  check (cardinality(tags) <= 5 and array_to_string(tags, '') !~ '[,]');

alter table public.bots drop constraint if exists bots_links_https;
alter table public.bots add constraint bots_links_https
  check ((terms_url is null or terms_url ~ '^https://') and (privacy_url is null or privacy_url ~ '^https://'));
