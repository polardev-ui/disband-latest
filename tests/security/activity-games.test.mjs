import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  initialBoard,
  legalBoardMoves,
  moveBoard,
  reversiFlips,
} from "../../src/lib/activity-board.ts";

test("Four in a Row enforces turns, gravity, full columns and finished games", () => {
  const original = initialBoard("four_in_row");
  assert.throws(() => moveBoard("four_in_row", original, 2, 0), /turn/);
  for (const move of [-1, 7, 0.5, NaN])
    assert.throws(() => moveBoard("four_in_row", original, 1, move), /legal/);
  let state = original;
  for (let i = 0; i < 6; i++)
    state = moveBoard("four_in_row", state, state.turn, 0);
  assert.equal(
    original.cells.filter(Boolean).length,
    0,
    "rules do not mutate the previous board",
  );
  assert.equal(state.cells[35], 1);
  assert.equal(state.cells[0], 2);
  assert.throws(() => moveBoard("four_in_row", state, state.turn, 0), /legal/);
  for (const sequence of [
    [0, 1, 0, 1, 0, 1, 0],
    [0, 0, 1, 1, 2, 2, 3],
    [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3],
  ]) {
    state = initialBoard("four_in_row");
    for (const col of sequence)
      state = moveBoard("four_in_row", state, state.turn, col);
    assert.equal(state.winner, 1);
    assert.deepEqual(legalBoardMoves("four_in_row", state), []);
    assert.throws(() => moveBoard("four_in_row", state, 1, 6), /finished/);
  }
});

test("Reversi brackets in every direction and never wraps across an edge", () => {
  assert.deepEqual(
    legalBoardMoves("reversi", initialBoard("reversi")),
    [19, 26, 37, 44],
  );
  const state = moveBoard("reversi", initialBoard("reversi"), 1, 19);
  assert.equal(state.cells[27], 1);
  assert.equal(state.cells.filter((v) => v === 1).length, 4);
  const cells = Array(64).fill(0);
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    cells[(3 + dr) * 8 + 3 + dc] = 2;
    cells[(3 + 2 * dr) * 8 + 3 + 2 * dc] = 1;
  }
  assert.equal(reversiFlips(cells, 27, 1).length, 8);
  const edge = Array(64).fill(0);
  edge[8] = 2;
  edge[9] = 1;
  assert.deepEqual(reversiFlips(edge, 7, 1), []);
});

test("Reversi automatically passes a blocked opponent and completes a full game", () => {
  const cells = Array(64).fill(1);
  cells[0] = 0;
  cells[1] = 2;
  cells[16] = 0;
  cells[17] = 2;
  const next = moveBoard(
    "reversi",
    { ...initialBoard("reversi"), cells },
    1,
    0,
  );
  assert.equal(next.passed, true);
  assert.equal(next.turn, 1);
  assert.equal(next.winner, null);
  const ended = moveBoard("reversi", next, 1, 16);
  assert.equal(ended.winner, 1);
  let state = initialBoard("reversi"),
    moves = 0;
  while (state.winner === null) {
    const legal = legalBoardMoves("reversi", state);
    assert.ok(legal.length);
    state = moveBoard("reversi", state, state.turn, legal[0]);
    assert.ok(++moves <= 60);
  }
  assert.ok([0, 1, 2].includes(state.winner));
});

const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const c = "00000000-0000-0000-0000-000000000003";
test("real SQL room transactions: capacity, stale moves, atomic scores, shared rematches and private access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create table profiles(id uuid primary key);
      create table messages(attachment_type text);create table dm_messages(attachment_type text);create table group_messages(attachment_type text);`);
    for (const name of [
      "0151_activities.sql",
      "0152_passkey_replay_guard.sql",
      "0153_multiplayer_activities.sql",
    ]) {
      await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    }
    for (const id of [a, b, c]) {
      await db.query("insert into profiles values($1)", [id]);
      await db.query("insert into auth.users values($1)", [id]);
    }
    const room = (
      await db.query(
        "insert into activity_sessions(kind,scope,scope_id,host_id,state) values('four_in_row','public',$1,$1,$2) returning id",
        [a, JSON.stringify(initialBoard("four_in_row"))],
      )
    ).rows[0].id;
    await db.query("select activity_join($1,$2)", [room, a]);
    const joins = await Promise.allSettled([
      db.query("select activity_join($1,$2)", [room, b]),
      db.query("select activity_join($1,$2)", [room, c]),
    ]);
    assert.equal(joins.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(
      joins.find((r) => r.status === "rejected").reason.message,
      /full/,
    );
    await db.query("select activity_join($1,$2)", [room, a]); // repeat join is idempotent
    let state = initialBoard("four_in_row"),
      revision = 2;
    const commit = (
      actor,
      rev,
      board,
      players = [],
      scores = [],
      vote = null,
      close = false,
    ) =>
      db.query("select activity_commit($1,$2,$3,$4,$5,$6,$7,$8)", [
        room,
        actor,
        rev,
        JSON.stringify(board),
        JSON.stringify(players),
        JSON.stringify(scores),
        vote ? JSON.stringify(vote) : null,
        close,
      ]);
    await assert.rejects(commit(c, revision, state), /Join/);
    for (const col of [0, 1, 0, 1, 0, 1, 0]) {
      const actor = state.turn === 1 ? a : b;
      state = moveBoard("four_in_row", state, state.turn, col);
      const close = state.winner !== null;
      const players = close
        ? [a, b].map((userId, i) => ({
            userId,
            state: {},
            score: i === 0 ? 100 : 0,
            finished: true,
            won: i === 0,
          }))
        : [];
      const scores = close
        ? [a, b].map((userId, i) => ({
            userId,
            plays: 1,
            wins: i === 0 ? 1 : 0,
            points: i === 0 ? 100 : 0,
            best: i === 0 ? 100 : 0,
          }))
        : [];
      await commit(actor, revision, state, players, scores, null, close);
      await assert.rejects(
        commit(actor, revision, state, players, scores, null, close),
        close ? /ended/ : /changed/,
      );
      revision++;
    }
    const scores = (
      await db.query(
        "select user_id,plays,wins,points from activity_scores order by user_id",
      )
    ).rows;
    assert.deepEqual(scores, [
      { user_id: a, plays: 1, wins: 1, points: 100 },
      { user_id: b, plays: 1, wins: 0, points: 0 },
    ]);
    const rematches = await Promise.all(
      [a, b].map((id) =>
        db.query("select activity_rematch($1,$2,$3) id", [
          room,
          id,
          JSON.stringify(initialBoard("four_in_row")),
        ]),
      ),
    );
    assert.equal(rematches[0].rows[0].id, rematches[1].rows[0].id);
    await assert.rejects(
      db.query("select activity_rematch($1,$2,$3)", [room, c, "{}"]),
      /Only players/,
    );
    const nextRoom = rematches[0].rows[0].id;
    await assert.rejects(
      db.query("select activity_commit($1,$2,0,'{}','[]',$3,null,true)", [
        nextRoom,
        a,
        JSON.stringify([
          { userId: c, plays: 1, wins: 1, points: 999, best: 999 },
        ]),
      ]),
      /Player not/,
    );
    const unchanged = (
      await db.query(
        "select revision,status,state from activity_sessions where id=$1",
        [nextRoom],
      )
    ).rows[0];
    assert.equal(unchanged.revision, 0);
    assert.equal(unchanged.status, "open");
    assert.deepEqual(
      unchanged.state,
      initialBoard("four_in_row"),
      "failed score update rolls back board and status",
    );
    for (const role of ["anon", "authenticated"]) {
      for (const table of [
        "activity_sessions",
        "activity_players",
        "activity_scores",
        "activity_votes",
        "passkey_mfa_uses",
      ]) {
        assert.equal(
          (
            await db.query("select has_table_privilege($1,$2,'SELECT') ok", [
              role,
              table,
            ])
          ).rows[0].ok,
          false,
        );
      }
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'activity_join(uuid,uuid)','EXECUTE') ok",
            [role],
          )
        ).rows[0].ok,
        false,
      );
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'activity_commit(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,boolean)','EXECUTE') ok",
            [role],
          )
        ).rows[0].ok,
        false,
      );
    }
    await db.query(
      "insert into passkey_mfa_uses(session_id,user_id) values($1,$2)",
      [c, a],
    );
    await assert.rejects(
      db.query(
        "insert into passkey_mfa_uses(session_id,user_id) values($1,$2)",
        [c, a],
      ),
      /duplicate key/,
    );
  } finally {
    await db.close();
  }
});
