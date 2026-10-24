-- ---------------------------------------------------------------------------
-- 0168: short invite codes again
--
-- generate_invite_code was edited outside migrations on 30 September to
-- return 32 hex characters, so every space created since has an invite link
-- like /server/4824dc3dc0d5e061fb58be1048c3de35 that reads like an ID and
-- that no client recognised as an invite. Codes go back to 7 characters of
-- a-z, A-Z and 0-9, now drawn from gen_random_bytes rather than random().
--
-- Spaces holding a long code get a short one. The long code stays valid as
-- an alias, because those links are already out in people's messages.
-- ---------------------------------------------------------------------------

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  chars constant text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  bytes bytea := extensions.gen_random_bytes(7);
  result text := '';
  i int;
begin
  for i in 0..6 loop
    result := result || substr(chars, (get_byte(bytes, i) % 62) + 1, 1);
  end loop;
  return result;
end;
$$;

create table if not exists public.server_invite_aliases (
  code text primary key,
  server_id uuid not null references public.servers(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists server_invite_aliases_server_idx on public.server_invite_aliases (server_id);

alter table public.server_invite_aliases enable row level security;
revoke all on public.server_invite_aliases from anon, authenticated;

-- A fresh short code that clashes with no invite, custom code or alias.
create or replace function public.unused_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
begin
  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.servers where invite_code = v_code or lower(vanity_code) = lower(v_code))
      and not exists (select 1 from public.server_invite_aliases where code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.unused_invite_code() from public, anon, authenticated;

insert into public.server_invite_aliases (code, server_id)
select invite_code, id from public.servers where length(invite_code) <> 7
on conflict (code) do nothing;

do $$
declare
  r record;
begin
  for r in select id from public.servers where length(invite_code) <> 7 loop
    update public.servers set invite_code = public.unused_invite_code() where id = r.id;
  end loop;
end;
$$;

create or replace function public.get_server_by_invite(p_code text)
returns table(id uuid, name text, description text, icon_url text, banner_url text, invite_code text, member_count bigint, verified boolean, partner boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.platform_rate_limit('invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    s.verified,
    s.partner
  from public.servers s
  where s.invite_code = p_code
     or (s.vanity_code is not null and lower(s.vanity_code) = lower(p_code))
     or s.id = (select a.server_id from public.server_invite_aliases a where a.code = p_code);
end;
$$;

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
     or (vanity_code is not null and lower(vanity_code) = lower(p_code))
     or id = (select a.server_id from public.server_invite_aliases a where a.code = p_code);
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
