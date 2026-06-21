-- Platform badges (OWNER / STAFF) — editable only via Supabase dashboard (service role)

alter table public.profiles
  add column if not exists show_owner_badge boolean not null default false;

alter table public.profiles
  add column if not exists show_staff_badge boolean not null default false;

create or replace function public.protect_platform_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (
      old.show_owner_badge is distinct from new.show_owner_badge
      or old.show_staff_badge is distinct from new.show_staff_badge
    ) and auth.uid() is not null then
      new.show_owner_badge := old.show_owner_badge;
      new.show_staff_badge := old.show_staff_badge;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_platform_badges on public.profiles;
create trigger profiles_protect_platform_badges
  before update on public.profiles
  for each row execute function public.protect_platform_badges();
