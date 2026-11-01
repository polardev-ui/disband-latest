-- The live enforce_bio_length() still capped bios at 120 characters (0028's
-- 230 never took), while the app offers 190 on free and up to 230 on paid
-- plans. A 154-character bio was refused with "cannot exceed 190".
-- Plan caps stay in the app; the database holds the overall ceiling.

create or replace function public.enforce_bio_length()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if new.bio is not null and char_length(new.bio) > 230 then
    raise exception 'Bio cannot exceed 230 characters.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 230) not valid;
