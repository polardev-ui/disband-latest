-- Category CRUD + channel move/reorder for manage_channels holders.

-- ---------------------------------------------------------------------------
-- create_category
-- ---------------------------------------------------------------------------
create or replace function public.create_category(p_server_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pos int;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Category name is required';
  end if;
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.channel_categories where server_id = p_server_id;

  insert into public.channel_categories (server_id, name, position)
  values (p_server_id, btrim(p_name), v_pos)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rename_category
-- ---------------------------------------------------------------------------
create or replace function public.rename_category(p_category_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Category name is required';
  end if;
  select server_id into v_server_id from public.channel_categories where id = p_category_id;
  if v_server_id is null then
    raise exception 'Category not found';
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;
  update public.channel_categories set name = btrim(p_name) where id = p_category_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_category (channels inside become uncategorized via FK set null)
-- ---------------------------------------------------------------------------
create or replace function public.delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
begin
  select server_id into v_server_id from public.channel_categories where id = p_category_id;
  if v_server_id is null then
    return;
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;
  delete from public.channel_categories where id = p_category_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_channel: move a channel into a category (or uncategorized) and reorder
-- it to a 0-based index within that category.
-- ---------------------------------------------------------------------------
create or replace function public.move_channel(p_channel_id uuid, p_category_id uuid, p_index int default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_ids uuid[];
  i int;
  v_idx int;
begin
  select server_id into v_server_id from public.channels where id = p_channel_id;
  if v_server_id is null then
    return;
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;

  update public.channels set category_id = p_category_id
  where id = p_channel_id and category_id is distinct from p_category_id;

  select array_agg(id order by position, created_at) into v_ids
  from public.channels
  where server_id = v_server_id and category_id is not distinct from p_category_id;

  if v_ids is null then
    v_ids := array[]::uuid[];
  end if;
  v_ids := array_remove(v_ids, p_channel_id);
  v_idx := greatest(0, least(coalesce(array_length(v_ids, 1), 0), p_index));
  v_ids := v_ids[1:v_idx] || p_channel_id || v_ids[v_idx+1:];

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    update public.channels set position = i - 1 where id = v_ids[i];
  end loop;
end;
$$;

grant execute on function public.create_category(uuid, text) to authenticated;
grant execute on function public.rename_category(uuid, text) to authenticated;
grant execute on function public.delete_category(uuid) to authenticated;
grant execute on function public.move_channel(uuid, uuid, int) to authenticated;
