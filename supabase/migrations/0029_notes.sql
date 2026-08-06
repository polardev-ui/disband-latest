-- Notes — a private, single-user space for thoughts, images, videos, GIFs and files.
--
-- Shaped like dm_messages/group_messages so the existing chat surface can render
-- it unchanged, but scoped to exactly one owner: every policy is `auth.uid() =
-- user_id`, with no sharing path of any kind. Notes are kept until the owner
-- deletes them (or the account goes away, via the cascade).

create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '',
  attachment_url  text,
  attachment_type text check (attachment_type is null or attachment_type in ('image', 'video', 'gif', 'file')),
  attachment_key  text,
  attachment_name text,
  attachment_size bigint,
  reply_to_id     uuid references public.notes (id) on delete set null,
  pinned          boolean not null default false,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  -- a note is only meaningful if it says something or carries a file
  constraint notes_not_empty check (content <> '' or attachment_url is not null)
);

create index if not exists notes_user_created_idx
  on public.notes (user_id, created_at desc);

-- Partial index: the pinned list is read on its own and is tiny next to the
-- full note history.
create index if not exists notes_user_pinned_idx
  on public.notes (user_id, created_at desc)
  where pinned;

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only, no exceptions
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keep replies inside the owner's own notes
--
-- RLS already stops you reading someone else's note, but reply_to_id is a raw
-- FK: without this an attacker who guessed a uuid could still write a row
-- pointing at it. Enforced as a trigger because CHECK cannot subquery.
-- ---------------------------------------------------------------------------
create or replace function public.notes_guard_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reply_to_id is not null then
    if not exists (
      select 1 from public.notes
      where id = new.reply_to_id and user_id = new.user_id
    ) then
      raise exception 'A note can only reply to one of your own notes.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_guard_reply_trigger on public.notes;
create trigger notes_guard_reply_trigger
  before insert or update of reply_to_id on public.notes
  for each row execute function public.notes_guard_reply();

-- ---------------------------------------------------------------------------
-- Realtime — so notes stay in sync across the user's own devices
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Reactions may reference a note.
--
-- The UI does not offer reactions on notes today (there is nobody to react
-- with), but message_reactions.context_type is a shared enum-style check and
-- widening it now keeps the client's MessageContext union and the database in
-- agreement.
-- ---------------------------------------------------------------------------
alter table public.message_reactions
  drop constraint if exists message_reactions_context_type_check;
alter table public.message_reactions
  add constraint message_reactions_context_type_check
  check (context_type in ('channel', 'dm', 'group', 'notes'));
