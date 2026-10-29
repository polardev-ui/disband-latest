-- ---------------------------------------------------------------------------
-- 0181: new accounts join the official space; Catalysts last a month and
-- can be moved between spaces.
--
--   1. Every new account is added to the official Disband space (vanity
--      "disband") with its default role, so there is somewhere to talk from
--      the first minute. Bots and guest accounts are left out, and a failure
--      here can never block a sign-up.
--   2. A Catalyst lasts one month from the day it was bought (or, for a
--      monthly plan credit, placed). Expired ones stop counting at once and
--      are cleared hourly. Catalysts that exist today get a full month from
--      now rather than expiring on the spot.
--   3. transfer_catalyst() moves one of your Catalysts to another space you
--      are in, once it has been on its current space for a week. Moving it
--      starts that week again; it does not change when it expires.
--   4. The official space holds 64 permanent Catalysts.
-- ---------------------------------------------------------------------------

-- 1. Join the official space on sign-up --------------------------------------

create or replace function public.join_official_space_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
  v_role uuid;
begin
  if coalesce(new.is_bot, false) or public.is_anonymous(new.id) then
    return null;
  end if;
  select id into v_server from public.servers
   where lower(vanity_code) = 'disband' and suspended_at is null
   limit 1;
  if v_server is null then return null; end if;
  select id into v_role from public.server_roles
   where server_id = v_server and is_default = true
   limit 1;
  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_server, new.id, 'member', v_role)
  on conflict do nothing;
  return null;
exception when others then
  return null;
end;
$$;
revoke all on function public.join_official_space_on_signup() from public, anon, authenticated;

drop trigger if exists trg_join_official_space on public.profiles;
create trigger trg_join_official_space
  after insert on public.profiles
  for each row execute function public.join_official_space_on_signup();

-- 2. Catalysts expire ---------------------------------------------------------

alter table public.server_catalysts
  add column if not exists expires_at timestamptz,
  add column if not exists placed_at timestamptz;

update public.server_catalysts
   set placed_at = coalesce(placed_at, created_at),
       expires_at = coalesce(expires_at, now() + interval '1 month')
 where source <> 'official';

alter table public.server_catalysts
  alter column placed_at set default now(),
  alter column placed_at set not null;

create index if not exists server_catalysts_expires_idx
  on public.server_catalysts (expires_at)
  where expires_at is not null;

create or replace function public.catalyst_set_terms()
returns trigger
language plpgsql
as $$
begin
  new.placed_at := coalesce(new.placed_at, now());
  if new.source <> 'official' and new.expires_at is null then
    new.expires_at := now() + interval '1 month';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_catalyst_terms on public.server_catalysts;
create trigger trg_catalyst_terms
  before insert on public.server_catalysts
  for each row execute function public.catalyst_set_terms();

-- Expired Catalysts are invisible to every client straight away.
drop policy if exists server_catalysts_read on public.server_catalysts;
create policy server_catalysts_read on public.server_catalysts
  for select to authenticated
  using (expires_at is null or expires_at > now());

-- Level checks count only live Catalysts.
create or replace function public.guild_tag_is_level_three(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::int from public.server_catalysts
           where server_id = p_server_id
             and (expires_at is null or expires_at > now())) >= 6;
$$;

create or replace function public.prune_guild_tag(p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.server_guild_tags where server_id = p_server_id) then
    return;
  end if;
  if (select count(*)::int from public.server_catalysts
       where server_id = p_server_id
         and (expires_at is null or expires_at > now())) < 6 then
    delete from public.server_guild_tags where server_id = p_server_id;
  end if;
end;
$$;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.guard_catalyst_perks()'::regprocedure);
  if position('select count(*) into v_count from public.server_catalysts where server_id = v_server;' in def) = 0 then
    raise exception 'guard_catalyst_perks changed shape';
  end if;
  def := replace(def,
    'select count(*) into v_count from public.server_catalysts where server_id = v_server;',
    'select count(*) into v_count from public.server_catalysts where server_id = v_server and (expires_at is null or expires_at > now());');
  execute def;
end;
$$;

-- Clear expired rows hourly. Deleting fires the existing triggers, so a
-- space that drops below Level 3 loses its guild tag as it would on a
-- withdrawal.
create or replace function public.expire_catalysts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.server_catalysts where expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.expire_catalysts() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('expire-catalysts')
    where exists (select 1 from cron.job where jobname = 'expire-catalysts');
  perform cron.schedule('expire-catalysts', '7 * * * *', 'select public.expire_catalysts()');
end;
$$;

-- 3. Moving a Catalyst --------------------------------------------------------

create or replace function public.transfer_catalyst(p_catalyst_id uuid, p_to_server uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.server_catalysts%rowtype;
  v_movable_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_row from public.server_catalysts
   where id = p_catalyst_id
   for update;
  if not found or v_row.user_id <> auth.uid() then
    raise exception 'That Catalyst isn''t yours to move';
  end if;
  if v_row.source = 'official' then
    raise exception 'That Catalyst can''t be moved';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    raise exception 'That Catalyst has expired';
  end if;
  if v_row.server_id = p_to_server then
    raise exception 'It''s already on that space';
  end if;
  v_movable_at := v_row.placed_at + interval '7 days';
  if v_movable_at > now() then
    raise exception 'You can move this Catalyst from %', to_char(v_movable_at at time zone 'UTC', 'FMDD FMMonth YYYY');
  end if;
  if not exists (
    select 1 from public.server_members where server_id = p_to_server and user_id = auth.uid()
  ) then
    raise exception 'Join that space first';
  end if;
  if exists (select 1 from public.servers where id = p_to_server and suspended_at is not null) then
    raise exception 'That space is suspended';
  end if;

  update public.server_catalysts
     set server_id = p_to_server,
         placed_at = now()
   where id = p_catalyst_id;

  -- The space it left may have dropped below Level 3.
  perform public.prune_guild_tag(v_row.server_id);
  return now() + interval '7 days';
end;
$$;
revoke all on function public.transfer_catalyst(uuid, uuid) from public, anon;
grant execute on function public.transfer_catalyst(uuid, uuid) to authenticated;

-- 4. The official space -------------------------------------------------------

insert into public.server_catalysts (server_id, user_id, source, expires_at, placed_at)
select s.id, s.owner_id, 'official', null, now()
from public.servers s
cross join generate_series(1, 64)
where lower(s.vanity_code) = 'disband'
  and (select count(*) from public.server_catalysts c where c.server_id = s.id and c.source = 'official') = 0;
