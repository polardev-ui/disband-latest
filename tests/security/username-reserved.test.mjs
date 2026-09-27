/**
 * Reserved mention-token usernames (migration 0104).
 *
 * `@everyone` is a broadcast ping, not a person. This applies 0104 alone
 * against a bare database (the migration is self-contained by design) and
 * asserts the exact-match semantics: the tokens are refused in every
 * spelling, near-misses stay legal, the slur list still works, and live
 * squatters are renamed off the tokens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const EVERYONE = '00000000-0000-4000-8000-000000000071';
const HERE = '00000000-0000-4000-8000-000000000072';
const ALICE = '00000000-0000-4000-8000-000000000001';

test('reserved mention tokens are refused; near-misses stay legal; squatters renamed', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.profiles(id uuid primary key, username text);
      insert into public.profiles(id, username) values
      ('${EVERYONE}', 'everyone'),
      ('${HERE}', 'here'),
      ('${ALICE}', 'alice');`);
    await db.exec(await readFile('supabase/migrations/0104_reserve_mention_usernames.sql', 'utf8'));

    const blocked = async (name) =>
      (await db.query('select public.username_contains_blocked_word($1) as b', [name])).rows[0].b;

    // The tokens, in every spelling and punctuation.
    for (const name of ['everyone', 'EVERYONE', 'Everyone', 'every.one', 'every_one', 'here', 'HERE']) {
      assert.equal(await blocked(name), true, name);
    }
    // Near-misses collide with no mention token and stay legal.
    for (const name of ['everyone123', 'everyonesfriend', 'where', 'there', 'hereafter', 'rachel', 'alice', 'tether']) {
      assert.equal(await blocked(name), false, name);
    }
    // The pre-existing slur list still works.
    assert.equal(await blocked('hitler'), true);
    assert.equal(await blocked('nazi_fan'), true);
    assert.equal(await blocked('hello'), false);
    assert.equal(await blocked(''), false);

    // Squatters were renamed off the tokens; everyone else untouched.
    const rows = (await db.query('select id, username from public.profiles')).rows;
    const byId = new Map(rows.map((r) => [r.id, r.username]));
    assert.match(byId.get(EVERYONE), /^everyone_[0-9a-f]{6}/);
    assert.match(byId.get(HERE), /^here_[0-9a-f]{6}/);
    assert.equal(byId.get(ALICE), 'alice');
    assert.equal(rows.filter((r) => ['everyone', 'here'].includes(r.username.toLowerCase())).length, 0);

    // Idempotent: a second run changes nothing and errors nowhere.
    await db.exec(await readFile('supabase/migrations/0104_reserve_mention_usernames.sql', 'utf8'));
    const again = (await db.query('select username from public.profiles where id = $1', [EVERYONE])).rows[0].username;
    assert.equal(again, byId.get(EVERYONE));
  } finally {
    await db.close();
  }
});
