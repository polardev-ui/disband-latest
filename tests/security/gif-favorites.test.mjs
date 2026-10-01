/**
 * Favorite GIFs (migration 0113): users see and touch only their own rows,
 * and the (user, url) pair is unique so re-starring is idempotent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';

async function asRole(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  await db.exec(`set request.jwt.claim.role = '${role}'`);
  if (sub) await db.exec(`set request.jwt.claim.sub = '${sub}'`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`reset request.jwt.claim.sub`);
    await db.exec(`reset request.jwt.claim.role`);
  }
}

async function tryAsRole(db, role, sub, fn) {
  try {
    await asRole(db, role, sub, fn);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error.message ?? error) };
  }
}

test('favorite GIFs are private per user and idempotent per url', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key);
      alter table public.profiles enable row level security;
      create policy profiles_read on public.profiles for select to authenticated using (true);
      grant usage on schema public to authenticated, service_role;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to service_role;`);
    await db.query(`insert into public.profiles (id) values ($1), ($2)`, [ALICE, BOB]);
    await db.exec(await readFile('supabase/migrations/0113_favorite_gifs.sql', 'utf8'));

    const star = (who, url) => tryAsRole(db, 'authenticated', who, () =>
      db.query(`insert into public.favorite_gifs (user_id, url, title) values ($1, $2, 'funny')`, [who, url]));

    assert.equal((await star(ALICE, 'https://x.test/a.gif')).ok, true);
    // Re-starring the same URL conflicts on (user_id, url), not silently dupes.
    assert.equal((await star(ALICE, 'https://x.test/a.gif')).ok, false);
    // Same URL by someone else is a separate row.
    assert.equal((await star(BOB, 'https://x.test/a.gif')).ok, true);
    // Overlong URLs never reach the table.
    assert.equal((await star(ALICE, 'https://x.test/' + 'a'.repeat(2000))).ok, false);

    // Reads are scoped: Alice sees one row, Bob sees one, anon sees none.
    const aliceRows = await asRole(db, 'authenticated', ALICE, () =>
      db.query(`select url from public.favorite_gifs`));
    assert.deepEqual(aliceRows.rows.map((r) => r.url), ['https://x.test/a.gif']);
    const anonRows = await tryAsRole(db, 'anon', null, () =>
      db.query(`select url from public.favorite_gifs`));
    assert.equal(anonRows.ok, false);

    // Delete-your-own works; deleting someone else's does not (and reports
    // nothing either way — the row count tells the story).
    await asRole(db, 'authenticated', BOB, () =>
      db.query(`delete from public.favorite_gifs where url = 'https://x.test/a.gif'`));
    const after = await db.query(`select count(*) as n from public.favorite_gifs`);
    assert.equal(Number(after.rows[0].n), 1, "bob's delete must not touch alice's row");
  } finally {
    await db.close();
  }
});
