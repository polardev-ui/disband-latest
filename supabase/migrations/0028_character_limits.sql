-- Switch from word-based message limits to character-based (4000 max).
-- Increase bio limit from 120 to 190 (DB enforces 230 max; client enforces tier-specific caps).

-- ---------------------------------------------------------------------------
-- Bio length: allow up to 230 characters (tier-specific caps enforced client-side)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 230) not valid;

create or replace function public.enforce_bio_length()
returns trigger
language plpgsql
as $$
begin
  if new.bio is not null and char_length(new.bio) > 230 then
    raise exception 'Bio cannot exceed 190 characters.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Message limits: switch from word count (500) to character count (4000)
-- ---------------------------------------------------------------------------
drop function if exists public.count_words(text);

create or replace function public.enforce_message_char_limit()
returns trigger
language plpgsql
as $$
begin
  if char_length(new.content) > 4000 then
    raise exception 'Messages cannot exceed 4000 characters.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_word_limit on public.messages;
create trigger messages_char_limit
  before insert or update of content on public.messages
  for each row execute function public.enforce_message_char_limit();

drop trigger if exists dm_messages_word_limit on public.dm_messages;
create trigger dm_messages_char_limit
  before insert or update of content on public.dm_messages
  for each row execute function public.enforce_message_char_limit();

drop trigger if exists group_messages_word_limit on public.group_messages;
create trigger group_messages_char_limit
  before insert or update of content on public.group_messages
  for each row execute function public.enforce_message_char_limit();
