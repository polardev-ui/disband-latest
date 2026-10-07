-- ---------------------------------------------------------------------------
-- 0119: Private notes on other people's profiles
--
-- "Note (only you can see it)" on the profile card. One row per
-- (author, subject); the author is the only reader and writer, enforced by RLS
-- rather than by the client. Not shared with the subject, not visible to staff
-- tooling through the API, and gone when either account is deleted.
--
-- 256 characters: enough for "met at the meetup, likes synth stuff", short
-- enough that nobody uses it as a document store.
-- ---------------------------------------------------------------------------

create table if not exists public.user_notes (
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 256),
  updated_at timestamptz not null default now(),
  primary key (author_id, subject_id),
  check (author_id <> subject_id)
);

alter table public.user_notes enable row level security;

drop policy if exists "notes are private to their author" on public.user_notes;
create policy "notes are private to their author" on public.user_notes
  for all to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

revoke all on public.user_notes from anon;
grant select, insert, update, delete on public.user_notes to authenticated;
