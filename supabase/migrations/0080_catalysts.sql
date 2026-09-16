-- 0080_catalysts.sql
-- Catalysts: Disband's answer to Discord Boosts.
--
-- Aero subscribers get 4 catalyst credits per calendar month (grants are
-- derived client-side from subscription + this table, not stored). Spending
-- a credit writes one row to `server_catalysts`; the server's level is the
-- row count and unlocks perks server-wide:
--
--   Level 1 (1+ catalysts): custom vanity invite code (`servers.vanity_code`)
--   Level 2 (3+ catalysts): +50 custom emoji slots for the whole server
--   Level 3 (6+ catalysts): animated gradient role styling
--
-- Rows stack (no unique constraint): one subscriber's 4 monthly credits can
-- take a server to Level 2 alone. Withdrawing deletes a row and can drop the
-- level — perks re-lock.
--
-- `servers.vanity_code` is globally unique when set; `join_server_by_invite`
-- is redefined below to accept it alongside the generated invite_code.
--
-- `server_roles.gradient_to` + `gradient_animated` back the Level 3 perk:
-- roles render from `color` to `gradient_to`, shimmering when animated.

create table if not exists public.server_catalysts (
  id        uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists server_catalysts_server_idx
  on public.server_catalysts (server_id);
create index if not exists server_catalysts_user_month_idx
  on public.server_catalysts (user_id, created_at);

alter table public.servers
  add column if not exists vanity_code text;

-- Case-insensitive uniqueness without a second index: store lowercase,
-- compare lower(). Partial index so nulls stay out of the way.
create unique index if not exists servers_vanity_code_uidx
  on public.servers (lower(vanity_code))
  where vanity_code is not null;

alter table public.server_roles
  add column if not exists gradient_to text,
  add column if not exists gradient_animated boolean not null default false;

alter table public.server_catalysts enable row level security;

-- Counts are public by design (level badges, progress bars). Insert/delete
-- are own-rows-only; monthly caps and Aero eligibility are enforced by the
-- app (see src/lib/catalysts.ts). RLS guarantees nobody can spend or pull
-- another user's catalysts.
create policy server_catalysts_read on public.server_catalysts
  for select to authenticated using (true);
create policy server_catalysts_insert_own on public.server_catalysts
  for insert to authenticated with check (user_id = auth.uid());
create policy server_catalysts_delete_own on public.server_catalysts
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.server_catalysts from public, anon, authenticated;
grant select, insert, delete on public.server_catalysts to authenticated;

-- Join by vanity as well as generated code. Vanity is stored lowercase;
-- compare lower() both sides so `Disband.gg/My-Server` just works.
create or replace function public.join_server_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server public.servers%rowtype;
  v_role uuid;
  v_already boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.ensure_user_profile();

  select * into v_server from public.servers
  where invite_code = p_code
     or (vanity_code is not null and lower(vanity_code) = lower(p_code));
  if not found then raise exception 'Invalid invite code'; end if;

  if exists (select 1 from public.server_bans where server_id = v_server.id and user_id = auth.uid()) then
    raise exception 'You are banned from this server';
  end if;

  v_already := exists (
    select 1 from public.server_members where server_id = v_server.id and user_id = auth.uid()
  );
  if v_already then return v_server.id; end if;

  select id into v_role from public.server_roles
  where server_id = v_server.id and is_default = true limit 1;

  insert into public.server_members (server_id, user_id, role, role_id)
  values (v_server.id, auth.uid(), 'member', v_role);

  return v_server.id;
end;
$$;
