-- Account restrictions: graduated moderation beyond platform bans.
-- Staff/owners can restrict individual capabilities without fully banning a user.
-- Restrictions are additive: a user can have multiple restrictions at once.

create type public.account_restriction as enum (
  'join_servers',     -- cannot join or create new servers
  'send_messages',    -- cannot send messages in any channel/DM/group
  'send_friend_requests', -- cannot send friend requests
  'create_groups'     -- cannot create group chats
);

create table public.account_restrictions (
  id         bigint generated always as identity primary key,
  user_id    uuid      not null references public.profiles (id) on delete cascade,
  restriction public.account_restriction not null,
  reason     text,
  applied_by uuid      references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (user_id, restriction)
);

-- Enable RLS
alter table public.account_restrictions enable row level security;

-- Everyone can read their own restrictions (needed for enforcement checks)
create policy "Users can read own restrictions"
  on public.account_restrictions for select
  using (auth.uid () = user_id);

-- Staff and owners can read all restrictions
create policy "Staff can read all restrictions"
  on public.account_restrictions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid () and (show_staff_badge or show_owner_badge)
    )
  );

-- Staff and owners can insert/delete restrictions
create policy "Staff can insert restrictions"
  on public.account_restrictions for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid () and (show_staff_badge or show_owner_badge)
    )
  );

create policy "Staff can delete restrictions"
  on public.account_restrictions for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid () and (show_staff_badge or show_owner_badge)
    )
  );

-- RPC: apply a restriction to a user (staff/owner only)
create or replace function public.apply_restriction(
  p_user_id     uuid,
  p_restriction public.account_restriction,
  p_reason      text default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Only staff/owners can apply restrictions
  if not exists (
    select 1 from public.profiles
    where id = auth.uid () and (show_staff_badge or show_owner_badge)
  ) then
    raise exception 'Only staff members can apply restrictions';
  end if;

  -- Cannot restrict owners
  if exists (
    select 1 from public.profiles
    where id = p_user_id and show_owner_badge
  ) then
    raise exception 'Cannot restrict platform owners';
  end if;

  insert into public.account_restrictions (user_id, restriction, reason, applied_by)
  values (p_user_id, p_restriction, p_reason, auth.uid ())
  on conflict (user_id, restriction) do nothing;
end;
$$;

-- RPC: remove a restriction from a user (staff/owner only)
create or replace function public.remove_restriction(
  p_user_id     uuid,
  p_restriction public.account_restriction
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid () and (show_staff_badge or show_owner_badge)
  ) then
    raise exception 'Only staff members can remove restrictions';
  end if;

  delete from public.account_restrictions
  where user_id = p_user_id and restriction = p_restriction;
end;
$$;

-- RPC: list all restrictions with profile info (staff/owner only)
create or replace function public.list_all_restrictions()
returns table (
  user_id     uuid,
  restriction text,
  reason      text,
  applied_by  uuid,
  created_at  timestamptz,
  username    text,
  display_name text
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid () and (show_staff_badge or show_owner_badge)
  ) then
    raise exception 'Only staff members can list restrictions';
  end if;

  return query
  select
    r.user_id,
    r.restriction::text,
    r.reason,
    r.applied_by,
    r.created_at,
    p.username,
    p.display_name
  from public.account_restrictions r
  join public.profiles p on p.id = r.user_id
  order by r.created_at desc;
end;
$$;
