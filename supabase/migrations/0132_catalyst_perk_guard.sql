-- 0132_catalyst_perk_guard.sql
-- Enforce Catalyst perks in the database, not only in the UI.
--
-- Until now the level gates lived only in the client, so anyone could set a
-- vanity link or a gradient role with a direct API call. The tiers are now:
--
--   Level 1 (1+ catalysts): +50 custom emoji slots
--   Level 2 (3+ catalysts): custom vanity invite link, role icons
--   Level 3 (6+ catalysts): gradient role styling
--
-- Only *changes* are checked. A vanity link claimed back when Level 1 granted
-- it keeps working; clearing a perk is always allowed. The service role and
-- the dashboard (no authenticated user) are not restricted.

create or replace function public.guard_catalyst_perks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- Separate statements: PL/pgSQL resolves every NEW field in an expression,
  -- so one CASE naming both would fail on whichever table lacks the column.
  if tg_table_name = 'servers' then
    v_server := new.id;
  else
    v_server := new.server_id;
  end if;
  select count(*) into v_count from public.server_catalysts where server_id = v_server;

  if tg_table_name = 'servers' then
    if new.vanity_code is not null
       and new.vanity_code is distinct from (case when tg_op = 'UPDATE' then old.vanity_code end)
       and v_count < 3 then
      raise exception 'A custom invite link needs Catalyst Level 2.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- server_roles
  if new.icon is not null
     and new.icon is distinct from (case when tg_op = 'UPDATE' then old.icon end) then
    if v_count < 3 then
      raise exception 'Role icons need Catalyst Level 2.' using errcode = 'P0001';
    end if;
    -- An emoji (a few code points) or an uploaded image; nothing else renders.
    if not (
      (new.icon ~ '^https://' and char_length(new.icon) <= 1024)
      or (new.icon !~ '^[a-z]+:' and char_length(new.icon) <= 16)
    ) then
      raise exception 'A role icon must be an emoji or an uploaded image.' using errcode = 'P0001';
    end if;
  end if;

  if ((new.gradient_to is not null
       and new.gradient_to is distinct from (case when tg_op = 'UPDATE' then old.gradient_to end))
      or (coalesce(new.gradient_animated, false)
       and new.gradient_animated is distinct from (case when tg_op = 'UPDATE' then old.gradient_animated end)))
     and v_count < 6 then
    raise exception 'Gradient roles need Catalyst Level 3.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_catalyst_perks() from public, anon, authenticated;

drop trigger if exists trg_servers_catalyst_perks on public.servers;
create trigger trg_servers_catalyst_perks
  before insert or update of vanity_code on public.servers
  for each row execute function public.guard_catalyst_perks();

drop trigger if exists trg_server_roles_catalyst_perks on public.server_roles;
create trigger trg_server_roles_catalyst_perks
  before insert or update of icon, gradient_to, gradient_animated on public.server_roles
  for each row execute function public.guard_catalyst_perks();
