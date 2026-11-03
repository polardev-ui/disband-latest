-- Reviews can be hidden instead of deleted. A hidden review is left out for
-- everyone except its author, who still sees it as posted, so it isn't
-- simply reposted. Hiding is set from the database (SQL editor / service
-- role); authors can't clear it, and can't delete a hidden review to post a
-- fresh one, since they have one review per account and editing keeps it
-- hidden. Unhide with: update app_reviews set hidden_at = null where id = …

alter table public.app_reviews
  add column if not exists hidden_at timestamptz;

drop policy if exists app_reviews_read on public.app_reviews;
create policy app_reviews_read on public.app_reviews
  for select using (hidden_at is null or auth.uid() = user_id);

drop policy if exists app_reviews_delete_own on public.app_reviews;
create policy app_reviews_delete_own on public.app_reviews
  for delete using (auth.uid() = user_id and hidden_at is null);

-- Authors edit their review through the API; only the database itself
-- (no signed-in user) may change hidden_at.
create or replace function public.app_reviews_keep_hidden()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.hidden_at := old.hidden_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_reviews_keep_hidden on public.app_reviews;
create trigger trg_app_reviews_keep_hidden
  before update on public.app_reviews
  for each row execute function public.app_reviews_keep_hidden();
