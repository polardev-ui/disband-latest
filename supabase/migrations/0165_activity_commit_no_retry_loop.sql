-- ---------------------------------------------------------------------------
-- 0165: stop activity_commit's stale-move error from looping
--
-- A move against an out-of-date game revision raised SQLSTATE 40001
-- (serialization_failure). PostgREST treats 40001 as transient and retries
-- the whole transaction, but a stale revision never becomes current, so each
-- such request retried until it timed out. Two stuck requests produced about
-- 100 failed transactions a second, each taking the session's row lock.
--
-- P0001 is not retried. activities.server.ts already answers P0001 with a
-- 409 and now passes this message through.
-- ---------------------------------------------------------------------------

create or replace function public.activity_commit(
  p_id uuid, p_actor uuid, p_revision integer, p_state jsonb,
  p_players jsonb, p_scores jsonb, p_vote jsonb default null, p_close boolean default false
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s activity_sessions; item jsonb;
begin
  select * into s from activity_sessions where id=p_id for update;
  if not found or s.status<>'open' or s.expires_at<=now() then raise exception 'That activity has ended.' using errcode='P0001'; end if;
  if s.revision<>p_revision then raise exception 'The game changed. Refresh and try your move again.' using errcode='P0001'; end if;
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
