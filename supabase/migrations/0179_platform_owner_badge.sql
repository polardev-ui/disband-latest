-- The owner is whoever holds the 'owner' badge. show_owner_badge is also set
-- on other accounts for older admin tools, so it can't decide who the owner is.
create or replace function public.is_platform_owner(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_badges where user_id = p_user and badge_key = 'owner');
$$;

create or replace function public.list_platform_team()
returns table (user_id uuid, username text, display_name text, avatar_url text, roles text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_manager(auth.uid()) then
    raise exception 'Only Disband managers can view the team';
  end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_url,
    array_remove(array[
      case when public.is_platform_owner(p.id) then 'owner' end,
      case when exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'manager') then 'manager' end,
      case when p.show_staff_badge or exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'staff') then 'staff' end,
      case when exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key = 'moderator') then 'moderator' end
    ], null)
  from public.profiles p
  where p.show_staff_badge
     or exists (select 1 from public.user_badges b where b.user_id = p.id and b.badge_key in ('owner', 'manager', 'staff', 'moderator'))
  order by public.is_platform_owner(p.id) desc, lower(coalesce(p.display_name, p.username));
end;
$$;
