-- Text channel names use dashes for spaces, as on Discord: "hall of fame"
-- becomes "hall-of-fame", so it can be linked as #hall-of-fame. The apps
-- reshape the name as it's typed (channelSlug in src/lib/utils.ts); this
-- holds every client to it, older app versions included, and fixes the
-- channels already named with spaces. Voice channels and stages keep their
-- spaces. Case, emoji and everything else are left alone.

create or replace function public.channel_name_dashes(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(regexp_replace(btrim(p_name), '\s+', '-', 'g'), '-{2,}', '-', 'g'), '-');
$$;

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
  -- A name that was only spaces and dashes keeps what it had rather than
  -- becoming empty; the create/rename functions already refuse a blank one.
  if v_name <> '' then new.name := v_name; end if;
  return new;
end;
$$;

drop trigger if exists trg_channels_text_name_dashes on public.channels;
create trigger trg_channels_text_name_dashes
  before insert or update of name, type on public.channels
  for each row execute function public.channels_text_name_dashes();

update public.channels
set name = public.channel_name_dashes(name)
where type = 'text'
  and public.channel_name_dashes(name) <> ''
  and public.channel_name_dashes(name) <> name;
