-- Public rooms are explicitly created separately from private conversations.
alter table public.activity_sessions drop constraint activity_sessions_kind_check;
alter table public.activity_sessions add constraint activity_sessions_kind_check check (kind in ('wordle','eight_ball','trivia','would_you_rather','four_in_row','reversi'));
alter table public.activity_scores drop constraint activity_scores_kind_check;
alter table public.activity_scores add constraint activity_scores_kind_check check (kind in ('wordle','eight_ball','trivia','would_you_rather','four_in_row','reversi'));
alter table public.activity_sessions drop constraint activity_sessions_scope_check;
alter table public.activity_sessions add constraint activity_sessions_scope_check check (scope in ('channel','dm','group','public'));
alter table public.activity_sessions add column revision integer not null default 0;
create index activity_sessions_public_idx on public.activity_sessions(created_at desc) where scope='public' and status='open';
grant all on public.activity_sessions, public.activity_players, public.activity_votes, public.activity_scores to service_role;

-- Lock the room to enforce capacity even when several players join at once.
create function public.activity_join(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s activity_sessions; n integer;
begin
  select * into s from activity_sessions where id=p_id for update;
  if not found or s.status<>'open' or s.expires_at<=now() then raise exception 'That activity has ended.' using errcode='P0001'; end if;
  if exists(select 1 from activity_players where activity_id=p_id and user_id=p_user) then return; end if;
  select count(*) into n from activity_players where activity_id=p_id;
  if n >= (case when s.kind in ('four_in_row','reversi') then 2 else 20 end) then raise exception 'This room is full. You can watch the game.' using errcode='P0001'; end if;
  insert into activity_players(activity_id,user_id) values(p_id,p_user);
  update activity_sessions set revision=revision+1 where id=p_id;
end;
$$;

-- The API computes rules. The database makes the whole move indivisible and
-- rejects stale requests. No browser role can supply state or score deltas.
create function public.activity_commit(
  p_id uuid, p_actor uuid, p_revision integer, p_state jsonb,
  p_players jsonb, p_scores jsonb, p_vote jsonb default null, p_close boolean default false
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s activity_sessions; item jsonb;
begin
  select * into s from activity_sessions where id=p_id for update;
  if not found or s.status<>'open' or s.expires_at<=now() then raise exception 'That activity has ended.' using errcode='P0001'; end if;
  if s.revision<>p_revision then raise exception 'The game changed. Refresh and try your move again.' using errcode='40001'; end if;
  if not exists(select 1 from activity_players where activity_id=p_id and user_id=p_actor) then raise exception 'Join the activity before you play.' using errcode='P0001'; end if;
  update activity_sessions set state=p_state, revision=revision+1, status=case when p_close then 'closed' else 'open' end where id=p_id;
  for item in select value from jsonb_array_elements(p_players) loop
    update activity_players set state=item->'state',score=(item->>'score')::integer,finished=(item->>'finished')::boolean,won=(item->>'won')::boolean,
      finished_at=case when (item->>'finished')::boolean then now() else null end
    where activity_id=p_id and user_id=(item->>'userId')::uuid;
    if not found then raise exception 'Player not in room.'; end if;
  end loop;
  if p_vote is not null then
    insert into activity_votes(activity_id,user_id,prompt_index,choice) values(p_id,p_actor,(p_vote->>'index')::integer,(p_vote->>'choice')::integer);
  end if;
  for item in select value from jsonb_array_elements(p_scores) loop
    if not exists(select 1 from activity_players where activity_id=p_id and user_id=(item->>'userId')::uuid) then raise exception 'Player not in room.'; end if;
    insert into activity_scores(user_id,kind,plays,wins,points,best)
    values((item->>'userId')::uuid,s.kind,(item->>'plays')::integer,(item->>'wins')::integer,(item->>'points')::integer,(item->>'best')::integer)
    on conflict(user_id,kind) do update set
      plays=activity_scores.plays+excluded.plays,wins=activity_scores.wins+excluded.wins,
      points=activity_scores.points+excluded.points,best=greatest(activity_scores.best,excluded.best),updated_at=now();
  end loop;
end;
$$;
revoke all on function public.activity_join(uuid,uuid) from public,anon,authenticated;
revoke all on function public.activity_commit(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.activity_join(uuid,uuid) to service_role;
grant execute on function public.activity_commit(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;

alter table public.activity_sessions add column rematch_id uuid references public.activity_sessions(id) on delete set null;
create function public.activity_rematch(p_id uuid,p_actor uuid,p_state jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s activity_sessions; next_id uuid;
begin
 select * into s from activity_sessions where id=p_id for update;
 if not found or s.kind not in ('four_in_row','reversi') then raise exception 'That match is unavailable.' using errcode='P0001'; end if;
 if s.status='open' and s.expires_at>now() then raise exception 'Finish this match first.' using errcode='P0001'; end if;
 if not exists(select 1 from activity_players where activity_id=p_id and user_id=p_actor) then raise exception 'Only players can request a rematch.' using errcode='P0001'; end if;
 if s.rematch_id is not null then return s.rematch_id; end if;
 insert into activity_sessions(kind,scope,scope_id,host_id,state,expires_at) values(s.kind,s.scope,s.scope_id,p_actor,p_state,now()+interval '2 hours') returning id into next_id;
 insert into activity_players(activity_id,user_id) values(next_id,p_actor);
 update activity_sessions set rematch_id=next_id where id=p_id;
 return next_id;
end;
$$;
revoke all on function public.activity_rematch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.activity_rematch(uuid,uuid,jsonb) to service_role;
