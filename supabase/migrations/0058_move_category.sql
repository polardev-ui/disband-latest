-- 0058_move_category.sql
-- Reorder a category to a 0-based index within its server, mirroring
-- move_channel for channels.

create or replace function public.move_category(p_category_id uuid, p_index int default 0)
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
  select server_id into v_server_id from public.channel_categories where id = p_category_id;
  if v_server_id is null then
    return;
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;

  select array_agg(id order by position, created_at) into v_ids
  from public.channel_categories
  where server_id = v_server_id;

  if v_ids is null then
    v_ids := array[]::uuid[];
  end if;
  v_ids := array_remove(v_ids, p_category_id);
  v_idx := greatest(0, least(coalesce(array_length(v_ids, 1), 0), p_index));
  v_ids := v_ids[1:v_idx] || p_category_id || v_ids[v_idx+1:];

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    update public.channel_categories set position = i - 1 where id = v_ids[i];
  end loop;
end;
$$;

grant execute on function public.move_category(uuid, int) to authenticated;