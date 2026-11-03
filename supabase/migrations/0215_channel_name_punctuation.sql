-- Text channel names drop ASCII punctuation, as on Discord: "promo!" is
-- #promo and "!!-trading-rules-*must-read*" is #trading-rules-must-read, so
-- every channel can be linked with #name and no name sets off formatting.
-- Letters, numbers, - and _, emoji and other Unicode (decorations like ⸝ or
-- ・) stay. Builds on 0214's dashes; matches channelSlug in src/lib/utils.ts.

create or replace function public.channel_name_dashes(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(btrim(p_name), '[!"#$%&''()*+,./:;<=>?@\[\\\]^`{|}~]', '', 'g'),
        '\s+', '-', 'g'),
      '-{2,}', '-', 'g'),
    '-');
$$;

-- A name with nothing left (only punctuation) is refused rather than saved
-- as it was.
create or replace function public.channels_text_name_dashes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  if new.type <> 'text' then return new; end if;
  v_name := public.channel_name_dashes(new.name);
  if v_name = '' then
    raise exception 'Channel names need at least one letter, number or emoji.' using errcode = 'P0001';
  end if;
  new.name := v_name;
  return new;
end;
$$;

update public.channels
set name = public.channel_name_dashes(name)
where type = 'text'
  and public.channel_name_dashes(name) <> ''
  and public.channel_name_dashes(name) <> name;
