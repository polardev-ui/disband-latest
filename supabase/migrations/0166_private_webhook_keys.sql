-- ---------------------------------------------------------------------------
-- 0166: keep webhook server keys out of members' reach
--
-- servers.webhook_key is half of every webhook URL, and every member of a
-- space could read it with the rest of the servers row. The key now lives in
-- a table only the service role can read, and the old column is emptied once
-- the API reads from here (it stays, because shipped clients select servers.*).
-- ---------------------------------------------------------------------------

create table if not exists public.server_webhook_keys (
  server_id uuid primary key references public.servers(id) on delete cascade,
  webhook_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.server_webhook_keys enable row level security;
revoke all on public.server_webhook_keys from anon, authenticated;

insert into public.server_webhook_keys (server_id, webhook_key)
select id, webhook_key from public.servers where webhook_key is not null
on conflict (server_id) do nothing;

create or replace function public.ensure_server_webhook_key(p_server_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select webhook_key into v_key from public.server_webhook_keys where server_id = p_server_id;
  if v_key is not null then return v_key; end if;
  if not exists (select 1 from public.servers where id = p_server_id) then return null; end if;
  loop
    v_key := lpad((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
    begin
      insert into public.server_webhook_keys (server_id, webhook_key)
      values (p_server_id, v_key)
      on conflict (server_id) do nothing;
      exit;
    exception when unique_violation then
      -- key collision with another space: draw again
    end;
  end loop;
  select webhook_key into v_key from public.server_webhook_keys where server_id = p_server_id;
  return v_key;
end;
$$;

revoke all on function public.ensure_server_webhook_key(uuid) from public, anon, authenticated;

-- The execute/edit/delete functions matched s.webhook_key; point them at the
-- private table without restating their bodies.
do $$
declare
  f regprocedure;
  def text;
begin
  foreach f in array array[
    'public.webhook_execute(text,text,text,text,text,jsonb,boolean,boolean)'::regprocedure,
    'public.webhook_edit_message(text,text,bigint,text,boolean,jsonb,boolean)'::regprocedure,
    'public.webhook_delete_message(text,text,bigint)'::regprocedure
  ] loop
    def := pg_get_functiondef(f);
    if position('s.webhook_key = p_server_key' in def) = 0 then
      raise exception 'Unexpected body for %', f;
    end if;
    def := replace(def, 's.webhook_key = p_server_key',
      'exists (select 1 from public.server_webhook_keys k where k.server_id = s.id and k.webhook_key = p_server_key)');
    execute def;
  end loop;
end;
$$;
